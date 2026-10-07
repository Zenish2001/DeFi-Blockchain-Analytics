import { useEffect, useState } from "react";
import { Contract, formatUnits, parseUnits } from "ethers";
import { AMM_ABI, ERC20_ABI, MOCK_TOKEN_ABI } from "./contracts/abis";
import { EXPLORER, FAUCET_URL, SLIPPAGE_BPS, TEST_TOKEN_AMOUNT } from "./config";
import {
  safeParse,
  quoteSwap,
  quoteDeposit,
  quoteRedeem,
  fmtAmount,
  fmtPrice,
  shortAddress,
  toNumber,
  friendlyError,
} from "./format";

const TABS = [
  ["swap", "Swap"],
  ["add", "Add liquidity"],
  ["remove", "Withdraw"],
];

function trimDecimals(text, places = 4) {
  const [whole, frac = ""] = text.split(".");
  const cut = frac.slice(0, places).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole;
}

export default function TradePanel({
  pool,
  hasWallet,
  wallet,
  balances,
  onConnect,
  onSwitchNetwork,
  getSigner,
  onPoolChanged,
  onBalancesChanged,
  onPreview,
}) {
  const [tab, setTab] = useState("swap");
  const [aToB, setAToB] = useState(true);
  const [swapIn, setSwapIn] = useState("");
  const [addA, setAddA] = useState("");
  const [addB, setAddB] = useState("");
  const [lpIn, setLpIn] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const { tokenA, tokenB, reserveA, reserveB, lpSupply, pairAddress } = pool;
  const tIn = aToB ? tokenA : tokenB;
  const tOut = aToB ? tokenB : tokenA;
  const rIn = aToB ? reserveA : reserveB;
  const rOut = aToB ? reserveB : reserveA;

  // --- Quotes, using the same integer math as the contract ------------------
  const swapAmt = safeParse(swapIn, tIn.decimals);
  const swapOut = swapAmt ? quoteSwap(swapAmt, rIn, rOut) : 0n;
  const minOut = (swapOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;

  const amtA = safeParse(addA, tokenA.decimals);
  const amtB = safeParse(addB, tokenB.decimals);
  const lpOut = amtA && amtB ? quoteDeposit(amtA, amtB, reserveA, reserveB, lpSupply) : 0n;

  const lpAmt = safeParse(lpIn, 18);
  const [outA, outB] = lpAmt ? quoteRedeem(lpAmt, reserveA, reserveB, lpSupply) : [0n, 0n];

  // --- Tell the chart where this trade would move the pool ------------------
  useEffect(() => {
    const a = (v) => toNumber(v, tokenA.decimals);
    const b = (v) => toNumber(v, tokenB.decimals);
    let next = null;
    if (tab === "swap" && swapAmt && swapOut > 0n) {
      next = aToB
        ? { x: a(reserveA + swapAmt), y: b(reserveB - swapOut) }
        : { x: a(reserveA - swapOut), y: b(reserveB + swapAmt) };
    } else if (tab === "add" && amtA && amtB) {
      next = { x: a(reserveA + amtA), y: b(reserveB + amtB) };
    } else if (tab === "remove" && lpAmt && outA < reserveA && outB < reserveB) {
      next = { x: a(reserveA - outA), y: b(reserveB - outB) };
    }
    onPreview(next);
  }, [tab, aToB, swapAmt, swapOut, amtA, amtB, lpAmt, outA, outB, reserveA, reserveB, tokenA.decimals, tokenB.decimals, onPreview]);

  useEffect(() => () => onPreview(null), [onPreview]);

  // --- Wallet state ----------------------------------------------------------
  const ready = Boolean(wallet.account && wallet.onSepolia && balances);

  function onAddAChange(v) {
    setAddA(v);
    const parsed = safeParse(v, tokenA.decimals);
    if (parsed && reserveA > 0n) {
      setAddB(trimDecimals(formatUnits((parsed * reserveB) / reserveA, tokenB.decimals)));
    } else if (!v) {
      setAddB("");
    }
  }

  function onAddBChange(v) {
    setAddB(v);
    const parsed = safeParse(v, tokenB.decimals);
    if (parsed && reserveB > 0n) {
      setAddA(trimDecimals(formatUnits((parsed * reserveA) / reserveB, tokenA.decimals)));
    } else if (!v) {
      setAddA("");
    }
  }

  // --- Sending transactions --------------------------------------------------
  async function run(steps, doneText, clear) {
    setBusy(true);
    let lastHash = null;
    try {
      const signer = await getSigner();
      for (const step of steps) {
        setStatus({ kind: "info", text: `${step.label} Confirm in your wallet.` });
        const tx = await step.send(signer);
        if (!tx) continue; // e.g. approval already in place
        setStatus({ kind: "info", text: `${step.label} Waiting for the network…`, hash: tx.hash });
        await tx.wait();
        lastHash = tx.hash;
      }
      setStatus({ kind: "success", text: doneText, hash: lastHash });
      clear?.();
      await Promise.all([onPoolChanged(), onBalancesChanged()]);
    } catch (err) {
      console.error(err);
      setStatus({ kind: "error", text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  }

  function approveStep(token, amount) {
    return {
      label: `Allowing the pool to take ${fmtAmount(toNumber(amount, token.decimals))} ${token.symbol}.`,
      send: async (signer) => {
        const erc20 = new Contract(token.address, ERC20_ABI, signer);
        const owner = await signer.getAddress();
        const current = await erc20.allowance(owner, pairAddress);
        if (current >= amount) return null;
        // Approve the exact amount only, never an unlimited allowance.
        return erc20.approve(pairAddress, amount);
      },
    };
  }

  const amm = (signer) => new Contract(pairAddress, AMM_ABI, signer);

  function doSwap() {
    const text = `Swapped ${swapIn} ${tIn.symbol} for about ${fmtAmount(toNumber(swapOut, tOut.decimals))} ${tOut.symbol}.`;
    run(
      [
        approveStep(tIn, swapAmt),
        { label: `Swapping ${tIn.symbol} for ${tOut.symbol}.`, send: (s) => amm(s).swap(tIn.address, swapAmt, minOut) },
      ],
      text,
      () => setSwapIn("")
    );
  }

  function doAdd() {
    run(
      [
        approveStep(tokenA, amtA),
        approveStep(tokenB, amtB),
        { label: "Adding liquidity.", send: (s) => amm(s).deposit(amtA, amtB) },
      ],
      `Added ${addA} ${tokenA.symbol} and ${addB} ${tokenB.symbol} to the pool.`,
      () => {
        setAddA("");
        setAddB("");
      }
    );
  }

  function doRemove() {
    run(
      [{ label: "Withdrawing liquidity.", send: (s) => amm(s).redeem(lpAmt) }],
      `Withdrew ${fmtAmount(toNumber(outA, tokenA.decimals))} ${tokenA.symbol} and ${fmtAmount(toNumber(outB, tokenB.decimals))} ${tokenB.symbol}.`,
      () => setLpIn("")
    );
  }

  function doMint() {
    const mint = (token) => ({
      label: `Minting ${TEST_TOKEN_AMOUNT} test ${token.symbol}.`,
      send: (s) =>
        new Contract(token.address, MOCK_TOKEN_ABI, s).mint(
          wallet.account,
          parseUnits(TEST_TOKEN_AMOUNT, token.decimals)
        ),
    });
    run(
      [mint(tokenA), mint(tokenB)],
      `Added ${TEST_TOKEN_AMOUNT} ${tokenA.symbol} and ${TEST_TOKEN_AMOUNT} ${tokenB.symbol} to your wallet.`
    );
  }

  async function guarded(fn) {
    try {
      setStatus(null);
      await fn();
    } catch (err) {
      setStatus({ kind: "error", text: friendlyError(err) });
    }
  }

  // --- The one action button at the bottom of each form (changes with wallet state)
  function renderAction({ label, valid, needs }) {
    if (!hasWallet) {
      return (
        <a className="button button-primary" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          Install MetaMask to trade
        </a>
      );
    }
    if (!wallet.account) {
      return (
        <button className="button button-primary" onClick={() => guarded(onConnect)}>
          Connect wallet
        </button>
      );
    }
    if (!wallet.onSepolia) {
      return (
        <button className="button button-primary" onClick={() => guarded(onSwitchNetwork)}>
          Switch to Sepolia
        </button>
      );
    }
    const short = needs?.find(([have, want]) => want && have < want);
    if (ready && short) {
      return (
        <button className="button button-primary" disabled>
          Not enough {short[2]}
        </button>
      );
    }
    return (
      <button className="button button-primary" disabled={!valid || busy || !ready} onClick={label.onClick}>
        {busy ? "Working…" : label.text}
      </button>
    );
  }

  const balA = balances?.a ?? 0n;
  const balB = balances?.b ?? 0n;
  const balLp = balances?.lp ?? 0n;
  const balIn = aToB ? balA : balB;

  const spot = toNumber(rOut, tOut.decimals) / toNumber(rIn, tIn.decimals);
  const exec = swapAmt ? toNumber(swapOut, tOut.decimals) / toNumber(swapAmt, tIn.decimals) : 0;
  const impact = swapAmt && spot > 0 ? (1 - exec / spot) * 100 : 0;

  return (
    <aside className="panel trade-panel" aria-label="Trade">
      <div className="panel-head">
        <h2>Try it</h2>
        {!hasWallet && (
          <p className="panel-sub">
            Trading needs a browser wallet like MetaMask on Sepolia. Previews on the chart work
            without one.
          </p>
        )}
        {hasWallet && !wallet.account && (
          <p className="panel-sub">Connect a wallet to trade. Previews on the chart work without one.</p>
        )}
        {hasWallet && wallet.account && !wallet.onSepolia && (
          <p className="panel-sub">Your wallet is on another network. This pool lives on Sepolia.</p>
        )}
      </div>

      {ready && (
        <div className="wallet-box">
          <p className="wallet-line">
            Connected as <span className="address">{shortAddress(wallet.account)}</span>
          </p>
          <dl className="balances">
            <div>
              <dt>{tokenA.symbol}</dt>
              <dd>{fmtAmount(toNumber(balA, tokenA.decimals))}</dd>
            </div>
            <div>
              <dt>{tokenB.symbol}</dt>
              <dd>{fmtAmount(toNumber(balB, tokenB.decimals))}</dd>
            </div>
            <div>
              <dt>LP tokens</dt>
              <dd>{fmtAmount(toNumber(balLp))}</dd>
            </div>
          </dl>
          <button className="button button-quiet" onClick={doMint} disabled={busy}>
            Get {Number(TEST_TOKEN_AMOUNT).toLocaleString("en-US")} free {tokenA.symbol} and {tokenB.symbol}
          </button>
          <p className="hint">
            Gas is paid in Sepolia ETH. If you have none,{" "}
            <a href={FAUCET_URL} target="_blank" rel="noreferrer">get some free from a faucet</a>.
          </p>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Action">
        {TABS.map(([id, name]) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`pane-${id}`}
            className="tab"
            onClick={() => {
              setTab(id);
              setStatus(null);
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "swap" && (
        <div className="form" role="tabpanel" id="pane-swap" aria-labelledby="tab-swap">
          <label className="field">
            <span className="field-label">
              You pay
              {ready && (
                <button type="button" className="link-button" onClick={() => setSwapIn(trimDecimals(formatUnits(balIn, tIn.decimals), 18))}>
                  Use all {fmtAmount(toNumber(balIn, tIn.decimals))}
                </button>
              )}
            </span>
            <span className="input-row">
              <input inputMode="decimal" placeholder="0" value={swapIn} onChange={(e) => setSwapIn(e.target.value)} />
              <span className="unit">{tIn.symbol}</span>
            </span>
          </label>

          <button
            type="button"
            className="flip"
            onClick={() => {
              setAToB((v) => !v);
              setSwapIn("");
            }}
            aria-label={`Switch direction, pay with ${tOut.symbol} instead`}
          >
            ⇅ Pay with {tOut.symbol} instead
          </button>

          <div className="field">
            <span className="field-label">You receive about</span>
            <span className="input-row readout">
              <span className="readout-value">{swapAmt ? fmtAmount(toNumber(swapOut, tOut.decimals)) : "0"}</span>
              <span className="unit">{tOut.symbol}</span>
            </span>
          </div>

          {swapAmt && swapOut > 0n && (
            <dl className="details">
              <div>
                <dt>Rate</dt>
                <dd>1 {tIn.symbol} = {fmtPrice(exec)} {tOut.symbol}</dd>
              </div>
              <div>
                <dt>Price impact, fee included</dt>
                <dd className={impact > 5 ? "warn" : ""}>{impact.toFixed(2)}%</dd>
              </div>
              <div>
                <dt>Least you'll get</dt>
                <dd>
                  {fmtAmount(toNumber(minOut, tOut.decimals))} {tOut.symbol}
                </dd>
              </div>
            </dl>
          )}

          {renderAction({
            label: { text: `Swap ${tIn.symbol} for ${tOut.symbol}`, onClick: doSwap },
            valid: Boolean(swapAmt && swapOut > 0n),
            needs: [[balIn, swapAmt, tIn.symbol]],
          })}
        </div>
      )}

      {tab === "add" && (
        <div className="form" role="tabpanel" id="pane-add" aria-labelledby="tab-add">
          <p className="hint">
            Deposits go in at the pool's current ratio, so typing one amount fills in the other.
          </p>
          <label className="field">
            <span className="field-label">{tokenA.symbol}</span>
            <span className="input-row">
              <input inputMode="decimal" placeholder="0" value={addA} onChange={(e) => onAddAChange(e.target.value)} />
              <span className="unit">{tokenA.symbol}</span>
            </span>
          </label>
          <label className="field">
            <span className="field-label">{tokenB.symbol}</span>
            <span className="input-row">
              <input inputMode="decimal" placeholder="0" value={addB} onChange={(e) => onAddBChange(e.target.value)} />
              <span className="unit">{tokenB.symbol}</span>
            </span>
          </label>
          {lpOut > 0n && (
            <dl className="details">
              <div>
                <dt>You receive about</dt>
                <dd>{fmtAmount(toNumber(lpOut))} LP tokens</dd>
              </div>
              <div>
                <dt>Your share of the pool</dt>
                <dd>{((toNumber(lpOut) / (toNumber(lpSupply) + toNumber(lpOut))) * 100).toFixed(2)}%</dd>
              </div>
            </dl>
          )}
          {renderAction({
            label: { text: "Add liquidity", onClick: doAdd },
            valid: lpOut > 0n,
            needs: [
              [balA, amtA, tokenA.symbol],
              [balB, amtB, tokenB.symbol],
            ],
          })}
        </div>
      )}

      {tab === "remove" && (
        <div className="form" role="tabpanel" id="pane-remove" aria-labelledby="tab-remove">
          <label className="field">
            <span className="field-label">
              LP tokens to return
              {ready && balLp > 0n && (
                <button type="button" className="link-button" onClick={() => setLpIn(trimDecimals(formatUnits(balLp, 18), 18))}>
                  Use all {fmtAmount(toNumber(balLp))}
                </button>
              )}
            </span>
            <span className="input-row">
              <input inputMode="decimal" placeholder="0" value={lpIn} onChange={(e) => setLpIn(e.target.value)} />
              <span className="unit">LP</span>
            </span>
          </label>
          {lpAmt && (
            <dl className="details">
              <div>
                <dt>You receive about</dt>
                <dd>
                  {fmtAmount(toNumber(outA, tokenA.decimals))} {tokenA.symbol} and{" "}
                  {fmtAmount(toNumber(outB, tokenB.decimals))} {tokenB.symbol}
                </dd>
              </div>
            </dl>
          )}
          {ready && balLp === 0n && (
            <p className="hint">You don't have LP tokens yet. Add liquidity first to get some.</p>
          )}
          {renderAction({
            label: { text: "Withdraw", onClick: doRemove },
            valid: Boolean(lpAmt && outA > 0n),
            needs: [[balLp, lpAmt, "LP tokens"]],
          })}
        </div>
      )}

      {status && (
        <p className={`status status-${status.kind}`} role="status">
          {status.text}{" "}
          {status.hash && (
            <a href={`${EXPLORER}/tx/${status.hash}`} target="_blank" rel="noreferrer">
              View on Etherscan
            </a>
          )}
        </p>
      )}
    </aside>
  );
}
