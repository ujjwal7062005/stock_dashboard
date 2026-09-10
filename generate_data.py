"""
Generates realistic synthetic daily OHLCV data for a handful of tickers
so the dashboard works fully offline (no external API / internet needed).
Run once: python generate_data.py
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

np.random.seed(42)

TICKERS = {
    "TECHX": {"start_price": 145.0, "vol": 0.020, "drift": 0.0006, "sector": "Technology"},
    "GREENE": {"start_price": 62.0,  "vol": 0.018, "drift": 0.0004, "sector": "Energy"},
    "MEDIQ":  {"start_price": 88.0,  "vol": 0.015, "drift": 0.0003, "sector": "Healthcare"},
    "FINBK":  {"start_price": 210.0, "vol": 0.012, "drift": 0.0002, "sector": "Finance"},
    "RETAL":  {"start_price": 34.0,  "vol": 0.025, "drift": 0.0005, "sector": "Retail"},
}

DAYS = 730  # ~2 years of trading history
end_date = datetime(2026, 9, 9)
all_dates = pd.bdate_range(end=end_date, periods=DAYS)  # business days only

rows = []
for ticker, cfg in TICKERS.items():
    price = cfg["start_price"]
    for d in all_dates:
        daily_ret = np.random.normal(cfg["drift"], cfg["vol"])
        open_p = price
        close_p = max(0.5, open_p * (1 + daily_ret))
        high_p = max(open_p, close_p) * (1 + abs(np.random.normal(0, cfg["vol"] / 2)))
        low_p = min(open_p, close_p) * (1 - abs(np.random.normal(0, cfg["vol"] / 2)))
        volume = int(np.random.normal(3_000_000, 900_000) * (1 + abs(daily_ret) * 8))
        volume = max(volume, 50_000)

        rows.append({
            "date": d.strftime("%Y-%m-%d"),
            "ticker": ticker,
            "sector": cfg["sector"],
            "open": round(open_p, 2),
            "high": round(high_p, 2),
            "low": round(low_p, 2),
            "close": round(close_p, 2),
            "volume": volume,
        })
        price = close_p

df = pd.DataFrame(rows)
df.to_csv("data/stocks.csv", index=False)
print(f"Generated {len(df)} rows across {len(TICKERS)} tickers -> data/stocks.csv")
