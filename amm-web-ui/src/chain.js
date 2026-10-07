import { JsonRpcProvider, Network, Contract, Interface } from "ethers";
import { FACTORY_ABI, AMM_ABI, ERC20_ABI } from "./contracts/abis";
import {
  CHAIN_ID,
  RPC_URLS,
  FACTORY_ADDRESS,
  START_BLOCK,
  FALLBACK_LOOKBACK_BLOCKS,
} from "./config";

const ammInterface = new Interface(AMM_ABI);
const sepolia = Network.from(CHAIN_ID);

// ---------------------------------------------------------------------------
// Read provider: the first public RPC that answers. Used for every read, so
// the page works for visitors with no wallet installed.
// ---------------------------------------------------------------------------
let providerPromise = null;

export function getReadProvider() {
  if (!providerPromise) {
    providerPromise = (async () => {
      for (const url of RPC_URLS) {
        try {
          const provider = new JsonRpcProvider(url, sepolia, {
            staticNetwork: sepolia,
            batchMaxCount: 1,
          });
          await provider.getBlockNumber();
          return provider;
        } catch {
          // try the next endpoint
        }
      }
      providerPromise = null;
      throw new Error("Couldn't reach the Sepolia network. Check your connection and reload.");
    })();
  }
  return providerPromise;
}

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------
async function readToken(provider, address) {
  const token = new Contract(address, ERC20_ABI, provider);
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  return { address, symbol, decimals: Number(decimals) };
}

export async function readReserves(provider, pairAddress) {
  const amm = new Contract(pairAddress, AMM_ABI, provider);
  const [reserveA, reserveB, lpSupply] = await Promise.all([
    amm.reserveA(),
    amm.reserveB(),
    amm.totalSupply(),
  ]);
  return { reserveA, reserveB, lpSupply };
}

export async function loadPools(provider) {
  const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
  const count = Number(await factory.allPairsLength());

  const pools = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const pairAddress = await factory.allPairs(i);
      const amm = new Contract(pairAddress, AMM_ABI, provider);
      const [addrA, addrB] = await Promise.all([amm.token0(), amm.token1()]);
      const [tokenA, tokenB, reserves] = await Promise.all([
        readToken(provider, addrA),
        readToken(provider, addrB),
        readReserves(provider, pairAddress),
      ]);
      return { pairAddress, tokenA, tokenB, ...reserves };
    })
  );
  return pools;
}

// ---------------------------------------------------------------------------
// Event history. Public RPCs cap how many blocks one eth_getLogs call may
// cover, so the range is chunked, fetched a few chunks at a time, and any
// chunk the RPC rejects is split in half and retried.
// ---------------------------------------------------------------------------
const CHUNK = 9_000;
const PARALLEL = 4;

async function getLogsAdaptive(provider, address, from, to) {
  try {
    return await provider.getLogs({ address, fromBlock: from, toBlock: to });
  } catch (err) {
    if (to - from < 500) throw err;
    const mid = Math.floor((from + to) / 2);
    const left = await getLogsAdaptive(provider, address, from, mid);
    const right = await getLogsAdaptive(provider, address, mid + 1, to);
    return left.concat(right);
  }
}

function parseLog(log) {
  let parsed;
  try {
    parsed = ammInterface.parseLog(log);
  } catch {
    return null;
  }
  if (!parsed || !["Swap", "Deposit", "Redeem"].includes(parsed.name)) return null;
  return {
    kind: parsed.name,
    args: parsed.args,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.index,
  };
}

/** Fetch AMM events in [fromBlock, latest]. Returns { events, scannedTo }. */
export async function loadEvents(provider, pairAddress, fromBlock) {
  const latest = await provider.getBlockNumber();
  const start =
    fromBlock ?? START_BLOCK ?? Math.max(0, latest - FALLBACK_LOOKBACK_BLOCKS);
  if (start > latest) return { events: [], scannedTo: latest };

  const ranges = [];
  for (let from = start; from <= latest; from += CHUNK) {
    ranges.push([from, Math.min(from + CHUNK - 1, latest)]);
  }

  const logs = [];
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const batch = ranges.slice(i, i + PARALLEL);
    const results = await Promise.all(
      batch.map(([from, to]) => getLogsAdaptive(provider, pairAddress, from, to))
    );
    results.forEach((r) => logs.push(...r));
  }

  const events = logs
    .map(parseLog)
    .filter(Boolean)
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

  return { events, scannedTo: latest };
}

/** Timestamps (seconds) for a handful of blocks, keyed by block number. */
export async function loadBlockTimes(provider, blockNumbers) {
  const unique = [...new Set(blockNumbers)];
  const blocks = await Promise.all(unique.map((n) => provider.getBlock(n).catch(() => null)));
  const times = {};
  blocks.forEach((b, i) => {
    if (b) times[unique[i]] = b.timestamp;
  });
  return times;
}
