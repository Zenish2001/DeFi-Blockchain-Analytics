<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:232526,100:414345&height=200&section=header&text=DeFi%20Blockchain%20Analytics&fontSize=42&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=AMM%20Design%2C%20On-Chain%20Data%2C%20and%20Natural%20Language%20Querying&descAlignY=55&descSize=16" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=18&pause=1000&color=8E8E8E&center=true&vCenter=true&width=650&lines=A+constant-product+AMM%2C+built+and+tested+from+the+ground+up.;A+live+on-chain+dashboard+for+watching+it+trade.;A+natural+language+interface+to+Bitcoin+blockchain+data." alt="Typing SVG" />

<br/>

[![Solidity](https://img.shields.io/badge/Solidity-Hardhat-363636?style=for-the-badge&logo=solidity&logoColor=white)]()
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/downloads/)
[![Coverage](https://img.shields.io/badge/AMM%20Test%20Coverage-100%25-2ea44f?style=for-the-badge)]()
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Active%20Development-orange?style=for-the-badge)]()

**[🔗 Live Demo](https://de-fi-blockchain-analytics.vercel.app)** — connect MetaMask on Sepolia and try it yourself

</div>

<br/>

Three connected pieces of DeFi and blockchain-data engineering: a constant-product AMM implemented and tested from scratch, a live web3 interface for watching it trade in real time, and a natural-language query layer over Bitcoin blockchain data.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Modules

<table>
<tr>
<td width="33%" valign="top">

### [simple-amm/](simple-amm/)

A Uniswap-V2-style constant-product AMM in Solidity. Deposit, redeem, and swap with a 0.30% fee; the pool itself is a real, transferable ERC20 LP token. 100% line and branch test coverage via Hardhat.

</td>
<td width="33%" valign="top">

### [amm-web-ui/](amm-web-ui/)

A web3 interface for the AMM above: pool selection, deposit/redeem/swap, a live reserves-curve chart, and a swap execution-price distribution built from historical on-chain events. Deployed to Sepolia and hosted live.

**[Try it live →](https://de-fi-blockchain-analytics.vercel.app)**

</td>
<td width="33%" valign="top">

### [bitcoin-text-to-sql/](bitcoin-text-to-sql/)

A Bitcoin blockchain data pipeline that answers natural language questions by converting them to SQL with Gemini AI, queried against a SQLite database synced from a Bitcoin Core node.

</td>
</tr>
</table>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## How the AMM UI Works

<div align="center">

| Feature | Detail |
|---|---|
| Pool selection | Reads available pairs from a factory contract |
| Actions | Deposit, redeem, and swap, wired directly to the contract |
| Reserves curve | Live x·y=k chart with the current point plotted from `getReserves()` |
| Swap price history | Distribution of past execution prices, decoded from on-chain `Swap` events via `eth_getLogs` |

</div>

Every action — deposit, redeem, or swap — updates both charts in real time, so the curve's shift and the current point's movement are visible as they happen.

**[Live demo: de-fi-blockchain-analytics.vercel.app](https://de-fi-blockchain-analytics.vercel.app)** (requires MetaMask on Sepolia testnet)

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Tech Stack

<div align="center">

<img src="https://skillicons.dev/icons?i=solidity,python,flask,sqlite,js,html,css,git&theme=dark" />

</div>

<br/>

**Smart contracts:** Solidity, Hardhat, OpenZeppelin, solidity-coverage
**Web UI:** React, Vite, Ethers.js v6, Recharts, deployed on Sepolia testnet and hosted on Vercel
**Data pipeline:** Python, Flask, SQLite, Gemini API, Chart.js, Bitcoin Core RPC

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Repository Structure

```
DeFi-Blockchain-Analytics/
├── simple-amm/            # Constant-product AMM contract + full test suite
├── amm-web-ui/             # Web3 UI + on-chain analytics for the AMM (live demo above)
├── bitcoin-text-to-sql/    # Natural language interface to Bitcoin blockchain data
└── README.md               # You are here
```

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Status

All three modules are complete: `simple-amm/`, `bitcoin-text-to-sql/`, and `amm-web-ui/` (deployed live — see [amm-web-ui/README.md](amm-web-ui/README.md) for details).

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## License

MIT License — see [LICENSE](LICENSE)

<br/>

<div align="center">

## Get In Touch

<table>
<tr>
<td align="center" width="200">

<img src="https://img.icons8.com/fluency/48/user-male-circle.png" width="40"/><br/>
<b>Zenish Borad</b><br/>
<sub>Fintech & Blockchain Engineering</sub>

</td>
<td align="center" width="200">

<a href="https://www.linkedin.com/in/zenish-borad">
<img src="https://img.icons8.com/fluency/48/linkedin.png" width="40"/><br/>
<b>LinkedIn</b>
</a><br/>
<sub>zenish-borad</sub>

</td>
<td align="center" width="200">

<a href="https://github.com/Zenish2001">
<img src="https://img.icons8.com/fluency/48/github.png" width="40"/><br/>
<b>GitHub</b>
</a><br/>
<sub>@Zenish2001</sub>

</td>
<td align="center" width="200">

<a href="mailto:zenish42@gmail.com">
<img src="https://img.icons8.com/fluency/48/gmail-new.png" width="40"/><br/>
<b>Email</b>
</a><br/>
<sub>zenish42@gmail.com</sub>

</td>
</tr>
</table>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:414345,100:232526&height=100&section=footer" width="100%"/>

</div>
