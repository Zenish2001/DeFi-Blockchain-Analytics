SimpleAMM Web3 UI
🔗 Live Demo — connect MetaMask on Sepolia testnet to try it
A React frontend for the SimpleAMM smart contract: select a pool, deposit, redeem, or swap, and watch two live on-chain charts update after every action.
What It Does
Pool selection — reads every available pair directly from a SimpleAMMFactory contract, rather than hardcoding a single pool
Deposit / Redeem / Swap — full write actions against the live contract, including the ERC20 approve step required before the AMM can move a user's tokens
Reserves curve chart — plots the constant-product curve (x·y=k) with the pool's current position marked on it, computed purely from reserveA()/reserveB()
Swap price history chart — a histogram of past execution prices, reconstructed entirely from on-chain Swap event logs via eth_getLogs (wrapped by ethers' queryFilter), chunked to respect RPC provider block-range limits
How Price History Works
The SimpleAMM contract's Swap event was extended to include reserveA/reserveB at the moment of each swap:
solidity
event Swap(
    address indexed trader,
    address indexed tokenIn,
    uint256 amountIn,
    uint256 amountOut,
    uint256 reserveA,
    uint256 reserveB
);
This means the execution price for any past swap (reserveB / reserveA) can be read directly from the event log itself — no additional historical-state RPC calls are needed to reconstruct it.
Tech Stack
React (Vite) — component framework and dev tooling
Ethers.js v6 — wallet connection, contract reads/writes, event log decoding
Recharts — reserves curve and price-history charts
MetaMask — wallet provider
Sepolia testnet — deployment target
Vercel — hosting
Running Locally
bash
npm install
npm run dev
Requires a .env file with the deployed contract addresses:
VITE_FACTORY_ADDRESS=0x...
VITE_ALPHA_TOKEN_ADDRESS=0x...
VITE_BETA_TOKEN_ADDRESS=0x...
MetaMask must be installed and set to the Sepolia network.
Live Contracts (Sepolia)
Contract	Address
Factory	0xA73F929984ceccd98d7d99869A9796168cE78C68
Alpha Token	0x541CfaBDeffe4857232A6e887e305180D72cf376
Beta Token	0x14bdCF30cc4D52568be4e284103301578c4431c5
SimpleAMM pair	0x3dab2449032231BB16e9b0B18379cE74Db8F6316
Related
../simple-amm/ — the AMM contract this UI connects to
../bitcoin-text-to-sql/ — a separate module in this repo
