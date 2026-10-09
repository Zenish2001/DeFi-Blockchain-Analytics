# SimpleAMM Web Interface

A React app for the [SimpleAMM](../simple-amm/) contracts on Sepolia. Anyone can look at the live pool without a wallet; with MetaMask you can get free test tokens and trade.

**[Live demo](https://simpleamm-zenish.vercel.app)**

![SimpleAMM](../docs/simpleamm.png)

## Highlights

- **Works without a wallet.** Pool data, charts and activity are read from Sepolia through public RPCs, so visitors see it working immediately.
- **Trade preview.** Typing an amount moves a point along the x·y=k curve to show where the pool would end up, with the rate, price impact and minimum received.
- **Full trading with MetaMask:** swap, add liquidity and withdraw, with 1% slippage protection and exact-amount approvals only. A button mints free test tokens.
- **History from the chain.** Price history and recent activity are rebuilt from the contract's `Swap`, `Deposit` and `Redeem` events with `eth_getLogs`, in chunks with retries to stay within public RPC limits.
- **Safe defaults.** Before using an RPC, the app checks it really is Sepolia and that the factory contract exists there.

## Requirements

- Node.js 18+ and npm
- To trade: MetaMask on the Sepolia network and a little free Sepolia ETH for gas

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

The app needs no `.env` file. Optional settings (set them in Vercel for the live site):

| Variable | Purpose |
|---|---|
| `VITE_FACTORY_ADDRESS` | Factory to read pools from (defaults to the deployed one) |
| `VITE_SEPOLIA_RPC_URL` | Your own **Sepolia** RPC, tried first |
| `VITE_START_BLOCK` | Deployment block; history is scanned from here, which makes loading faster |

## Deployed contracts (Sepolia)

| Contract | Address |
|---|---|
| Factory | `0xA73F929984ceccd98d7d99869A9796168cE78C68` |
| Alpha token | `0x541CfaBDeffe4857232A6e887e305180D72cf376` |
| Beta token | `0x14bdCF30cc4D52568be4e284103301578c4431c5` |
| Pool (pair) | `0x3dab2449032231BB16e9b0B18379cE74Db8F6316` |

## Files

| Path | Purpose |
|---|---|
| `src/App.jsx` | Page layout, wallet connection, data loading |
| `src/TradePanel.jsx` | Swap, add liquidity, withdraw, test-token minting |
| `src/CurveChart.jsx`, `src/PriceChart.jsx` | SVG charts |
| `src/chain.js` | Read-only RPC, pool and event loading |
| `src/format.js` | Formatting and the same AMM math as the contract |
| `src/config.js` | Addresses, RPCs and limits |

## Skills shown

React · Vite · Ethers.js v6 · MetaMask · reading event logs · SVG charts · Vercel
