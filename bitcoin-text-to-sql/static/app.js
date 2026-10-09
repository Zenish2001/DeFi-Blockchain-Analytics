// Bitcoin Text-to-SQL page.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n, d = 0) => (n == null ? "–" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const btc = (n, d = 4) => (n == null ? "–" : `${num(n, d)} BTC`);
  const sats = (n) => (n == null ? "–" : `${num(Math.round(n * 1e8))} sats`);
  const dateOf = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") : "–");
  const dayOf = (t) => (t ? new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "–");
  const mb = (bytes) => (bytes == null ? "–" : `${(bytes / 1e6).toFixed(2)} MB`);
  const short = (h, n = 10) => (h ? `${h.slice(0, n)}…${h.slice(-6)}` : "");
  const isHash = (v) => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);

  let overview = null;

  // ------------------------------------------------------------ tooltip
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = Math.min(ev.clientX + 12, window.innerWidth - w - 8) + "px";
    tip.style.top = ev.clientY + 14 + "px";
  }

  // --------------------------------------------------------------- price
  async function loadPrice() {
    try {
      const d = await (await fetch("/price")).json();
      if (d.price) {
        const ch = d.change_24h_pct;
        $("btc-price").innerHTML = `BTC $${num(d.price)}` + (ch == null ? "" : `<small style="color:${ch >= 0 ? "var(--ok)" : "var(--bad)"}">${ch >= 0 ? "+" : "−"}${Math.abs(ch).toFixed(2)}%</small>`);
      }
    } catch {
      /* keep last value */
    }
  }

  // ----------------------------------------------------------------- ask
  const form = $("ask-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("q").value.trim();
    if (q) ask(q);
  });
  document.querySelectorAll("#chips button").forEach((b) =>
    b.addEventListener("click", () => {
      $("q").value = b.textContent;
      ask(b.textContent);
    })
  );

  async function ask(question) {
    const btn = $("ask-btn");
    btn.disabled = true;
    const card = document.createElement("div");
    card.className = "answer";
    card.innerHTML = `<div class="answer-q">${esc(question)}</div><div class="loading">Writing SQL with Gemini and running it</div>`;
    $("answers").prepend(card);
    try {
      const res = await fetch("/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      renderAnswer(card, question, await res.json());
    } catch (err) {
      card.querySelector(".loading").outerHTML = `<p class="err">Couldn't reach the server. ${esc(err.message)}</p>`;
    } finally {
      btn.disabled = false;
    }
  }

  function renderAnswer(card, question, d) {
    let html = `<div class="answer-q">${esc(question)}</div>`;
    if (d.cannot_answer) {
      card.innerHTML = html + `<p class="notice">That question isn't about the Bitcoin data in this database, so the model declined to write SQL for it. That's the intended behaviour.</p>`;
      return;
    }
    if (d.sql) html += `<div class="sql">${esc(d.sql)}</div>`;
    if (d.error) {
      card.innerHTML = html + `<p class="err">${esc(d.error)}</p>`;
      return;
    }
    const rows = d.rows || [];
    const cols = d.cols || [];
    html += `<div class="answer-meta">
      <span>Gemini ${(d.llm_ms / 1000).toFixed(1)} s</span><span>Query ${num(d.query_ms)} ms</span>
      <span>${num(rows.length)} row${rows.length === 1 ? "" : "s"}${d.capped ? ` (first ${d.max_rows} shown)` : ""}</span>
      <span class="spacer"></span>
      <button class="btn btn-sm" data-copy>Copy SQL</button>
      ${rows.length > 1 ? `<button class="btn btn-sm" data-csv>Download CSV</button>` : ""}
    </div>`;
    if (rows.length === 1 && cols.length === 1) {
      const v = rows[0][0];
      html += isHash(v) ? `<p><a href="#" class="hash" data-hash="${esc(v)}">${esc(v)}</a></p>` : `<div class="big">${esc(typeof v === "number" ? num(v, Number.isInteger(v) ? 0 : 8) : v)}</div>`;
    } else if (rows.length) {
      // Chart only when the labels are readable (not hashes) and there's something to compare.
      const chartable = d.chart && rows.length >= 3 && !isHash(rows[0][0]);
      if (chartable) html += `<div class="chart" data-chart></div>`;
      const shown = rows.slice(0, 50);
      html += `<div class="table-wrap result-wrap"><table class="table result-table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
        ${shown.map((r) => `<tr>${r.map((v) => `<td class="${typeof v === "number" ? "r" : ""}">${cell(v)}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div>${rows.length > 50 ? `<p class="muted">Showing 50 of ${num(rows.length)} rows. Download the CSV for all of them.</p>` : ""}`;
    } else {
      html += `<p class="muted">The query ran but returned no rows.</p>`;
    }
    card.innerHTML = html;

    const copy = card.querySelector("[data-copy]");
    if (copy) copy.addEventListener("click", () => navigator.clipboard.writeText(d.sql).then(() => (copy.textContent = "Copied")));
    const csv = card.querySelector("[data-csv]");
    if (csv) csv.addEventListener("click", () => downloadCsv(cols, rows));
    const ch = card.querySelector("[data-chart]");
    if (ch) barChart(ch, d.chart.labels, d.chart.values, d.chart.dataset_label, { h: 180 });
  }

  function cell(v) {
    if (v === null) return '<span class="muted">null</span>';
    if (isHash(v)) return `<a href="#" class="hash" data-hash="${esc(v)}">${esc(short(v))}</a>`;
    if (typeof v === "number") return esc(num(v, Number.isInteger(v) ? 0 : 8));
    const s = String(v);
    return esc(s.length > 80 ? s.slice(0, 80) + "…" : s);
  }

  function downloadCsv(cols, rows) {
    const q = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const text = [cols.map(q).join(",")].concat(rows.map((r) => r.map(q).join(","))).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = "bitcoin-query.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Clicking any hash anywhere opens the explorer drawer.
  document.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-hash]");
    if (!a) return;
    e.preventDefault();
    const h = a.dataset.hash;
    try {
      const r = await (await fetch(`/api/resolve/${h}`)).json();
      if (r.type === "tx") openTx(h);
      else if (r.type === "block") openBlock(r.height);
      else openDrawer("Not found", `<p class="muted">${esc(short(h))} isn't a transaction or block in this database. It may be from a block that wasn't synced.</p>`);
    } catch {
      /* ignore */
    }
  });

  // -------------------------------------------------------------- charts
  function barChart(el, labels, values, label, opts = {}) {
    const W = opts.w || 900, H = opts.h || 220, M = { t: 10, r: 10, b: 30, l: 64 };
    const PW = W - M.l - M.r, PH = H - M.t - M.b;
    const max = Math.max(...values, 0) || 1;
    const bw = PW / values.length;
    const y = (v) => M.t + PH - (v / max) * PH;
    const fmt = opts.fmt || ((v) => (v === 0 ? "0" : Math.abs(v) >= 100 ? num(v) : Math.abs(v) >= 1 ? num(v, 2) : Number(v.toPrecision(3)).toString()));
    const ticks = [0, max / 2, max];
    const every = Math.max(1, Math.ceil(values.length / (W < 700 ? 5 : 8)));
    let g = ticks.map((t) => `<line class="gl" x1="${M.l}" x2="${M.l + PW}" y1="${y(t)}" y2="${y(t)}"/><text class="tk" x="${M.l - 8}" y="${y(t) + 4}" text-anchor="end">${esc(fmt(t))}</text>`).join("");
    values.forEach((v, i) => {
      const x = M.l + i * bw;
      g += `<rect class="bar" data-i="${i}" x="${x + bw * 0.12}" y="${y(Math.max(v, 0))}" width="${Math.max(1, bw * 0.76)}" height="${Math.max(0, M.t + PH - y(Math.max(v, 0)))}"/>`;
      if (i % every === 0) g += `<text class="tk" x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${esc(String(labels[i]).slice(0, 12))}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${g}</svg>`;
    el.querySelectorAll(".bar").forEach((b) => {
      b.addEventListener("mousemove", (ev) => {
        const i = +b.dataset.i;
        showTip(`<b>${esc(labels[i])}</b><br>${esc(label)}: ${esc(fmt(values[i]))}`, ev);
      });
      b.addEventListener("mouseleave", () => (tip.hidden = true));
    });
  }

  // ------------------------------------------------------------- dataset
  async function loadOverview() {
    const d = await (await fetch("/api/overview")).json();
    if (!d.ready) {
      setTimeout(loadOverview, 2000);
      return;
    }
    if (d.error) {
      $("dataset-sub").textContent = `Couldn't compute statistics: ${d.error}`;
      return;
    }
    overview = d.data;
    const o = overview;
    $("dataset-sub").textContent = `${num(o.blocks)} blocks between height ${num(o.height_min)} and ${num(o.height_max)}, mined ${dayOf(o.time_min)} to ${dayOf(o.time_max)}. ${num(o.db_mb)} MB of SQLite.`;
    const stat = (label, value, sub = "") => `<div class="stat"><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ""}</div>`;
    $("stats").innerHTML =
      stat("Blocks", num(o.blocks), `${mb(o.block_bytes)} of block data`) +
      stat("Transactions", num(o.transactions), `${num(o.transactions / o.blocks)} per block on average`) +
      stat("Inputs / outputs", `${num(o.inputs)} / ${num(o.outputs)}`) +
      stat("Unique addresses", num(o.addresses), "that received at least one output") +
      stat("BTC in outputs", btc(o.output_value_btc, 2), "includes change sent back to the sender") +
      stat("Fees paid", btc(o.total_fees_btc, 4), `average ${sats(o.avg_fee_btc)} per transaction`) +
      stat("Average tx size", `${num(o.avg_vsize)} vB`) +
      stat("Coinbase transactions", num(o.coinbase_txs), "one per block, pays the miner");

    const pb = o.per_block;
    barChart($("chart-tx"), pb.map((b) => b.height), pb.map((b) => b.n_tx), "Transactions", { w: 520, h: 240 });
    barChart($("chart-fees"), pb.map((b) => b.height), pb.map((b) => b.fees), "Fees (BTC)", { w: 520, h: 240 });

    const total = o.output_types.reduce((a, t) => a + t.n, 0) || 1;
    const pretty = { witness_v0_keyhash: "SegWit (P2WPKH)", witness_v0_scripthash: "SegWit (P2WSH)", witness_v1_taproot: "Taproot (P2TR)", pubkeyhash: "Legacy (P2PKH)", scripthash: "P2SH", nulldata: "OP_RETURN data", pubkey: "Pay-to-pubkey", multisig: "Bare multisig" };
    $("types").innerHTML = `<div class="types">${o.output_types
      .slice(0, 8)
      .map((t) => `<div class="row"><span title="${esc(t.type)}">${esc(pretty[t.type] || t.type)}</span><div class="track"><div class="fill" style="width:${((t.n / total) * 100).toFixed(1)}%"></div></div><span class="n">${((t.n / total) * 100).toFixed(1)}%</span></div>`)
      .join("")}</div>`;

    const lt = o.largest_tx, hf = o.highest_fee_tx;
    const busiest = pb.reduce((a, x) => (x.n_tx > a.n_tx ? x : a), pb[0]);
    $("notable").innerHTML = `<dl class="kv">
      ${lt ? `<div><dt>Most BTC moved</dt><dd><a href="#" class="hash" data-hash="${esc(lt.txid)}">${esc(short(lt.txid))}</a><br>${btc(lt.v, 2)} in block ${num(lt.height)}</dd></div>` : ""}
      ${hf ? `<div><dt>Highest fee</dt><dd><a href="#" class="hash" data-hash="${esc(hf.txid)}">${esc(short(hf.txid))}</a><br>${btc(hf.fee, 6)} for ${num(hf.vsize)} vB in block ${num(hf.height)}</dd></div>` : ""}
      ${busiest ? `<div><dt>Busiest block</dt><dd><a href="#" data-block="${busiest.height}">${num(busiest.height)}</a> with ${num(busiest.n_tx)} transactions</dd></div>` : ""}
      <div><dt>Stats computed in</dt><dd>${o.computed_in_s} s, once at startup</dd></div>
    </dl>`;

    renderBlocks(pb.slice().reverse());
    loadSchema();
  }

  // -------------------------------------------------------------- blocks
  function renderBlocks(list) {
    $("block-rows").innerHTML = list
      .map((b) => `<tr data-block="${b.height}"><td class="r"><b>${num(b.height)}</b></td><td>${dateOf(b.time)}</td><td class="r">${num(b.n_tx)}</td><td class="r">${mb(b.size)}</td><td class="r">${b.fees == null ? "–" : num(b.fees, 4)}</td></tr>`)
      .join("");
  }
  document.addEventListener("click", (e) => {
    const r = e.target.closest("[data-block]");
    if (!r) return;
    e.preventDefault();
    openBlock(+r.dataset.block);
  });

  // -------------------------------------------------------------- drawer
  const history = [];
  function openDrawer(title, html, push = true) {
    if (push) history.push({ title, html });
    $("drawer-title").textContent = title;
    $("drawer-body").innerHTML = html;
    $("drawer-back").hidden = history.length < 2;
    $("drawer").hidden = false;
    $("drawer-body").scrollTop = 0;
  }
  function closeDrawer() {
    $("drawer").hidden = true;
    history.length = 0;
  }
  document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeDrawer));
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());
  $("drawer-back").addEventListener("click", () => {
    history.pop();
    const prev = history[history.length - 1];
    if (prev) openDrawer(prev.title, prev.html, false);
  });

  async function openBlock(height) {
    openDrawer(`Block ${num(height)}`, `<p class="loading">Loading block</p>`);
    const res = await fetch(`/api/block/${height}`);
    if (!res.ok) return openDrawer(`Block ${num(height)}`, `<p class="err">Block not found.</p>`, false);
    const d = await res.json();
    const b = d.block, s = d.stats;
    history.pop();
    openDrawer(`Block ${num(b.height)}`, `
      <dl class="kv">
        <div><dt>Hash</dt><dd class="hash">${esc(b.hash)}</dd></div>
        <div><dt>Mined</dt><dd>${dateOf(b.time)} UTC</dd></div>
        <div><dt>Transactions</dt><dd>${num(b.n_tx)}</dd></div>
        <div><dt>Size / weight</dt><dd>${mb(b.size)} / ${num(b.weight)} WU</dd></div>
        <div><dt>Fees</dt><dd>${btc(s.fees, 6)} (average ${sats(s.avg_fee)}, max ${btc(s.max_fee, 6)})</dd></div>
        ${d.coinbase ? `<div><dt>Miner reward</dt><dd>${btc(d.coinbase.reward, 6)} (subsidy + fees)</dd></div>` : ""}
        <div><dt>Difficulty</dt><dd>${num(b.difficulty)}</dd></div>
        <div><dt>Previous block</dt><dd>${b.previousblockhash ? `<a href="#" class="hash" data-hash="${esc(b.previousblockhash)}">${esc(short(b.previousblockhash))}</a>` : "–"}</dd></div>
      </dl>
      <h3>Largest transactions in this block</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Transaction</th><th class="r">Output value</th><th class="r">In / out</th><th class="r">Fee</th></tr></thead>
        <tbody>${d.top_txs.map((t) => `<tr><td><a href="#" class="hash" data-hash="${esc(t.txid)}">${esc(short(t.txid))}</a>${t.tx_index === 0 ? ' <span class="lvl">coinbase</span>' : ""}</td>
          <td class="r">${btc(t.out_value, 4)}</td><td class="r">${t.n_in} / ${t.n_out}</td><td class="r">${t.fee == null ? "–" : sats(t.fee)}</td></tr>`).join("")}</tbody>
      </table></div>`);
  }

  async function openTx(txid) {
    openDrawer("Transaction", `<p class="loading">Loading transaction</p>`);
    const res = await fetch(`/api/tx/${txid}`);
    if (!res.ok) return openDrawer("Transaction", `<p class="err">Transaction not found.</p>`, false);
    const d = await res.json();
    const t = d.tx;
    const inSum = d.inputs.reduce((a, i) => a + (i.value || 0), 0);
    const outSum = d.outputs.reduce((a, o) => a + (o.value || 0), 0);
    const known = d.inputs.filter((i) => i.value != null).length;
    history.pop();
    openDrawer("Transaction", `
      <dl class="kv">
        <div><dt>TXID</dt><dd class="hash">${esc(t.txid)}</dd></div>
        <div><dt>Block</dt><dd><a href="#" data-block="${t.height}">${num(t.height)}</a>, ${dateOf(t.time)} UTC</dd></div>
        <div><dt>Size</dt><dd>${num(t.size)} bytes, ${num(t.vsize)} vB, ${num(t.weight)} WU</dd></div>
        <div><dt>Fee</dt><dd>${t.fee == null ? "–" : `${btc(t.fee, 8)} (${num((t.fee * 1e8) / t.vsize, 1)} sat/vB)`}</dd></div>
        <div><dt>Total out</dt><dd>${btc(outSum, 8)}</dd></div>
      </dl>
      <div class="io">
        <div><h3>Inputs (${num(d.n_inputs)})</h3>
          ${d.inputs.map((i) => `<div class="item">${i.is_coinbase ? "<span class='v'>Coinbase</span> <span class='muted'>new coins for the miner</span>"
            : `<span class="v">${i.value == null ? "?" : btc(i.value, 8)}</span><div class="a">${i.address ? esc(i.address) : ""}</div>
               <div class="a">from <a href="#" data-hash="${esc(i.prev_txid)}">${esc(short(i.prev_txid, 8))}</a>:${i.prev_vout}</div>`}</div>`).join("")}
          ${d.n_inputs > d.inputs.length ? `<p class="muted">…and ${num(d.n_inputs - d.inputs.length)} more</p>` : ""}
          ${known < d.inputs.length && !d.inputs[0]?.is_coinbase ? `<p class="muted">Input values marked ? come from transactions in blocks that weren't synced.</p>` : ""}
        </div>
        <div><h3>Outputs (${num(d.n_outputs)})</h3>
          ${d.outputs.map((o) => `<div class="item"><span class="v">${btc(o.value, 8)}</span><div class="a">${o.address ? esc(o.address) : esc(o.type || "")}</div></div>`).join("")}
          ${d.n_outputs > d.outputs.length ? `<p class="muted">…and ${num(d.n_outputs - d.outputs.length)} more</p>` : ""}
        </div>
      </div>
      ${known === d.inputs.length && known > 0 ? `<p class="muted">Inputs ${btc(inSum, 8)} − outputs ${btc(outSum, 8)} = fee ${btc(inSum - outSum, 8)}</p>` : ""}`);
  }

  // -------------------------------------------------------------- schema
  async function loadSchema() {
    const tables = await (await fetch("/api/schema")).json();
    const order = ["blocks", "transactions", "tx_inputs", "tx_outputs"];
    tables.sort((a, b) => (order.indexOf(a.name) + 99) % 99 - (order.indexOf(b.name) + 99) % 99);
    $("schema-cards").innerHTML = tables
      .filter((t) => t.name !== "sync_state")
      .map((t) => `<div class="card"><h3>${esc(t.name)}</h3><div class="rows">${t.rows == null ? "" : num(t.rows) + " rows"}</div>
        <ul>${t.columns.map((c) => `<li class="${c.pk ? "pk" : ""}">${esc(c.name)}<span>${esc((c.type || "").toLowerCase())}${c.pk ? " · key" : ""}</span></li>`).join("")}</ul></div>`)
      .join("");
  }

  // ----------------------------------------------------------- benchmark
  async function loadBenchmark() {
    const tests = await (await fetch("/api/benchmark")).json();
    if (!tests.length) {
      $("acc-sub").textContent = "Benchmark results aren't available.";
      return;
    }
    const passed = tests.filter((t) => t.passed).length;
    $("acc-sub").innerHTML = `I wrote ${tests.length} test questions with known answers, from easy to hard, and compared the results of Gemini's SQL with mine. <b>${passed} of ${tests.length} correct (${Math.round((passed / tests.length) * 100)}%)</b>. The misses are listed too. Click a row to compare the SQL.`;
    $("bench-rows").innerHTML = tests
      .map((t) => `<tr data-bench="${t.n}" style="cursor:pointer"><td class="r">${t.n}</td><td><span class="lvl">${esc(t.level)}</span></td><td>${esc(t.question)}</td>
        <td class="${t.passed ? "pass" : "fail"}">${t.passed ? "Correct" : "Wrong"}</td><td class="muted">SQL ▾</td></tr>
        <tr class="bench-sql" id="bench-${t.n}" hidden><td></td><td colspan="4"><span class="muted">My SQL</span><code>${esc(t.expected)}</code><span class="muted">Gemini's SQL</span><code>${esc(t.llm_sql)}</code></td></tr>`)
      .join("");
    $("bench-rows").addEventListener("click", (e) => {
      const r = e.target.closest("[data-bench]");
      if (r) $(`bench-${r.dataset.bench}`).hidden = !$(`bench-${r.dataset.bench}`).hidden;
    });
  }

  loadPrice();
  setInterval(loadPrice, 60000);
  loadOverview();
  loadBenchmark();
})();
