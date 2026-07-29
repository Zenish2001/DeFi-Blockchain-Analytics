import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";
import { FACTORY_ABI, AMM_ABI, ERC20_ABI } from "./contracts/abis";
import ReservesCurveChart from "./ReservesCurveChart";
import PriceHistoryChart from "./PriceHistoryChart";

const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS;
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

function App() {
  const [account, setAccount] = useState(null);
  const [pools, setPools] = useState([]);
  const [selectedPool, setSelectedPool] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // form inputs
  const [depositA, setDepositA] = useState("");
  const [depositB, setDepositB] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapDirection, setSwapDirection] = useState("AtoB"); // "AtoB" or "BtoA"

  async function getSigner() {
    const provider = new BrowserProvider(window.ethereum);
    return provider.getSigner();
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus("MetaMask not found. Please install it.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);

      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId !== SEPOLIA_CHAIN_ID) {
        setStatus("Switching to Sepolia...");
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_ID }],
        });
      }
      setStatus("");
      await loadPools();
    } catch (err) {
      console.error(err);
      setStatus("Connection failed: " + err.message);
    }
  }

  const loadPools = useCallback(async () => {
    const provider = new BrowserProvider(window.ethereum);
    const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

    const count = await factory.allPairsLength();
    const loaded = [];

    for (let i = 0; i < count; i++) {
      const pairAddress = await factory.allPairs(i);
      const amm = new Contract(pairAddress, AMM_ABI, provider);

      const token0Addr = await amm.token0();
      const token1Addr = await amm.token1();
      const token0 = new Contract(token0Addr, ERC20_ABI, provider);
      const token1 = new Contract(token1Addr, ERC20_ABI, provider);

      const [symbol0, symbol1, reserveA, reserveB] = await Promise.all([
        token0.symbol(),
        token1.symbol(),
        amm.reserveA(),
        amm.reserveB(),
      ]);

      loaded.push({
        pairAddress,
        token0Addr,
        token1Addr,
        symbol0,
        symbol1,
        reserveA,
        reserveB,
      });
    }
    setPools(loaded);
    if (loaded.length > 0 && !selectedPool) setSelectedPool(loaded[0]);
  }, [selectedPool]);

  // Re-read the currently selected pool's reserves (call after any action)
  async function refreshSelectedPool() {
    if (!selectedPool) return;
    const provider = new BrowserProvider(window.ethereum);
    const amm = new Contract(selectedPool.pairAddress, AMM_ABI, provider);
    const [reserveA, reserveB] = await Promise.all([amm.reserveA(), amm.reserveB()]);
    setSelectedPool((prev) => ({ ...prev, reserveA, reserveB }));
    setPools((prev) =>
      prev.map((p) => (p.pairAddress === selectedPool.pairAddress ? { ...p, reserveA, reserveB } : p))
    );
  }

  // ---------------------------------------------------------------------
  // Generic "ensure allowance" helper: checks current allowance, and only
  // sends an approve transaction if it's insufficient. This is the pattern
  // every ERC20-based dApp needs before a contract can pull a user's tokens.
  // ---------------------------------------------------------------------
  async function ensureAllowance(tokenAddress, amountWei) {
    const signer = await getSigner();
    const token = new Contract(tokenAddress, ERC20_ABI, signer);
    const owner = await signer.getAddress();

    const current = await token.allowance(owner, selectedPool.pairAddress);
    if (current >= amountWei) return; // already approved enough

    setStatus("Requesting approval...");
    const tx = await token.approve(selectedPool.pairAddress, amountWei);
    await tx.wait();
  }

  async function handleDeposit() {
    if (!selectedPool || !depositA || !depositB) return;
    setBusy(true);
    try {
      const amountA = parseEther(depositA);
      const amountB = parseEther(depositB);

      await ensureAllowance(selectedPool.token0Addr, amountA);
      await ensureAllowance(selectedPool.token1Addr, amountB);

      setStatus("Depositing...");
      const signer = await getSigner();
      const amm = new Contract(selectedPool.pairAddress, AMM_ABI, signer);
      const tx = await amm.deposit(amountA, amountB);
      await tx.wait();

      setStatus("Deposit successful.");
      setDepositA("");
      setDepositB("");
      await refreshSelectedPool();
    } catch (err) {
      console.error(err);
      setStatus("Deposit failed: " + (err.reason || err.message));
    } finally {
      setBusy(false);
    }
  }

  async function handleRedeem() {
    if (!selectedPool || !redeemAmount) return;
    setBusy(true);
    try {
      const liquidity = parseEther(redeemAmount);
      setStatus("Redeeming...");
      const signer = await getSigner();
      const amm = new Contract(selectedPool.pairAddress, AMM_ABI, signer);
      const tx = await amm.redeem(liquidity);
      await tx.wait();

      setStatus("Redeem successful.");
      setRedeemAmount("");
      await refreshSelectedPool();
    } catch (err) {
      console.error(err);
      setStatus("Redeem failed: " + (err.reason || err.message));
    } finally {
      setBusy(false);
    }
  }

  async function handleSwap() {
    if (!selectedPool || !swapAmount) return;
    setBusy(true);
    try {
      const amountIn = parseEther(swapAmount);
      const tokenIn = swapDirection === "AtoB" ? selectedPool.token0Addr : selectedPool.token1Addr;

      await ensureAllowance(tokenIn, amountIn);

      setStatus("Swapping...");
      const signer = await getSigner();
      const amm = new Contract(selectedPool.pairAddress, AMM_ABI, signer);
      // minAmountOut = 0 here for simplicity (no slippage protection in the UI yet)
      const tx = await amm.swap(tokenIn, amountIn, 0n);
      await tx.wait();

      setStatus("Swap successful.");
      setSwapAmount("");
      await refreshSelectedPool();
    } catch (err) {
      console.error(err);
      setStatus("Swap failed: " + (err.reason || err.message));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (window.ethereum && window.ethereum.selectedAddress) {
      connectWallet();
    }
  }, []);

  return (
    <div style={{ fontFamily: "monospace", padding: "40px", maxWidth: "700px", margin: "0 auto" }}>
      <h1>SimpleAMM</h1>

      {!account ? (
        <button onClick={connectWallet} style={{ padding: "10px 20px", fontSize: "16px" }}>
          Connect Wallet
        </button>
      ) : (
        <p>Connected: {account}</p>
      )}

      {status && <p style={{ color: "#888" }}>{status}</p>}

      <h2>Available Pools</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {pools.map((p) => (
          <li key={p.pairAddress} style={{ marginBottom: "8px" }}>
            <label>
              <input
                type="radio"
                checked={selectedPool?.pairAddress === p.pairAddress}
                onChange={() => setSelectedPool(p)}
              />
              {" "}
              <strong>{p.symbol0}/{p.symbol1}</strong> — reserves: {formatEther(p.reserveA)} / {formatEther(p.reserveB)}
            </label>
          </li>
        ))}
      </ul>

      {selectedPool && (
  <>
    <ReservesCurveChart
      reserveA={selectedPool.reserveA}
      reserveB={selectedPool.reserveB}
      symbolA={selectedPool.symbol0}
      symbolB={selectedPool.symbol1}
    />

    <PriceHistoryChart
      pairAddress={selectedPool.pairAddress}
      symbolA={selectedPool.symbol0}
      symbolB={selectedPool.symbol1}
    />

    <hr style={{ margin: "24px 0" }} />

          <h2>Deposit</h2>
          <input
            placeholder={`${selectedPool.symbol0} amount`}
            value={depositA}
            onChange={(e) => setDepositA(e.target.value)}
          />
          <input
            placeholder={`${selectedPool.symbol1} amount`}
            value={depositB}
            onChange={(e) => setDepositB(e.target.value)}
            style={{ marginLeft: "8px" }}
          />
          <button onClick={handleDeposit} disabled={busy} style={{ marginLeft: "8px" }}>
            Deposit
          </button>

          <h2>Redeem</h2>
          <input
            placeholder="LP token amount"
            value={redeemAmount}
            onChange={(e) => setRedeemAmount(e.target.value)}
          />
          <button onClick={handleRedeem} disabled={busy} style={{ marginLeft: "8px" }}>
            Redeem
          </button>

          <h2>Swap</h2>
          <select value={swapDirection} onChange={(e) => setSwapDirection(e.target.value)}>
            <option value="AtoB">{selectedPool.symbol0} → {selectedPool.symbol1}</option>
            <option value="BtoA">{selectedPool.symbol1} → {selectedPool.symbol0}</option>
          </select>
          <input
            placeholder="Amount in"
            value={swapAmount}
            onChange={(e) => setSwapAmount(e.target.value)}
            style={{ marginLeft: "8px" }}
          />
          <button onClick={handleSwap} disabled={busy} style={{ marginLeft: "8px" }}>
            Swap
          </button>
        </>
      )}
    </div>
  );
}

export default App;