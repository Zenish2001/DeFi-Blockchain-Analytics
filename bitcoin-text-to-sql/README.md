# Bitcoin Text-to-SQL

Ask questions about real Bitcoin blocks in plain English. Gemini writes the SQL, and it runs read-only on data synced from my own Bitcoin Core node.

**[Live demo](http://18.224.206.193:8080)**

![Bitcoin Text-to-SQL](../docs/bitcoin.png)

## What you can do

- **Ask** things like *"Which 5 transactions moved the most BTC?"* and see the SQL, the result, a chart when it fits, and how long it took. Download results as CSV.
- **Explore** every synced block, its largest transactions, and each transaction's inputs and outputs.
- **See the dataset** at a glance: blocks, transactions, fees, addresses and output types (SegWit, Taproot, legacy).
- **Check the accuracy**: my 12-question benchmark, with the misses shown.

Questions that aren't about this data (*"What's the weather?"*) are declined instead of answered with made-up SQL.

## Skills shown

| Area | What this project uses |
|---|---|
| Blockchain data | Bitcoin Core JSON-RPC (`getblock` verbosity 2), UTXO model (inputs, outputs, fees) |
| Data engineering | Normalized SQLite schema, indexes, resumable sync |
| AI | Gemini Text-to-SQL, schema-in-prompt design, refusing off-topic questions, benchmarking |
| Backend | Python, Flask, SQL safety (read-only, single SELECT, time and row limits), rate limiting |
| Frontend | JavaScript, SVG charts, block and transaction explorer |
| DevOps | Docker, Gunicorn, AWS EC2 |

## Requirements

- Python 3.10+
- A free [Gemini API key](https://aistudio.google.com/apikey)
- A `bitcoin.db`. To build one: a synced [Bitcoin Core](https://bitcoincore.org/en/download/) node with RPC enabled, then `ingest.py`
- Optional: Docker

## How it works

```
Bitcoin Core node ──RPC──> ingest.py ──> SQLite (blocks, transactions, tx_inputs, tx_outputs)
                                                │
Your question + schema ──> Gemini 2.5 Flash ──> SQL ──> read-only query ──> result on the page
```

1. **`ingest.py`** calls `getblock` (verbosity 2) on my node and writes normalized rows. It resumes from where it stopped and can run on a schedule.
2. **`chat_ui.py`** sends the question and the schema to Gemini, which must return SQL only, or `CANNOT_ANSWER`.
3. The SQL must be a single `SELECT`. It runs on a read-only connection with a **15-second limit** and **500-row cap**. The public demo also allows **6 questions a minute per visitor**.

## Accuracy

12 questions with known answers, from easy to hard, comparing the results of Gemini's SQL with my reference SQL: **9 of 12 correct (75%)**. The three misses are medium and hard questions involving rankings and per-block aggregation. Details in `test_results.txt`, and on the live page.

## Run it

```bash
pip install -r requirements.txt
export GEMINI_API_KEY=your_key

# 1. sync blocks from your node (credentials via environment variables)
export BITCOIN_RPC_USER=... BITCOIN_RPC_PASS=...
python ingest.py --db bitcoin.db --schema schema.sql

# 2. start the web app
python chat_ui.py --db bitcoin.db          # http://localhost:5000

# command line only
python text_to_sql.py "how many blocks are there?" --db bitcoin.db

# benchmark
python test_cases.py --db bitcoin.db --with-llm
```

**Docker** (used for the live demo): the image doesn't contain the database. Mount it read-only:

```bash
docker build -t btc-sql .
docker run -p 8000:8000 -e GEMINI_API_KEY=... -v /path/to/data:/data:ro btc-sql
```

## Files

| File | Purpose |
|---|---|
| `schema.sql` | The four tables and their indexes |
| `ingest.py` | Syncs blocks from Bitcoin Core over RPC |
| `chat_ui.py` | Flask web app (question box, explorer, stats) |
| `templates/`, `static/` | The web page |
| `text_to_sql.py` | Same pipeline from the command line |
| `test_cases.py`, `test_results.txt` | The 12-question benchmark and its results |
| `fetch_prices.py` | Optional BTC price history table |
