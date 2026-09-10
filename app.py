"""
Interactive Stock Analytics Dashboard
Flask backend: serves the dashboard page and JSON APIs consumed by the
frontend (vanilla JS + Chart.js). Data-analyst friendly endpoints:
- summary stats (KPIs)
- OHLCV time series with optional moving averages
- sector comparison
- CSV export of the currently filtered slice
"""
import io
import csv as csv_module
from datetime import datetime

import pandas as pd
from flask import Flask, render_template, jsonify, request, Response

app = Flask(__name__)

DF = pd.read_csv("data/stocks.csv", parse_dates=["date"])
DF.sort_values(["ticker", "date"], inplace=True)


def filter_df(ticker, start, end):
    d = DF[DF["ticker"] == ticker].copy()
    if start:
        d = d[d["date"] >= pd.to_datetime(start)]
    if end:
        d = d[d["date"] <= pd.to_datetime(end)]
    return d.sort_values("date")


def add_moving_averages(d, windows=(7, 30)):
    d = d.copy()
    for w in windows:
        d[f"ma{w}"] = d["close"].rolling(window=w, min_periods=1).mean().round(2)
    return d


@app.route("/")
def index():
    tickers = sorted(DF["ticker"].unique().tolist())
    min_date = DF["date"].min().strftime("%Y-%m-%d")
    max_date = DF["date"].max().strftime("%Y-%m-%d")
    return render_template("index.html", tickers=tickers, min_date=min_date, max_date=max_date)


@app.route("/api/tickers")
def api_tickers():
    meta = (
        DF.groupby("ticker")["sector"]
        .first()
        .reset_index()
        .to_dict(orient="records")
    )
    return jsonify(meta)


@app.route("/api/data/<ticker>")
def api_data(ticker):
    start = request.args.get("start")
    end = request.args.get("end")
    d = filter_df(ticker, start, end)
    if d.empty:
        return jsonify({"error": "No data for that ticker/date range"}), 404
    d = add_moving_averages(d)

    payload = {
        "ticker": ticker,
        "dates": d["date"].dt.strftime("%Y-%m-%d").tolist(),
        "open": d["open"].tolist(),
        "high": d["high"].tolist(),
        "low": d["low"].tolist(),
        "close": d["close"].tolist(),
        "volume": d["volume"].tolist(),
        "ma7": d["ma7"].tolist(),
        "ma30": d["ma30"].tolist(),
    }
    return jsonify(payload)


@app.route("/api/summary/<ticker>")
def api_summary(ticker):
    start = request.args.get("start")
    end = request.args.get("end")
    d = filter_df(ticker, start, end)
    if d.empty:
        return jsonify({"error": "No data for that ticker/date range"}), 404

    first_close = float(d["close"].iloc[0])
    last_close = float(d["close"].iloc[-1])
    change = last_close - first_close
    pct_change = (change / first_close) * 100 if first_close else 0
    volatility = float(d["close"].pct_change().std() * 100) if len(d) > 1 else 0.0

    summary = {
        "ticker": ticker,
        "current_price": round(last_close, 2),
        "period_change": round(change, 2),
        "period_pct_change": round(pct_change, 2),
        "period_high": round(float(d["high"].max()), 2),
        "period_low": round(float(d["low"].min()), 2),
        "avg_volume": int(d["volume"].mean()),
        "volatility_pct": round(volatility, 2),
        "trading_days": int(len(d)),
    }
    return jsonify(summary)


@app.route("/api/sector-comparison")
def api_sector_comparison():
    start = request.args.get("start")
    end = request.args.get("end")
    rows = []
    for ticker in sorted(DF["ticker"].unique()):
        d = filter_df(ticker, start, end)
        if d.empty:
            continue
        first_close = float(d["close"].iloc[0])
        last_close = float(d["close"].iloc[-1])
        pct = ((last_close - first_close) / first_close) * 100 if first_close else 0
        rows.append({
            "ticker": ticker,
            "sector": d["sector"].iloc[0],
            "pct_change": round(pct, 2),
            "avg_volume": int(d["volume"].mean()),
        })
    return jsonify(rows)


@app.route("/api/export/<ticker>")
def api_export(ticker):
    start = request.args.get("start")
    end = request.args.get("end")
    d = filter_df(ticker, start, end)
    if d.empty:
        return jsonify({"error": "No data for that ticker/date range"}), 404

    buf = io.StringIO()
    d.to_csv(buf, index=False)
    buf.seek(0)
    filename = f"{ticker}_{start or 'start'}_{end or 'end'}.csv"
    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
