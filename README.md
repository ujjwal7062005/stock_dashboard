# 📈 StockLens — Interactive Stock Analytics Dashboard

A data-analyst/data-engineer portfolio project: a Flask backend serving
JSON APIs over OHLCV stock data, and an interactive, responsive
HTML/CSS/JS dashboard on top (Chart.js for visualizations).

## Features
- **Ticker, date-range, and quick-range filters** (1M / 3M / 6M / 1Y / All)
- **KPI cards**: current price, period change, high/low, avg volume, volatility
- **Price chart** with toggleable 7-day and 30-day moving averages, and a
  line / high-low band ("OHLC-ish") view switch
- **Volume chart** and a **sector comparison** chart across all tickers
- **CSV export** of the currently filtered slice (a common data-analyst task)
- **Dark/light theme toggle** — charts re-render with matching colors
- Fully **responsive layout** (CSS Grid + Flexbox, works down to mobile)
- Works **fully offline** — ships with a synthetic-but-realistic dataset
  generator, no external API keys needed

## Project structure
```
stock_dashboard/
├── app.py                  # Flask app + REST API endpoints
├── generate_data.py         # Generates data/stocks.csv (synthetic OHLCV)
├── requirements.txt
├── data/
│   └── stocks.csv           # Pre-generated sample dataset (5 tickers, 2 yrs)
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css        # All styling — flexible, themeable, responsive
    └── js/
        └── script.js         # Fetches API data, renders Chart.js charts
```

## Setup
```bash
cd stock_dashboard
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

# (data/stocks.csv is already included, but you can regenerate it)
python generate_data.py

python app.py
```
Then open **http://127.0.0.1:5000** in your browser.

## API endpoints (useful if you want to extend this)
| Endpoint | Description |
|---|---|
| `GET /api/tickers` | List of tickers + sectors |
| `GET /api/data/<ticker>?start=&end=` | OHLCV series + moving averages |
| `GET /api/summary/<ticker>?start=&end=` | KPI summary for a ticker/range |
| `GET /api/sector-comparison?start=&end=` | % change per ticker across sectors |
| `GET /api/export/<ticker>?start=&end=` | Download filtered slice as CSV |

## Ideas to extend it (good for a portfolio writeup)
- Swap `data/stocks.csv` for a real feed (e.g. Alpha Vantage, yfinance) —
  the API layer barely needs to change
- Add a `/api/correlation` endpoint + heatmap comparing tickers
- Add caching (Flask-Caching) or a real database (SQLite/Postgres) behind
  the pandas layer to show data-engineering chops
- Containerize with Docker for deployment
- Add authentication + per-user saved "watchlists"

## Tech stack
Flask · pandas · numpy · vanilla JS · Chart.js · CSS Grid/Flexbox
