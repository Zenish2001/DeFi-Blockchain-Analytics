import { fmtPrice } from "./format";

const W = 640;
const H = 300;
const M = { top: 16, right: 20, bottom: 44, left: 84 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

/** Pool price (B per A) right after each recorded swap, in order. */
export default function PriceChart({ prices, symbolA, symbolB }) {
  if (prices.length === 0) {
    return <p className="empty">No swaps yet. Make the first one with the panel on this page.</p>;
  }

  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  min = Math.max(0, min - pad);
  max = max + pad;

  const n = prices.length;
  const toX = (i) => M.left + (n === 1 ? PW / 2 : (i / (n - 1)) * PW);
  const toY = (v) => M.top + PH - ((v - min) / (max - min)) * PH;
  const yTicks = [min, (min + max) / 2, max];
  const xTicks = n === 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  const d = prices.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join("");
  const showDots = n <= 60;

  return (
    <svg
      className="price-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Price of ${symbolA} in ${symbolB} after each of ${n} swaps, from ${fmtPrice(prices[0])} to ${fmtPrice(prices[n - 1])}.`}
    >
      {yTicks.map((t, i) => (
        <g key={i}>
          <line className="grid" x1={M.left} x2={M.left + PW} y1={toY(t)} y2={toY(t)} />
          <text className="tick" x={M.left - 10} y={toY(t) + 4} textAnchor="end">
            {fmtPrice(t)}
          </text>
        </g>
      ))}
      {xTicks.map((i) => (
        <text key={i} className="tick" x={toX(i)} y={M.top + PH + 22} textAnchor="middle">
          #{i + 1}
        </text>
      ))}
      <line className="axis" x1={M.left} x2={M.left + PW} y1={M.top + PH} y2={M.top + PH} />
      <path className="price-line" d={d} />
      {showDots &&
        prices.map((p, i) => <circle key={i} className="price-dot" cx={toX(i)} cy={toY(p)} r={3} />)}
      <circle className="point" cx={toX(n - 1)} cy={toY(prices[n - 1])} r={5} />
    </svg>
  );
}
