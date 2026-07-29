<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:232526,100:414345&height=180&section=header&text=Bitcoin%20Text-to-SQL&fontSize=38&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Natural%20Language%20Queries%20Over%20a%20Real%20Bitcoin%20Node&descAlignY=62&descSize=15" width="100%"/>

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/downloads/)
[![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)]()
[![Gemini](https://img.shields.io/badge/Gemini%20API-4285F4?style=for-the-badge&logo=google&logoColor=white)]()
[![Bitcoin Core](https://img.shields.io/badge/Bitcoin%20Core-RPC-F7931A?style=for-the-badge&logo=bitcoin&logoColor=white)]()

</div>

<br/>

A Bitcoin blockchain data pipeline with natural language querying, powered by Gemini AI.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## What It Does

- Syncs Bitcoin blockchain data from a running `bitcoind` node into SQLite
- Accepts natural language questions and returns answers from the database
- Uses Gemini AI to convert questions into SQL queries automatically
- Rejects questions that cannot be answered from the Bitcoin database
- Displays real-time Bitcoin price from CoinGecko
- Includes a web-based chat UI with automatic chart generation

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## In Action

<p align="center">
  <img src="./screenshots/chat-ui-1.png" width="90%" alt="Bitcoin Text-to-SQL chat interface, showing generated SQL and results" />
</p>

Each question is translated into real SQL, executed against the synced database, and returned with the exact query shown alongside the answer:

| Question | Generated SQL | Answer |
|---|---|---|
| "How many blocks are there?" | `SELECT COUNT(*) FROM blocks` | `26` |
| "What is the highest block height?" | `SELECT MAX(height) FROM blocks` | `659875` |
| "How many transactions are there?" | `SELECT COUNT(txid) FROM transactions` | `48044` |
| "What is the largest output value in BTC?" | `SELECT MAX(value) FROM tx_outputs` | `16806.85` |
| "Which block has the most transactions?" | `SELECT hash FROM blocks ORDER BY n_tx DESC LIMIT 1` | full block hash returned |

<p align="center">
  <img src="./screenshots/chat-ui-2.png" width="90%" alt="Bitcoin Text-to-SQL correctly rejecting an out-of-scope question" />
</p>

The pipeline also correctly **rejects out-of-scope questions** rather than hallucinating an answer — asking *"What is the weather today?"* returns:

> *This question cannot be answered from the Bitcoin database.*

That rejection behavior is deliberate, not a failure case — a text-to-SQL system that will generate *something* for any input is far less trustworthy than one that knows the boundaries of its own dataset.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Tools

<div align="center">

| Tool | Role |
|---|---|
| Bitcoin Core | Full node for blockchain data via RPC |
| SQLite | Stores blocks, transactions, inputs, outputs |
| Gemini API | Converts natural language to SQL |
| Flask | Web server for the chat UI |
| CoinGecko API | Real-time Bitcoin price (free, no key needed) |
| Chart.js | Automatic chart generation for query results |

</div>

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Database Stats

- 65 blocks (heights 650,622 to 656,923)
- 147,741 transactions
- 423,388 transaction outputs
- 345,693 distinct addresses
- Largest output: 25,778 BTC

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Structure

```
bitcoin-text-to-sql/
├── schema.sql            # SQLite schema for blocks/transactions/inputs/outputs
├── ingest.py              # Pulls blocks from bitcoind RPC into SQLite
├── text_to_sql.py         # Natural language -> SQL -> answer (CLI)
├── chat_ui.py              # Web chat UI with charts and price display
├── fetch_prices.py        # Fetches Bitcoin price from CoinGecko
├── test_cases.py           # Test cases across easy/medium/hard difficulty
├── test_results.txt        # Test results
├── hard_test_cases.py      # Cases illustrating current system limits
└── screenshots/            # Chat UI screenshots used in this README
```

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Usage

**Fill the database**
```bash
python3 ingest.py --db bitcoin.db --schema schema.sql
```

**Ask a question (CLI)**
```bash
python3 text_to_sql.py "how many blocks are there?" --db bitcoin.db
```

**Start the chat UI**
```bash
pip3 install flask google-genai requests
export GEMINI_API_KEY=your_key
python3 chat_ui.py --db bitcoin.db
# Open http://localhost:5000
```

**Fetch the Bitcoin price**
```bash
python3 fetch_prices.py --db bitcoin.db
```

**Run the test suite**
```bash
python3 test_cases.py --db bitcoin.db --with-llm
```

**Schedule the ingester (every 5 minutes)**
```bash
crontab -e
# */5 * * * * cd /path/to/bitcoin-text-to-sql && python3 ingest.py --db bitcoin.db >> ingest.log 2>&1
```

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Test Results

9 of 12 test cases pass across easy, medium, and hard difficulty tiers. The remaining cases — covering block-size ranking and largest-total-output queries — are documented in `hard_test_cases.py` as known limitations of the current query-generation approach.

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:232526,100:414345&height=3&width=100%"/>

## Note on Data Scope

Bitcoin Core was run with `prune=70000` due to local disk constraints. The dataset covers a representative slice of the chain rather than the full history, which is sufficient for demonstrating the query pipeline end-to-end.

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:414345,100:232526&height=90&section=footer" width="100%"/>

</div>
