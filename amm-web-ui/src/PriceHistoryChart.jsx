import { useEffect, useState } from "react";
import { BrowserProvider, Contract, formatEther } from "ethers";
import { AMM_ABI } from "./contracts/abis";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const MAX_BLOCK_RANGE = 9500;
const LOOKBACK_BLOCKS = 50000;

export default function PriceHistoryChart({ pairAddress, symbolA, symbolB }) {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pairAddress) return;

    async function fetchSwapHistory() {
      setLoading(true);
      setError("");
      try {
        const provider = new BrowserProvider(window.ethereum);
        const amm = new Contract(pairAddress, AMM_ABI, provider);

        const latestBlock = await provider.getBlockNumber();
        const startBlock = Math.max(0, latestBlock - LOOKBACK_BLOCKS);

        let allEvents = [];
        for (let from = startBlock; from <= latestBlock; from += MAX_BLOCK_RANGE) {
          const to = Math.min(from + MAX_BLOCK_RANGE - 1, latestBlock);
          const chunk = await amm.queryFilter(amm.filters.Swap(), from, to);
          allEvents = allEvents.concat(chunk);
        }

        const extracted = allEvents.map((event) => {
          const { reserveA, reserveB } = event.args;
          const rA = Number(formatEther(reserveA));
          const rB = Number(formatEther(reserveB));
          const price = rB / rA;
          return { blockNumber: event.blockNumber, price };
        });

        setPrices(extracted);
      } catch (err) {
        console.error(err);
        setError("Failed to load swap history: " + err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSwapHistory();
  }, [pairAddress]);

  if (loading) return <p style={{ color: "#888" }}>Loading swap history...</p>;
  if (error) return <p style={{ color: "#e88" }}>{error}</p>;
  if (prices.length === 0) return <p style={{ color: "#888" }}>No swaps recorded yet for this pool.</p>;

  const values = prices.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const numBins = 10;
  const binWidth = (max - min) / numBins || 1;

  const bins = Array.from({ length: numBins }, (_, i) => ({
    rangeStart: min + i * binWidth,
    rangeLabel: (min + i * binWidth).toFixed(4),
    count: 0,
  }));

  values.forEach((v) => {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  });

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
      <p style={{ color: "#9ba1a8", fontSize: "13px", marginBottom: "10px" }}>
        {prices.length} swap{prices.length === 1 ? "" : "s"} recorded · price shown as {symbolB} per {symbolA}
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={bins} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid stroke="#232830" strokeDasharray="3 3" />
          <XAxis
            dataKey="rangeLabel"
            stroke="#666"
            tick={{ fill: "#9ba1a8", fontSize: 11 }}
            label={{
              value: `Price (${symbolB}/${symbolA})`,
              position: "insideBottom",
              offset: -18,
              fill: "#9ba1a8",
              fontSize: 13,
            }}
          />
          <YAxis
            allowDecimals={false}
            stroke="#666"
            tick={{ fill: "#9ba1a8", fontSize: 11 }}
            label={{
              value: "Swap count",
              angle: -90,
              position: "insideLeft",
              fill: "#9ba1a8",
              fontSize: 13,
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            contentStyle={{ background: "#1a1e24", border: "1px solid #333", borderRadius: "6px" }}
            itemStyle={{ color: "#e9e7e1" }}
          />
          <Bar dataKey="count" fill="#33C6E0" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
