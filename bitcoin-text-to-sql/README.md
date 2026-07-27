# Bitcoin Text-to-SQL Pipeline

A Bitcoin blockchain data pipeline with natural language querying, powered by Gemini AI.

## What It Does

- Syncs Bitcoin blockchain data from a running `bitcoind` node into SQLite
- Accepts natural language questions and returns answers from the database
- Uses Gemini AI to convert questions into SQL queries automatically
- Rejects questions that cannot be answered from the Bitcoin database
- Displays real-time Bitcoin price from CoinGecko
- Includes a web-based chat UI with automatic chart generation

## Tools

| Tool | Role |
|---|---|
| Bitcoin Core | Full node for blockchain data via RPC |
| SQLite | Stores blocks, transactions, inputs, outputs |
| Gemini API | Converts natural language to SQL |
| Flask | Web server for the chat UI |
| CoinGecko API | Real-time Bitcoin price (free, no key needed) |
| Chart.js | Automatic chart generation for query results |

## Database Stats

- 65 blocks (heights 650,622 to 656,923)
- 147,741 transactions
- 423,388 transaction outputs
- 345,693 distinct addresses
- Largest output: 25,778 BTC

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
└── hard_test_cases.py      # Cases illustrating current system limits
```

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

## Test Results

9 of 12 test cases pass across easy, medium, and hard difficulty tiers. The remaining cases — covering block-size ranking and largest-total-output queries — are documented in `hard_test_cases.py` as known limitations of the current query-generation approach.

## Note on Data Scope

Bitcoin Core was run with `prune=70000` due to local disk constraints. The dataset covers a representative slice of the chain rather than the full history, which is sufficient for demonstrating the query pipeline end-to-end.
