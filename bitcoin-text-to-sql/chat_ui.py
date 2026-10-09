#!/usr/bin/env python3
"""
chat_ui.py - Web UI for the Bitcoin Text-to-SQL pipeline.

  - Ask in plain English: Gemini writes SQLite, which runs read-only
    against bitcoin.db (blocks synced from a Bitcoin Core full node).
  - Dataset overview, block and transaction explorer, schema browser,
    and the 12-question accuracy benchmark from test_results.txt.

Usage:
  pip3 install -r requirements.txt
  export GEMINI_API_KEY=your_key
  python3 chat_ui.py --db /path/to/bitcoin.db
  Open http://localhost:5000
"""

import argparse
import threading
import os
import re
import sqlite3
import time

import requests
from flask import Flask, abort, jsonify, render_template, request
from google import genai
from google.genai import types

app = Flask(__name__)
app.json.sort_keys = False
HERE = os.path.dirname(os.path.abspath(__file__))
GITHUB_URL = "https://github.com/Zenish2001/DeFi-Blockchain-Analytics/tree/main/bitcoin-text-to-sql"
DB_PATH = os.environ.get("DB_PATH")

# Limits for running on a public server.
MAX_ROWS = 500              # rows returned to the browser per question
QUERY_TIMEOUT_SEC = 15      # stop runaway SQL (e.g. a full scan with no LIMIT)
ASKS_PER_MINUTE = 6         # per visitor IP
ASKS_PER_DAY = 300          # whole site, protects the Gemini free quota
_ask_log = {}               # ip -> list of timestamps
_day = {"date": None, "count": 0}


def _rate_limited(ip):
    now = time.time()
    today = time.strftime("%Y-%m-%d")
    if _day["date"] != today:
        _day["date"], _day["count"] = today, 0
    if _day["count"] >= ASKS_PER_DAY:
        return "The demo has hit its daily question limit. Please try again tomorrow."
    recent = [t for t in _ask_log.get(ip, []) if now - t < 60]
    if len(recent) >= ASKS_PER_MINUTE:
        return "Too many questions in a minute. Wait a moment and try again."
    recent.append(now)
    _ask_log[ip] = recent
    _day["count"] += 1
    return None
MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = (
    "You are a SQL developer that is expert in Bitcoin and you answer natural "
    "language questions about the bitcoind database in a sqlite database. "
    "You always only respond with SQL statements that are correct. "
    "Never include any explanation, markdown, or code fences. "
    "Only output the raw SQL query and nothing else. "
    "If the question cannot be answered from the Bitcoin database, "
    "respond with exactly: CANNOT_ANSWER"
)

def connect_ro():
    """Read-only connection with a time limit on every query."""
    uri = f"file:{os.path.abspath(DB_PATH)}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def extract_schema(db_path):
    conn = sqlite3.connect(f"file:{os.path.abspath(db_path)}?mode=ro", uri=True)
    rows = conn.execute(
        "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC"
    ).fetchall()
    conn.close()
    return "\n".join(r[0].strip() + ";" for r in rows)


def clean_sql(text):
    text = text.strip()
    if "CANNOT_ANSWER" in text.upper():
        return "CANNOT_ANSWER"
    text = re.sub(r"```(?:sql)?", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"```", "", text).strip()
    text = re.sub(r"^(sqlite|sql|here\s+is.*?:|answer:)\s*", "", text, flags=re.IGNORECASE).strip()
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if line.strip().upper().startswith(("SELECT", "WITH", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP")):
            text = "\n".join(lines[i:])
            break
    return text.strip()


def generate_sql(question):
    schema = extract_schema(DB_PATH)
    client = genai.Client()
    resp = client.models.generate_content(
        model=MODEL,
        contents=f"Database schema:\n{schema}\n\nQuestion: {question}\n\nReturn only raw SQLite SQL or CANNOT_ANSWER.",
        config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT, temperature=0),
    )
    return clean_sql(resp.text)


def is_read_only(sql):
    """Only a single SELECT/WITH statement may run. The connection is also
    opened read-only, so this is a second line of defence."""
    s = sql.strip().rstrip(";").strip()
    if ";" in s:
        return False
    return bool(re.match(r"^(select|with)\b", s, flags=re.IGNORECASE))


def run_query(sql):
    conn = sqlite3.connect(f"file:{os.path.abspath(DB_PATH)}?mode=ro", uri=True)
    deadline = time.time() + QUERY_TIMEOUT_SEC
    # Returning non-zero from the progress handler aborts the query.
    conn.set_progress_handler(lambda: 1 if time.time() > deadline else 0, 10_000)
    try:
        cur = conn.execute(sql)
        cols = [c[0] for c in cur.description] if cur.description else []
        rows = cur.fetchmany(MAX_ROWS + 1)
        capped = len(rows) > MAX_ROWS
        return cols, rows[:MAX_ROWS], capped, None
    except sqlite3.OperationalError as e:
        if "interrupted" in str(e):
            return [], [], False, f"The query took longer than {QUERY_TIMEOUT_SEC} seconds and was stopped. Try a narrower question."
        return [], [], False, str(e)
    except sqlite3.Error as e:
        return [], [], False, str(e)
    finally:
        conn.close()


def should_chart(cols, rows):
    if len(rows) < 2 or len(cols) < 2:
        return None
    try:
        labels = [str(r[0]) for r in rows[:20]]
        values = [float(r[1]) for r in rows[:20]]
        return {"labels": labels, "values": values, "dataset_label": cols[1]}
    except (ValueError, TypeError):
        return None


# ------------------------------------------------------------- overview
# Computed once in the background at startup: the database is read-only,
# so the numbers never change while the server runs.
_overview = {"ready": False, "error": None, "data": None}


def compute_overview():
    try:
        t0 = time.time()
        conn = connect_ro()
        q = lambda sql, *a: conn.execute(sql, a).fetchone()  # noqa: E731
        b = q("SELECT COUNT(*) n, MIN(height) lo, MAX(height) hi, MIN(time) t0, MAX(time) t1, "
              "SUM(size) bytes FROM blocks")
        tx = q("SELECT COUNT(*) n, SUM(fee) fees, AVG(fee) avg_fee, AVG(vsize) avg_vsize, "
               "SUM(CASE WHEN tx_index = 0 THEN 1 ELSE 0 END) coinbase FROM transactions")
        outs = q("SELECT COUNT(*) n, SUM(value) total FROM tx_outputs")
        ins = q("SELECT COUNT(*) n FROM tx_inputs")
        addrs = q("SELECT COUNT(DISTINCT address) n FROM tx_outputs WHERE address IS NOT NULL")
        per_block = [dict(r) for r in conn.execute(
            "SELECT b.height, b.time, b.n_tx, b.size, b.weight, "
            "COALESCE((SELECT SUM(fee) FROM transactions t WHERE t.block_hash = b.hash), 0) AS fees "
            "FROM blocks b ORDER BY b.height")]
        types_ = [dict(r) for r in conn.execute(
            "SELECT COALESCE(script_pubkey_type, 'unknown') AS type, COUNT(*) AS n, SUM(value) AS value "
            "FROM tx_outputs GROUP BY 1 ORDER BY n DESC")]
        biggest = q("SELECT t.txid, SUM(o.value) v, b.height FROM tx_outputs o "
                    "JOIN transactions t ON t.txid = o.txid JOIN blocks b ON b.hash = t.block_hash "
                    "WHERE t.tx_index > 0 GROUP BY o.txid ORDER BY v DESC LIMIT 1")
        top_fee = q("SELECT t.txid, t.fee, t.vsize, b.height FROM transactions t "
                    "JOIN blocks b ON b.hash = t.block_hash WHERE t.fee IS NOT NULL ORDER BY t.fee DESC LIMIT 1")
        counts = {}
        for name in ("blocks", "transactions", "tx_inputs", "tx_outputs"):
            counts[name] = q(f"SELECT COUNT(*) FROM {name}")[0]
        conn.close()
        _overview["data"] = {
            "blocks": b["n"], "height_min": b["lo"], "height_max": b["hi"],
            "time_min": b["t0"], "time_max": b["t1"], "block_bytes": b["bytes"],
            "transactions": tx["n"], "coinbase_txs": tx["coinbase"],
            "total_fees_btc": tx["fees"], "avg_fee_btc": tx["avg_fee"], "avg_vsize": tx["avg_vsize"],
            "outputs": outs["n"], "inputs": ins["n"], "output_value_btc": outs["total"],
            "addresses": addrs["n"],
            "db_mb": round(os.path.getsize(DB_PATH) / 1e6),
            "per_block": per_block, "output_types": types_,
            "largest_tx": dict(biggest) if biggest else None,
            "highest_fee_tx": dict(top_fee) if top_fee else None,
            "table_counts": counts,
            "computed_in_s": round(time.time() - t0, 1),
        }
        _overview["ready"] = True
    except Exception as e:  # keep the page usable even if stats fail
        _overview["error"] = str(e)
        _overview["ready"] = True


def table_columns():
    conn = connect_ro()
    out = []
    for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' "
                                "AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        cols = [{"name": c["name"], "type": c["type"], "pk": bool(c["pk"])}
                for c in conn.execute(f"PRAGMA table_info({name})")]
        out.append({"name": name, "columns": cols})
    conn.close()
    return out


def parse_benchmark():
    """Read the 12-question benchmark results that test_cases.py wrote."""
    path = os.path.join(HERE, "test_results.txt")
    if not os.path.exists(path):
        return []
    tests, cur = [], None
    for line in open(path, encoding="utf-8"):
        m = re.match(r"=== Test (\d+) \[(\w+)\] ===", line)
        if m:
            cur = {"n": int(m.group(1)), "level": m.group(2), "question": "", "expected": "", "llm_sql": "",
                   "passed": None}
            tests.append(cur)
        elif cur is not None:
            if line.startswith("Q:"):
                cur["question"] = line[2:].strip()
            elif line.startswith("SQL:"):
                cur["expected"] = line[4:].strip()
            elif line.startswith("LLM SQL:"):
                cur["llm_sql"] = line[8:].strip()
            elif line.startswith("RESULT:"):
                cur["passed"] = "PASS" in line
    return tests


BENCHMARK = parse_benchmark()


# ---------------------------------------------------------------- price
_price = {"t": 0, "data": None}


def get_btc_price():
    if time.time() - _price["t"] < 30 and _price["data"]:
        return _price["data"]
    try:
        resp = requests.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": "bitcoin", "vs_currencies": "usd", "include_24hr_change": "true"}, timeout=5)
        d = resp.json()["bitcoin"]
        _price.update(t=time.time(), data={"price": d["usd"], "change_24h_pct": d.get("usd_24h_change")})
    except Exception:
        try:  # fallback: Coinbase spot (no 24h change)
            r = requests.get("https://api.coinbase.com/v2/prices/BTC-USD/spot", timeout=5)
            _price.update(t=time.time(), data={"price": float(r.json()["data"]["amount"]), "change_24h_pct": None})
        except Exception:
            pass
    return _price["data"]


# --------------------------------------------------------------- routes
@app.route("/")
def index():
    return render_template("index.html", github_url=GITHUB_URL)


@app.route("/price")
def price():
    d = get_btc_price() or {}
    return jsonify({"price": d.get("price"), "change_24h_pct": d.get("change_24h_pct")})


@app.route("/api/overview")
def overview():
    return jsonify(_overview)


@app.route("/api/schema")
def schema():
    counts = (_overview.get("data") or {}).get("table_counts", {})
    return jsonify([{**t, "rows": counts.get(t["name"])} for t in table_columns()])


@app.route("/api/benchmark")
def benchmark():
    return jsonify(BENCHMARK)


@app.route("/api/blocks")
def blocks():
    if _overview.get("data"):
        return jsonify(list(reversed(_overview["data"]["per_block"])))
    conn = connect_ro()
    rows = [dict(r) for r in conn.execute("SELECT height, time, n_tx, size, weight FROM blocks ORDER BY height DESC")]
    conn.close()
    return jsonify(rows)


@app.route("/api/block/<int:height>")
def block(height):
    conn = connect_ro()
    b = conn.execute("SELECT * FROM blocks WHERE height = ?", (height,)).fetchone()
    if not b:
        conn.close()
        abort(404)
    stats = conn.execute(
        "SELECT COUNT(*) n, SUM(fee) fees, AVG(fee) avg_fee, MAX(fee) max_fee, AVG(vsize) avg_vsize "
        "FROM transactions WHERE block_hash = ?", (b["hash"],)).fetchone()
    top = [dict(r) for r in conn.execute(
        "SELECT t.txid, t.tx_index, t.fee, t.vsize, "
        "(SELECT SUM(value) FROM tx_outputs o WHERE o.txid = t.txid) AS out_value, "
        "(SELECT COUNT(*) FROM tx_inputs i WHERE i.txid = t.txid) AS n_in, "
        "(SELECT COUNT(*) FROM tx_outputs o WHERE o.txid = t.txid) AS n_out "
        "FROM transactions t WHERE t.block_hash = ? ORDER BY out_value DESC LIMIT 15", (b["hash"],))]
    coinbase = conn.execute(
        "SELECT t.txid, (SELECT SUM(value) FROM tx_outputs o WHERE o.txid = t.txid) AS reward "
        "FROM transactions t WHERE t.block_hash = ? AND t.tx_index = 0", (b["hash"],)).fetchone()
    conn.close()
    keep = ["hash", "height", "time", "n_tx", "size", "strippedsize", "weight", "difficulty", "nonce", "bits",
            "version_hex", "merkleroot", "previousblockhash", "nextblockhash"]
    return jsonify({"block": {k: b[k] for k in keep if k in b.keys()}, "stats": dict(stats),
                    "coinbase": dict(coinbase) if coinbase else None, "top_txs": top})


@app.route("/api/tx/<txid>")
def tx(txid):
    if not re.fullmatch(r"[0-9a-fA-F]{64}", txid):
        abort(400)
    conn = connect_ro()
    t = conn.execute(
        "SELECT t.txid, t.wtxid, t.tx_index, t.version, t.size, t.vsize, t.weight, t.locktime, t.fee, "
        "b.height, b.time FROM transactions t JOIN blocks b ON b.hash = t.block_hash WHERE t.txid = ?",
        (txid.lower(),)).fetchone()
    if not t:
        conn.close()
        abort(404)
    ins = [dict(r) for r in conn.execute(
        "SELECT i.vin_index, i.prev_txid, i.prev_vout, i.coinbase IS NOT NULL AS is_coinbase, "
        "p.value, p.address, p.script_pubkey_type AS type "
        "FROM tx_inputs i LEFT JOIN tx_outputs p ON p.txid = i.prev_txid AND p.n = i.prev_vout "
        "WHERE i.txid = ? ORDER BY i.vin_index LIMIT 200", (txid.lower(),))]
    outs = [dict(r) for r in conn.execute(
        "SELECT n, value, address, script_pubkey_type AS type FROM tx_outputs WHERE txid = ? ORDER BY n LIMIT 200",
        (txid.lower(),))]
    counts = conn.execute("SELECT (SELECT COUNT(*) FROM tx_inputs WHERE txid = ?), "
                          "(SELECT COUNT(*) FROM tx_outputs WHERE txid = ?)", (txid.lower(), txid.lower())).fetchone()
    conn.close()
    return jsonify({"tx": dict(t), "inputs": ins, "outputs": outs, "n_inputs": counts[0], "n_outputs": counts[1]})


@app.route("/api/resolve/<h>")
def resolve(h):
    """Is this 64-hex string a transaction or a block in the database?"""
    if not re.fullmatch(r"[0-9a-fA-F]{64}", h):
        abort(400)
    conn = connect_ro()
    h = h.lower()
    if conn.execute("SELECT 1 FROM transactions WHERE txid = ?", (h,)).fetchone():
        conn.close()
        return jsonify({"type": "tx", "txid": h})
    row = conn.execute("SELECT height FROM blocks WHERE hash = ?", (h,)).fetchone()
    conn.close()
    if row:
        return jsonify({"type": "block", "height": row["height"]})
    return jsonify({"type": None})


@app.route("/ask", methods=["POST"])
def ask():
    question = (request.json or {}).get("question", "").strip()[:500]
    if not question:
        return jsonify({"error": "empty question"})
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    limited = _rate_limited(ip)
    if limited:
        return jsonify({"error": limited})
    try:
        t0 = time.time()
        sql = generate_sql(question)
        llm_ms = round((time.time() - t0) * 1000)
        if sql == "CANNOT_ANSWER":
            return jsonify({"cannot_answer": True, "llm_ms": llm_ms})
        if not is_read_only(sql):
            return jsonify({"sql": sql, "error": "Only read-only SELECT queries are allowed here."})
        t1 = time.time()
        cols, rows, capped, err = run_query(sql)
        query_ms = round((time.time() - t1) * 1000)
        if err:
            return jsonify({"sql": sql, "error": err, "llm_ms": llm_ms})
        return jsonify({
            "sql": sql, "cols": cols,
            "rows": [list(r) for r in rows],
            "capped": capped, "max_rows": MAX_ROWS,
            "llm_ms": llm_ms, "query_ms": query_ms,
            "chart": should_chart(cols, rows),
        })
    except Exception as e:
        return jsonify({"error": str(e)})


def start_background():
    if DB_PATH and os.path.exists(DB_PATH):
        threading.Thread(target=compute_overview, daemon=True).start()
    else:
        _overview.update(ready=True, error=f"Database not found at {DB_PATH}")


if DB_PATH:  # running under gunicorn with DB_PATH set
    start_background()


def main():
    global DB_PATH
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB_PATH, required=DB_PATH is None)
    ap.add_argument("--port", type=int, default=5000)
    args = ap.parse_args()
    if args.db != DB_PATH:
        DB_PATH = args.db
        start_background()
    print("Starting Bitcoin Text-to-SQL...")
    print(f"Open http://localhost:{args.port} in your browser")
    app.run(debug=False, port=args.port)


if __name__ == "__main__":
    main()
