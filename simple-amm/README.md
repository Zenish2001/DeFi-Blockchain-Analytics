# SimpleAMM Contracts

A Uniswap v2-style constant-product market maker for one token pair, written in Solidity. Deposit liquidity, swap with a 0.30% fee, and withdraw. The pool contract is itself the LP token.

**[Live interface](https://simpleamm-zenish.vercel.app)** · web app code in [`../amm-web-ui/`](../amm-web-ui/)

## Highlights

- **Three actions:** `deposit` (add liquidity), `swap` (trade one token for the other) and `redeem` (remove liquidity).
- **Real LP token:** the contract inherits ERC-20, so liquidity shares are minted on deposit, burned on redeem, and can be transferred.
- **Same price formula as Uniswap v2**, with slippage protection through `minAmountOut`.
- **100% line and branch coverage**, including edge cases: zero amounts, unbalanced deposits, insufficient balance, both swap directions and the square-root helper used for the first deposit.

## Requirements

- Node.js 18+ and npm

## Run it

```bash
npm install            # Hardhat, OpenZeppelin, solidity-coverage
npx hardhat compile
npx hardhat test
npx hardhat coverage   # writes coverage/index.html
```

`solidity-coverage` only measures `contracts/`, so the inherited OpenZeppelin code doesn't affect the result. `SimpleAMM.sol` and `MockERC20.sol` both report 100%.

## How the swap price works

The fee is taken on the input, exactly as in Uniswap v2:

```
amountOut = (amountIn × 997 × reserveOut) / (reserveIn × 1000 + amountIn × 997)
```

To model a fee-free pool, set `FEE_NUM = FEE_DEN = 1000` in `SimpleAMM.sol`.

## Simplifications compared with Uniswap v2

- No `MINIMUM_LIQUIDITY` lock on the first deposit (the guard against first-depositor inflation is left out for clarity).
- Reserves are tracked explicitly instead of read from `balanceOf`, so tokens sent straight to the contract don't affect pricing.

## Files

```
simple-amm/
├── contracts/
│   ├── SimpleAMM.sol        the pool (also the ERC-20 LP token)
│   ├── SimpleAMMFactory.sol creates and lists pools
│   └── MockERC20.sol        mintable test token
├── test/SimpleAMM.test.js   full test suite
└── hardhat.config.js
```

## Skills shown

Solidity · ERC-20 · constant-product AMM math · Hardhat · test coverage
