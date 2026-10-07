// Everything the app needs to find the contracts on Sepolia.
// Values from Vercel environment variables win; the fallbacks are the
// addresses deployed by simple-amm/scripts/deploy.js.

export const CHAIN_ID = 11155111;
export const CHAIN_ID_HEX = "0xaa36a7";

export const FACTORY_ADDRESS =
  import.meta.env.VITE_FACTORY_ADDRESS || "0xA73F929984ceccd98d7d99869A9796168cE78C68";

// Read-only RPC endpoints, tried in order. Visitors don't need a wallet to
// see the pool, because reads go through these instead of MetaMask.
export const RPC_URLS = [
  import.meta.env.VITE_SEPOLIA_RPC_URL,
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.drpc.org",
  "https://1rpc.io/sepolia",
].filter(Boolean);

// Block the contracts were deployed in. Scanning event history starts here.
// Find it on Etherscan (the "Contract Creation" transaction of the pair) and
// set VITE_START_BLOCK in Vercel. Without it we scan a fixed lookback window.
export const START_BLOCK = Number(import.meta.env.VITE_START_BLOCK) || null;
export const FALLBACK_LOOKBACK_BLOCKS = 900_000; // about 4 months on Sepolia

export const EXPLORER = "https://sepolia.etherscan.io";
export const FAUCET_URL = "https://cloud.google.com/application/web3/faucet/ethereum/sepolia";
export const REPO_URL = "https://github.com/Zenish2001/DeFi-Blockchain-Analytics";
export const AUTHOR_URL = "https://www.linkedin.com/in/zenish-borad";

export const SLIPPAGE_BPS = 100n; // 1% protection on swaps
export const TEST_TOKEN_AMOUNT = "1000";
