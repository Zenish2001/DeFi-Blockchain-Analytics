import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, formatUnits } from "ethers";
import { AMM_ABI, ERC20_ABI } from "./contracts/abis";
import { getReadProvider, loadPools, readReserves, loadEvents, loadBlockTimes } from "./chain";
import { CHAIN_ID_HEX, EXPLORER, REPO_URL, AUTHOR_URL } from "./config";
import { toNumber, fmtAmount, fmtPrice, shortAddress, timeAgo } from "./format";
import CurveChart from "./CurveChart";
import PriceChart from "./PriceChart";
import TradePanel from "./TradePanel";

const hasWallet = typeof window !== "undefined" && Boolean(window.ethereum);

export default function App() {
  const [pools, setPools] = useState([]);
  const [poolIndex, setPoolIndex] = useState(0);
  const [poolState, setPoolState] = useState({ loading: true, error: "" });
  const [history, setHistory] = useState({ loading: true, error: "", events: [], scannedTo: null });
  const [blockTimes, setBlockTimes] = useState({});
  const [wallet, setWallet] = useState({ account: null, onSepolia: true });
  const [balances, setBalances] = useState(null);
  const [preview, setPreview] = useState(null);

  const pool = pools[poolIndex] ?? null;
  const pairAddress = pool?.pairAddress;

  // --- Pools (read-only, no wallet needed) ---------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const provider = await getReadProvider();
        const list = await loadPools(provider);
        if (cancelled) return;
        setPools(list);
        setPoolState({ loading: false, error: list.length ? "" : "The factory has no pools yet." });
      } catch (err) {
        console.error(err);
        if (!cancelled) setPoolState({ loading: false, error: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Event history for the selected pool ---------------------------------
  useEffect(() => {
    if (!pairAddress) return;
    let cancelled = false;
    setHistory({ loading: true, error: "", events: [], scannedTo: null });
    (async () => {
      try {
        const provider = await getReadProvider();
        const { events, scannedTo } = await loadEvents(provider, pairAddress);
        if (!cancelled) setHistory({ loading: false, error: "", events, scannedTo });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setHistory({
            loading: false,
            error: "Couldn't load the pool's history from the network. Reload to try again.",
            events: [],
            scannedTo: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pairAddress]);

  const recent = useMemo(() => history.events.slice(-6).reverse(), [history.events]);

  useEffect(() => {
    const missing = recent.map((e) => e.blockNumber).filter((n) => !(n in blockTimes));
    if (missing.length === 0) return;
    getReadProvider()
      .then((p) => loadBlockTimes(p, missing))
      .then((t) => setBlockTimes((prev) => ({ ...prev, ...t })))
      .catch(() => {});
  }, [recent, blockTimes]);

  // --- Wallet ---------------------------------------------------------------
  const syncWallet = useCallback(async (accounts) => {
    if (!hasWallet) return;
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    setWallet({ account: accounts?.[0] ?? null, onSepolia: chainId === CHAIN_ID_HEX });
  }, []);

  useEffect(() => {
    if (!hasWallet) return;
    // eth_accounts never opens a popup; it only reports an existing connection.
    const resync = () =>
      window.ethereum.request({ method: "eth_accounts" }).then(syncWallet).catch(() => {});
    resync();
    window.ethereum.on?.("accountsChanged", syncWallet);
    window.ethereum.on?.("chainChanged", resync);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", syncWallet);
      window.ethereum.removeListener?.("chainChanged", resync);
    };
  }, [syncWallet]);

  async function switchToSepolia() {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  }

  async function connectWallet() {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== CHAIN_ID_HEX) await switchToSepolia();
    await syncWallet(accounts);
  }

  const loadBalances = useCallback(async () => {
    if (!wallet.account || !wallet.onSepolia || !pool) {
      setBalances(null);
      return;
    }
    const provider = await getReadProvider();
    const a = new Contract(pool.tokenA.address, ERC20_ABI, provider);
    const b = new Contract(pool.tokenB.address, ERC20_ABI, provider);
    const lp = new Contract(pool.pairAddress, AMM_ABI, provider);
    const [balA, balB, balLp] = await Promise.all([
      a.balanceOf(wallet.account),
      b.balanceOf(wallet.account),
      lp.balanceOf(wallet.account),
    ]);
    setBalances({ a: balA, b: balB, lp: balLp });
  }, [wallet.account, wallet.onSepolia, pool]);

  useEffect(() => {
    loadBalances().catch((err) => console.error(err));
  }, [loadBalances]);

  // --- After a transaction: re-read reserves, new events, balances ----------
  async function refreshAfterTx() {
    if (!pool) return;
    const provider = await getReadProvider();
    const reserves = await readReserves(provider, pool.pairAddress);
    setPools((prev) => prev.map((p, i) => (i === poolIndex ? { ...p, ...reserves } : p)));
    if (history.scannedTo != null) {
      const { events, scannedTo } = await loadEvents(
        provider,
        pool.pairAddress,
        history.scannedTo + 1
      );
      setHistory((prev) => ({ ...prev, events: prev.events.concat(events), scannedTo }));
    }
  }

  async function getSigner() {
    const provider = new BrowserProvider(window.ethereum);
    return provider.getSigner();
  }

  // --- Derived numbers ------------------------------------------------------
  const view = useMemo(() => {
    if (!pool) return null;
    const rA = toNumber(pool.reserveA, pool.tokenA.decimals);
    const rB = toNumber(pool.reserveB, pool.tokenB.decimals);
    return { rA, rB, price: rA > 0 ? rB / rA : NaN, lpSupply: toNumber(pool.lpSupply) };
  }, [pool]);

  const swapPrices = useMemo(() => {
    if (!pool) return [];
    return history.events
      .filter((e) => e.kind === "Swap")
      .map((e) => {
        const a = toNumber(e.args.reserveA, pool.tokenA.decimals);
        const b = toNumber(e.args.reserveB, pool.tokenB.decimals);
        return a > 0 ? b / a : NaN;
      })
      .filter(Number.isFinite);
  }, [history.events, pool]);

  const swapCount = swapPrices.length;

  return (
    <div className="page">
      <header className="site-header">
        <a className="wordmark" href="/">SimpleAMM</a>
        <nav className="header-links" aria-label="Project links">
          <a href={REPO_URL} target="_blank" rel="noreferrer">Code on GitHub</a>
          {pairAddress && (
            <a href={`${EXPLORER}/address/${pairAddress}`} target="_blank" rel="noreferrer">
              Contract on Etherscan
            </a>
          )}
        </nav>
      </header>

      <main>
        <section className="intro">
          <h1>A token exchange I built from scratch in Solidity.</h1>
          <p>
            SimpleAMM is an automated market maker in the style of Uniswap v2, running live on the
            Sepolia test network. Everything on this page is read straight from the contract, so
            you don't need a wallet to look around. Type an amount in the trade panel to see how
            it would move the pool.
          </p>
        </section>

        {poolState.loading && <p className="notice">Reading the pool from Sepolia…</p>}
        {poolState.error && <p className="notice notice-error">{poolState.error}</p>}

        {pool && view && (
          <>
            {pools.length > 1 && (
              <div className="pool-picker">
                <label htmlFor="pool">Pool</label>
                <select
                  id="pool"
                  value={poolIndex}
                  onChange={(e) => {
                    setPoolIndex(Number(e.target.value));
                    setPreview(null);
                  }}
                >
                  {pools.map((p, i) => (
                    <option key={p.pairAddress} value={i}>
                      {p.tokenA.symbol} / {p.tokenB.symbol}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <section className="hero-grid">
              <div className="panel chart-panel">
                <div className="panel-head">
                  <h2>The pool right now</h2>
                  <p className="panel-sub">
                    The curve is every balance the pool is allowed to move to. The dot is where it
                    sits.
                  </p>
                </div>
                <CurveChart
                  reserveA={view.rA}
                  reserveB={view.rB}
                  symbolA={pool.tokenA.symbol}
                  symbolB={pool.tokenB.symbol}
                  preview={preview}
                />
                <dl className="facts">
                  <div>
                    <dt>Price of 1 {pool.tokenA.symbol}</dt>
                    <dd>
                      {fmtPrice(view.price)} {pool.tokenB.symbol}
                    </dd>
                  </div>
                  <div>
                    <dt>Swaps recorded</dt>
                    <dd>
                      {history.loading
                        ? "Counting…"
                        : history.error
                          ? "Unavailable"
                          : swapCount.toLocaleString("en-US")}
                    </dd>
                  </div>
                  <div>
                    <dt>Fee per swap</dt>
                    <dd>0.30%</dd>
                  </div>
                  <div>
                    <dt>LP tokens issued</dt>
                    <dd>{fmtAmount(view.lpSupply)}</dd>
                  </div>
                </dl>
              </div>

              <TradePanel
                pool={pool}
                hasWallet={hasWallet}
                wallet={wallet}
                balances={balances}
                onConnect={connectWallet}
                onSwitchNetwork={switchToSepolia}
                getSigner={getSigner}
                onPoolChanged={refreshAfterTx}
                onBalancesChanged={loadBalances}
                onPreview={setPreview}
              />
            </section>

            <section className="lower-grid">
              <div className="panel">
                <div className="panel-head">
                  <h2>Price after each swap</h2>
                  <p className="panel-sub">
                    {pool.tokenB.symbol} per {pool.tokenA.symbol}, rebuilt from the contract's Swap
                    event logs.
                  </p>
                </div>
                {history.loading ? (
                  <p className="empty">Reading swap history from the chain…</p>
                ) : history.error ? (
                  <p className="empty empty-error">{history.error}</p>
                ) : (
                  <PriceChart
                    prices={swapPrices}
                    symbolA={pool.tokenA.symbol}
                    symbolB={pool.tokenB.symbol}
                  />
                )}
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>Recent activity</h2>
                  <p className="panel-sub">The latest trades and liquidity changes on this pool.</p>
                </div>
                {history.loading ? (
                  <p className="empty">Loading…</p>
                ) : history.error ? (
                  <p className="empty empty-error">{history.error}</p>
                ) : recent.length === 0 ? (
                  <p className="empty">Nothing yet. The first trade made here will show up in this list.</p>
                ) : (
                  <ul className="activity">
                    {recent.map((e) => (
                      <li key={`${e.txHash}-${e.logIndex}`}>
                        <span className="activity-what">{describe(e, pool)}</span>
                        <span className="activity-meta">
                          <span className="address">{shortAddress(e.args[0])}</span>
                          {blockTimes[e.blockNumber] && (
                            <span>{timeAgo(blockTimes[e.blockNumber])}</span>
                          )}
                          <a href={`${EXPLORER}/tx/${e.txHash}`} target="_blank" rel="noreferrer">
                            View transaction
                          </a>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="explainer">
              <h2>How the price is set</h2>
              <p>
                The pool holds two tokens and keeps the product of their balances constant:
                x × y = k. A swap adds one token and takes out the other, so the pool slides along
                the curve, and the slope where it lands is the new price. Each swap pays a 0.30% fee
                that stays in the pool, so k grows a little with every trade and liquidity providers
                collect it when they withdraw.
              </p>
              <p>
                The contracts are tested with Hardhat at 100% line and branch coverage. The two
                tokens, {pool.tokenA.symbol} and {pool.tokenB.symbol}, are test tokens anyone can
                mint for free.
              </p>
            </section>
          </>
        )}
      </main>

      <footer className="site-footer">
        <p>
          Built by{" "}
          <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
            Zenish Borad
          </a>
          . Source on{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

function describe(event, pool) {
  const { tokenA, tokenB } = pool;
  const amt = (v, t) => `${fmtAmount(Number(formatUnits(v, t.decimals)))} ${t.symbol}`;
  if (event.kind === "Swap") {
    const inIsA = event.args.tokenIn.toLowerCase() === tokenA.address.toLowerCase();
    const [tin, tout] = inIsA ? [tokenA, tokenB] : [tokenB, tokenA];
    return `Swapped ${amt(event.args.amountIn, tin)} for ${amt(event.args.amountOut, tout)}`;
  }
  if (event.kind === "Deposit") {
    return `Added ${amt(event.args.amountA, tokenA)} and ${amt(event.args.amountB, tokenB)}`;
  }
  return `Withdrew ${amt(event.args.amountA, tokenA)} and ${amt(event.args.amountB, tokenB)}`;
}
