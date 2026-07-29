import { formatEther } from "ethers";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/**
 * Renders the constant-product curve (x * y = k) for the currently selected
 * pool, along with a marked point P showing exactly where the pool sits on
 * that curve right now.
 *
 * - On every SWAP, P moves along the curve (k stays the same, aside from
 *   the tiny 0.3% fee accrual, which is correct AMM behavior).
 * - On every DEPOSIT or REDEEM, both the curve and P shift (k changes).
 */
export default function ReservesCurveChart({ reserveA, reserveB, symbolA, symbolB }) {
  if (reserveA === undefined || reserveB === undefined) return null;

  const rA = Number(formatEther(reserveA));
  const rB = Number(formatEther(reserveB));

  if (rA === 0 || rB === 0) {
    return <p style={{ color: "#888" }}>Pool has no liquidity yet — nothing to chart.</p>;
  }

  const k = rA * rB;

  const numPoints = 80;
  const xMin = rA * 0.2;
  const xMax = rA * 3;
  const step = (xMax - xMin) / numPoints;

  const curveData = [];
  for (let i = 0; i <= numPoints; i++) {
    const x = xMin + step * i;
    if (x <= 0) continue;
    curveData.push({ x, y: k / x });
  }

  // Explicit numeric domains, computed from the actual data — letting
  // recharts infer "dataMin"/"dataMax" across per-series data is unreliable
  // in a ComposedChart with multiple series, which produced garbage axis
  // values before this fix.
  const allY = curveData.map((d) => d.y).concat([rB]);
  const yDomain = [Math.floor(Math.min(...allY) * 0.9), Math.ceil(Math.max(...allY) * 1.05)];
  const xDomain = [Math.floor(xMin * 0.95), Math.ceil(xMax * 1.02)];

  const fmt = (n) => {
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return n.toFixed(0);
  };

  return (
    <div
      style={{
        marginTop: "20px",
        marginBottom: "20px",
        background: "#12151a",
        border: "1px solid #2a2f35",
        borderRadius: "8px",
        padding: "20px 16px 8px",
      }}
    >
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart margin={{ top: 10, right: 30, bottom: 30, left: 20 }}>
          <CartesianGrid stroke="#232830" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={xDomain}
            tickFormatter={fmt}
            stroke="#666"
            tick={{ fill: "#9ba1a8", fontSize: 12 }}
            label={{
              value: `${symbolA} reserve`,
              position: "insideBottom",
              offset: -18,
              fill: "#9ba1a8",
              fontSize: 13,
            }}
          />
          <YAxis
            dataKey="y"
            type="number"
            domain={yDomain}
            tickFormatter={fmt}
            stroke="#666"
            tick={{ fill: "#9ba1a8", fontSize: 12 }}
            width={60}
            label={{
              value: `${symbolB} reserve`,
              angle: -90,
              position: "insideLeft",
              fill: "#9ba1a8",
              fontSize: 13,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            formatter={(value) => value.toFixed(2)}
            labelFormatter={(x) => `${symbolA}: ${x.toFixed(2)}`}
            contentStyle={{
              background: "#1a1e24",
              border: "1px solid #333",
              borderRadius: "6px",
              fontSize: "13px",
            }}
            itemStyle={{ color: "#e9e7e1" }}
          />
          <Line
            data={curveData}
            dataKey="y"
            stroke="#33C6E0"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
            name={`x·y=k`}
          />
          <Scatter
            data={[{ x: rA, y: rB }]}
            dataKey="y"
            fill="#E8B84B"
            name="Current position"
            shape={(props) => (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={7}
                fill="#E8B84B"
                stroke="#12151a"
                strokeWidth={2}
              />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p style={{ color: "#666", fontSize: "12.5px", textAlign: "center", marginTop: "4px" }}>
        k = {k.toFixed(2)} &nbsp;·&nbsp; P = ({rA.toFixed(2)} {symbolA}, {rB.toFixed(2)} {symbolB})
      </p>
    </div>
  );
}