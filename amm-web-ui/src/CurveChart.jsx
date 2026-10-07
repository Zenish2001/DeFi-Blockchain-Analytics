import { fmtAmount } from "./format";

const W = 640;
const H = 420;
const M = { top: 20, right: 28, bottom: 58, left: 92 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

function niceScale(maxValue, count = 4) {
  const raw = maxValue / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const max = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  return { max, ticks };
}

function curvePath(k, xs, ys) {
  const sx = xs;
  const sy = ys;
  const xStart = k / sy.max;
  const xEnd = sx.max;
  const n = 140;
  const ratio = (xEnd / xStart) ** (1 / n); // geometric spacing keeps the steep end smooth
  let d = "";
  for (let i = 0; i <= n; i++) {
    const x = xStart * ratio ** i;
    const px = M.left + (x / sx.max) * PW;
    const py = M.top + PH - ((k / x) / sy.max) * PH;
    d += `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
  }
  return d;
}

/**
 * The constant-product curve x·y = k for the pool, with the pool's current
 * reserves marked on it. While someone types a trade, `preview` shows where
 * the pool would land: a swap slides the point along the same curve, adding
 * or withdrawing liquidity moves it to a new curve (dashed).
 */
export default function CurveChart({ reserveA, reserveB, symbolA, symbolB, preview }) {
  if (!(reserveA > 0) || !(reserveB > 0)) {
    return <p className="empty">The pool has no liquidity yet, so there's no curve to draw.</p>;
  }

  const k = reserveA * reserveB;
  const px = Math.max(reserveA, preview?.x ?? 0);
  const py = Math.max(reserveB, preview?.y ?? 0);
  const xs = niceScale(px * 2.4);
  const ys = niceScale(py * 2.4);

  const toX = (v) => M.left + (v / xs.max) * PW;
  const toY = (v) => M.top + PH - (v / ys.max) * PH;

  const cx = toX(reserveA);
  const cy = toY(reserveB);
  const hasPreview = preview && preview.x > 0 && preview.y > 0;
  const newK = hasPreview ? preview.x * preview.y : k;
  const showNewCurve = hasPreview && Math.abs(newK - k) / k > 0.002;

  const label = `Pool now: ${fmtAmount(reserveA)} ${symbolA} and ${fmtAmount(reserveB)} ${symbolB}`;
  const labelRight = cx < M.left + PW * 0.62;

  return (
    <svg
      className="curve-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Constant-product curve. ${label}.`}
    >
      <defs>
        <clipPath id="plot-area">
          <rect x={M.left} y={M.top} width={PW} height={PH} />
        </clipPath>
      </defs>

      {xs.ticks.map((t) => (
        <g key={`x${t}`}>
          <line className="grid" x1={toX(t)} x2={toX(t)} y1={M.top} y2={M.top + PH} />
          <text className="tick" x={toX(t)} y={M.top + PH + 20} textAnchor="middle">
            {fmtAmount(t, { compact: true })}
          </text>
        </g>
      ))}
      {ys.ticks.map((t) => (
        <g key={`y${t}`}>
          <line className="grid" x1={M.left} x2={M.left + PW} y1={toY(t)} y2={toY(t)} />
          <text className="tick" x={M.left - 10} y={toY(t) + 4} textAnchor="end">
            {fmtAmount(t, { compact: true })}
          </text>
        </g>
      ))}

      <line className="axis" x1={M.left} x2={M.left + PW} y1={M.top + PH} y2={M.top + PH} />
      <line className="axis" x1={M.left} x2={M.left} y1={M.top} y2={M.top + PH} />

      <text className="axis-label" x={M.left + PW / 2} y={H - 10} textAnchor="middle">
        {symbolA} in the pool
      </text>
      <text
        className="axis-label"
        transform={`translate(18 ${M.top + PH / 2}) rotate(-90)`}
        textAnchor="middle"
      >
        {symbolB} in the pool
      </text>

      <g clipPath="url(#plot-area)">
        {showNewCurve && <path className="curve curve-next" d={curvePath(newK, xs, ys)} />}
        <path className="curve" d={curvePath(k, xs, ys)} />

        <line className="guide" x1={M.left} x2={cx} y1={cy} y2={cy} />
        <line className="guide" x1={cx} x2={cx} y1={cy} y2={M.top + PH} />

        {hasPreview && (
          <>
            <line className="move" x1={cx} y1={cy} x2={toX(preview.x)} y2={toY(preview.y)} />
            <circle className="point-next" cx={toX(preview.x)} cy={toY(preview.y)} r={6} />
          </>
        )}
        <circle className="point" cx={cx} cy={cy} r={7} />
      </g>

      <text
        className="point-label"
        x={labelRight ? cx + 16 : cx - 16}
        y={cy - 30}
        textAnchor={labelRight ? "start" : "end"}
      >
        <tspan className="point-label-title">Pool now</tspan>
        <tspan x={labelRight ? cx + 16 : cx - 16} dy="1.3em">
          {fmtAmount(reserveA)} {symbolA} × {fmtAmount(reserveB)} {symbolB}
        </tspan>
      </text>
    </svg>
  );
}
