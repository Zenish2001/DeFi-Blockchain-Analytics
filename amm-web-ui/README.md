<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:232526,100:414345&height=180&section=header&text=SimpleAMM%20Web3%20UI&fontSize=38&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=A%20React%20Frontend%20for%20an%20On-Chain%20AMM&descAlignY=62&descSize=15" width="100%"/>

[![React](https://img.shields.io/badge/React-Vite-61DAFB?style=for-the-badge&logo=react&logoColor=white)]()
[![Ethers.js](https://img.shields.io/badge/Ethers.js-v6-363636?style=for-the-badge&logo=ethereum&logoColor=white)]()
[![Sepolia](https://img.shields.io/badge/Network-Sepolia-9C6ADE?style=for-the-badge)]()
[![Status](https://img.shields.io/badge/Status-Live-2ea44f?style=for-the-badge)]()

**[🔗 Live Demo](https://de-fi-blockchain-analytics.vercel.app)** &nbsp;·&nbsp; connect MetaMask on Sepolia to try it

</div>

<br/>

A React frontend for the [SimpleAMM](../simple-amm/) smart contract: select a pool, deposit, redeem, or swap, and watch two live on-chain charts update after every action.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## What It Does

<div align="center">

| Feature | Detail |
|---|---|
| **Pool selection** | Reads every available pair directly from a `SimpleAMMFactory` contract, rather than hardcoding a single pool |
| **Deposit / Redeem / Swap** | Full write actions against the live contract, including the ERC20 approve step required before the AMM can move a user's tokens |
| **Reserves curve chart** | Plots the constant-product curve (`x·y=k`) with the pool's current position marked on it, computed purely from `reserveA()` / `reserveB()` |
| **Swap price history chart** | A histogram of past execution prices, reconstructed entirely from on-chain `Swap` event logs via `eth_getLogs`, chunked to respect RPC provider block-range limits |

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## How Price History Works

The `SimpleAMM` contract's `Swap` event was extended to include `reserveA`/`reserveB` at the moment of each swap:

```solidity
event Swap(
    address indexed trader,
    address indexed tokenIn,
    uint256 amountIn,
    uint256 amountOut,
    uint256 reserveA,
    uint256 reserveB
);
```

This means the execution price for any past swap (`reserveB / reserveA`) can be read directly from the event log itself — no additional historical-state RPC calls are needed to reconstruct it.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Tech Stack

<div align="center">

<img src="https://skillicons.dev/icons?i=react,vite,js,solidity,git&theme=dark" />

</div>

<br/>

**Frontend:** React, Vite, Ethers.js v6, Recharts
**Wallet:** MetaMask
**Deployment:** Sepolia testnet (contracts), Vercel (frontend)

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Running Locally

```bash
npm install
npm run dev
```

Requires a `.env` file with the deployed contract addresses:

```
VITE_FACTORY_ADDRESS=0x...
VITE_ALPHA_TOKEN_ADDRESS=0x...
VITE_BETA_TOKEN_ADDRESS=0x...
```

MetaMask must be installed and set to the Sepolia network.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Live Contracts (Sepolia)

<div align="center">

| Contract | Address |
|---|---|
| Factory | `0xA73F929984ceccd98d7d99869A9796168cE78C68` |
| Alpha Token | `0x541CfaBDeffe4857232A6e887e305180D72cf376` |
| Beta Token | `0x14bdCF30cc4D52568be4e284103301578c4431c5` |
| SimpleAMM pair | `0x3dab2449032231BB16e9b0B18379cE74Db8F6316` |

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Related

- [`../simple-amm/`](../simple-amm/) — the AMM contract this UI connects to
- [`../bitcoin-text-to-sql/`](../bitcoin-text-to-sql/) — a separate module in this repo

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:414345,100:232526&height=90&section=footer" width="100%"/>

</div>
