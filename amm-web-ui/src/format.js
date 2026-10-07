import { formatUnits, parseUnits } from "ethers";

export function toNumber(value, decimals = 18) {
  return Number(formatUnits(value ?? 0n, decimals));
}

/** Human-readable amount: 1,240.5 / 0.0042 / 12.3k for axes. */
export function fmtAmount(n, { compact = false } = {}) {
  if (!Number.isFinite(n)) return "–";
  if (compact && Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }
  if (n !== 0 && Math.abs(n) < 1) {
    return n.toLocaleString("en-US", { maximumSignificantDigits: 3 });
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 });
}

export function fmtPrice(n) {
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function shortAddress(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export function timeAgo(seconds) {
  if (!seconds) return "";
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [name, size] of units) {
    const v = Math.floor(diff / size);
    if (v >= 1) return `${v} ${name}${v === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

/** parseUnits that returns null instead of throwing on half-typed input. */
export function safeParse(text, decimals = 18) {
  if (!text || !/^\d*\.?\d*$/.test(text.trim()) || text.trim() === ".") return null;
  try {
    const v = parseUnits(text.trim(), decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

// --- Same formulas as SimpleAMM.sol, so previews match what the contract does.

export function quoteSwap(amountIn, reserveIn, reserveOut) {
  if (!amountIn || reserveIn === 0n || reserveOut === 0n) return 0n;
  const withFee = amountIn * 997n;
  return (withFee * reserveOut) / (reserveIn * 1000n + withFee);
}

export function quoteDeposit(amountA, amountB, reserveA, reserveB, supply) {
  if (!amountA || !amountB) return 0n;
  if (supply === 0n) return sqrt(amountA * amountB);
  const liqA = (amountA * supply) / reserveA;
  const liqB = (amountB * supply) / reserveB;
  return liqA < liqB ? liqA : liqB;
}

export function quoteRedeem(liquidity, reserveA, reserveB, supply) {
  if (!liquidity || supply === 0n) return [0n, 0n];
  return [(liquidity * reserveA) / supply, (liquidity * reserveB) / supply];
}

function sqrt(x) {
  if (x === 0n) return 0n;
  let z = (x + 1n) / 2n;
  let y = x;
  while (z < y) {
    y = z;
    z = (x / z + z) / 2n;
  }
  return y;
}

export function friendlyError(err) {
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || err?.info?.error?.code === 4001) {
    return "You cancelled the request in your wallet.";
  }
  const reason = err?.reason || err?.shortMessage || err?.message || "Something went wrong.";
  if (/insufficient funds/i.test(reason)) {
    return "Your wallet doesn't have enough Sepolia ETH to pay for gas. Get some free from a faucet.";
  }
  if (/SLIPPAGE/.test(reason)) {
    return "The price moved more than 1% before your swap went through. Try again.";
  }
  return reason.length > 160 ? reason.slice(0, 157) + "…" : reason;
}
