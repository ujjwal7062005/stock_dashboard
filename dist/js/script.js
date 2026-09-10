// ============================================================
// Stock Analytics Dashboard — Standalone Static Engine (Client-side)
// ============================================================

const state = {
  rawRows: [],
  tickersMeta: [],
  ticker: null,
  start: null,
  end: null,
  minDate: null,
  maxDate: null,
  chartType: "line",
  showMA7: true,
  showMA30: true,
  _lastData: null,
};

let priceChart, volumeChart, sectorChart;

const el = (id) => document.getElementById(id);

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, idx) => {
      const val = cols[idx] ? cols[idx].trim() : "";
      if (["date", "ticker", "sector"].includes(h)) {
        row[h] = val;
      } else {
        row[h] = parseFloat(val) || 0;
      }
    });
    rows.push(row);
  }
  return rows;
}

function getTickers(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!map.has(r.ticker)) {
      map.set(r.ticker, r.sector);
    }
  });
  return Array.from(map.entries())
    .map(([ticker, sector]) => ({ ticker, sector }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function filterDF(rows, ticker, start, end) {
  return rows
    .filter(r => {
      if (r.ticker !== ticker) return false;
      if (start && r.date < start) return false;
      if (end && r.date > end) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function addMovingAverages(d) {
  const closes = d.map(r => r.close);
  const ma7 = [];
  const ma30 = [];
  for (let i = 0; i < closes.length; i++) {
    const w7 = closes.slice(Math.max(0, i - 6), i + 1);
    ma7.push(Number((w7.reduce((a, b) => a + b, 0) / w7.length).toFixed(2)));

    const w30 = closes.slice(Math.max(0, i - 29), i + 1);
    ma30.push(Number((w30.reduce((a, b) => a + b, 0) / w30.length).toFixed(2)));
  }
  return {
    ticker: d.length ? d[0].ticker : "",
    dates: d.map(r => r.date),
    open: d.map(r => r.open),
    high: d.map(r => r.high),
    low: d.map(r => r.low),
    close: d.map(r => r.close),
    volume: d.map(r => r.volume),
    ma7,
    ma30,
  };
}

function calculateSummary(d) {
  if (!d.length) return null;
  const firstClose = d[0].close;
  const lastClose = d[d.length - 1].close;
  const change = lastClose - firstClose;
  const pctChange = firstClose ? (change / firstClose) * 100 : 0;

  let volatility = 0;
  if (d.length > 1) {
    const pctChanges = [];
    for (let i = 1; i < d.length; i++) {
      pctChanges.push((d[i].close - d[i - 1].close) / d[i - 1].close);
    }
    const mean = pctChanges.reduce((a, b) => a + b, 0) / pctChanges.length;
    const variance = pctChanges.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (pctChanges.length - 1);
    volatility = Math.sqrt(variance) * 100;
  }

  const highs = d.map(r => r.high);
  const lows = d.map(r => r.low);
  const volumes = d.map(r => r.volume);

  return {
    ticker: d[0].ticker,
    current_price: Number(lastClose.toFixed(2)),
    period_change: Number(change.toFixed(2)),
    period_pct_change: Number(pctChange.toFixed(2)),
    period_high: Number(Math.max(...highs).toFixed(2)),
    period_low: Number(Math.min(...lows).toFixed(2)),
    avg_volume: Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length),
    volatility_pct: Number(volatility.toFixed(2)),
    trading_days: d.length,
  };
}

function calculateSectorComparison(rows, start, end) {
  const tickersList = getTickers(rows);
  const result = [];
  tickersList.forEach(({ ticker, sector }) => {
    const d = filterDF(rows, ticker, start, end);
    if (!d.length) return;
    const firstClose = d[0].close;
    const lastClose = d[d.length - 1].close;
    const pct = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : 0;
    const avgVol = Math.round(d.reduce((a, b) => a + b.volume, 0) / d.length);
    result.push({
      ticker,
      sector,
      pct_change: Number(pct.toFixed(2)),
      avg_volume: avgVol,
    });
  });
  return result;
}

function fmtMoney(v) {
  return "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(v) {
  return Number(v).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

function showStatus(message, isError = false) {
  const banner = el("status-banner");
  banner.textContent = message;
  banner.classList.remove("hidden");
  banner.classList.toggle("error", isError);
  if (!isError) {
    setTimeout(() => banner.classList.add("hidden"), 2500);
  }
}

// ---------- Init ----------
async function init() {
  try {
    const res = await fetch("data/stocks.csv");
    if (!res.ok) throw new Error("Failed to load dataset");
    const csvText = await res.text();
    state.rawRows = parseCSV(csvText);

    state.tickersMeta = getTickers(state.rawRows);
    const select = el("ticker-select");
    select.innerHTML = state.tickersMeta.map(t => `<option value="${t.ticker}">${t.ticker}</option>`).join("");
    state.ticker = state.tickersMeta[0].ticker;

    const dates = state.rawRows.map(r => r.date).sort();
    state.minDate = dates[0];
    state.maxDate = dates[dates.length - 1];

    const startInput = el("start-date");
    const endInput = el("end-date");
    startInput.min = state.minDate;
    startInput.max = state.maxDate;
    startInput.value = state.minDate;

    endInput.min = state.minDate;
    endInput.max = state.maxDate;
    endInput.value = state.maxDate;

    state.start = state.minDate;
    state.end = state.maxDate;

    bindControls();
    refreshAll();
  } catch (err) {
    showStatus(err.message, true);
  }
}

function bindControls() {
  el("ticker-select").addEventListener("change", (e) => {
    state.ticker = e.target.value;
    refreshAll();
  });

  el("start-date").addEventListener("change", (e) => {
    state.start = e.target.value;
    setActiveChip("quick-range", null);
    refreshAll();
  });

  el("end-date").addEventListener("change", (e) => {
    state.end = e.target.value;
    setActiveChip("quick-range", null);
    refreshAll();
  });

  document.querySelectorAll("#quick-range .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveChip("quick-range", btn);
      const days = btn.dataset.days;
      const maxDate = state.maxDate;
      const minDate = state.minDate;
      if (days === "all") {
        el("start-date").value = minDate;
        el("end-date").value = maxDate;
      } else {
        const end = new Date(maxDate);
        const start = new Date(end);
        start.setDate(start.getDate() - Number(days));
        const startStr = start.toISOString().slice(0, 10);
        el("start-date").value = startStr < minDate ? minDate : startStr;
        el("end-date").value = maxDate;
      }
      state.start = el("start-date").value;
      state.end = el("end-date").value;
      refreshAll();
    });
  });

  document.querySelectorAll("#chart-type .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveChip("chart-type", btn);
      state.chartType = btn.dataset.type;
      renderPriceChart(state._lastData);
    });
  });

  el("ma7-toggle").addEventListener("change", (e) => {
    state.showMA7 = e.target.checked;
    renderPriceChart(state._lastData);
  });

  el("ma30-toggle").addEventListener("change", (e) => {
    state.showMA30 = e.target.checked;
    renderPriceChart(state._lastData);
  });

  el("export-btn").addEventListener("click", () => {
    exportFilteredCSV();
  });

  el("theme-toggle").addEventListener("change", (e) => {
    document.documentElement.setAttribute("data-theme", e.target.checked ? "dark" : "light");
    renderPriceChart(state._lastData);
    renderVolumeChart(state._lastData);
  });
}

function setActiveChip(groupId, activeBtn) {
  document.querySelectorAll(`#${groupId} .chip`).forEach(b => b.classList.remove("active"));
  if (activeBtn) activeBtn.classList.add("active");
}

function exportFilteredCSV() {
  const filtered = filterDF(state.rawRows, state.ticker, state.start, state.end);
  if (!filtered.length) return;
  const headers = ["date", "ticker", "sector", "open", "high", "low", "close", "volume"];
  const csvLines = [headers.join(",")];
  filtered.forEach(r => {
    csvLines.push(`${r.date},${r.ticker},${r.sector},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  });
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${state.ticker}_${state.start || "start"}_${state.end || "end"}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function refreshAll() {
  const filtered = filterDF(state.rawRows, state.ticker, state.start, state.end);
  if (!filtered.length) {
    showStatus("No data for selected ticker/date range", true);
    return;
  }

  const data = addMovingAverages(filtered);
  const summary = calculateSummary(filtered);
  const sectorData = calculateSectorComparison(state.rawRows, state.start, state.end);

  state._lastData = data;

  el("page-title").textContent = `${state.ticker} — Stock Analytics`;
  const tMeta = state.tickersMeta.find(t => t.ticker === state.ticker);
  el("sector-badge").textContent = tMeta ? tMeta.sector : "—";

  renderKPIs(summary);
  renderPriceChart(data);
  renderVolumeChart(data);
  renderSectorChart(sectorData);
}

function renderKPIs(summary) {
  if (!summary) return;
  el("kpi-price").textContent = fmtMoney(summary.current_price);

  const changeEl = el("kpi-change");
  const sign = summary.period_change >= 0 ? "+" : "";
  changeEl.textContent = `${sign}${fmtMoney(summary.period_change)} (${sign}${summary.period_pct_change}%)`;
  changeEl.className = "kpi-value " + (summary.period_change >= 0 ? "positive" : "negative");

  el("kpi-high").textContent = fmtMoney(summary.period_high);
  el("kpi-low").textContent = fmtMoney(summary.period_low);
  el("kpi-volume").textContent = fmtCompact(summary.avg_volume);
  el("kpi-volatility").textContent = `${summary.volatility_pct}%`;
}

function themeColors() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    grid: dark ? "rgba(255,255,255,0.08)" : "rgba(20,25,50,0.06)",
    text: dark ? "#a9b1cf" : "#666f8d",
    accent: dark ? "#7b93ff" : "#4d6bfe",
    positive: dark ? "#35c98d" : "#1fa774",
    negative: dark ? "#f0656a" : "#e5484d",
  };
}

function renderPriceChart(data) {
  if (!data) return;
  const ctx = el("priceChart").getContext("2d");
  const colors = themeColors();
  const datasets = [];

  if (state.chartType === "line") {
    datasets.push({
      label: `${data.ticker} Close`,
      data: data.close,
      borderColor: colors.accent,
      backgroundColor: hexToRgba(colors.accent, 0.12),
      fill: true,
      tension: 0.25,
      pointRadius: 0,
      borderWidth: 2,
    });
  } else {
    datasets.push({
      label: "High",
      data: data.high,
      borderColor: hexToRgba(colors.positive, 0.6),
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
    });
    datasets.push({
      label: "Low",
      data: data.low,
      borderColor: hexToRgba(colors.negative, 0.6),
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
    });
    datasets.push({
      label: "Close",
      data: data.close,
      borderColor: colors.accent,
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
    });
  }

  if (state.showMA7) {
    datasets.push({
      label: "MA (7)",
      data: data.ma7,
      borderColor: "#f5a524",
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      borderDash: [4, 3],
    });
  }
  if (state.showMA30) {
    datasets.push({
      label: "MA (30)",
      data: data.ma30,
      borderColor: "#9c6ade",
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      borderDash: [2, 2],
    });
  }

  if (priceChart) priceChart.destroy();
  priceChart = new Chart(ctx, {
    type: "line",
    data: { labels: data.dates, datasets },
    options: commonOptions(colors, { yPrefix: "$" }),
  });
}

function renderVolumeChart(data) {
  if (!data) return;
  const ctx = el("volumeChart").getContext("2d");
  const colors = themeColors();

  if (volumeChart) volumeChart.destroy();
  volumeChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.dates,
      datasets: [{
        label: "Volume",
        data: data.volume,
        backgroundColor: hexToRgba(colors.accent, 0.5),
        borderRadius: 2,
      }],
    },
    options: commonOptions(colors, { yCompact: true }),
  });
}

function renderSectorChart(sectorRows) {
  const ctx = el("sectorChart").getContext("2d");
  const colors = themeColors();

  if (sectorChart) sectorChart.destroy();
  sectorChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sectorRows.map(r => `${r.ticker}`),
      datasets: [{
        label: "% change",
        data: sectorRows.map(r => r.pct_change),
        backgroundColor: sectorRows.map(r => r.pct_change >= 0 ? hexToRgba(colors.positive, 0.7) : hexToRgba(colors.negative, 0.7)),
        borderRadius: 4,
      }],
    },
    options: commonOptions(colors, { yPercent: true }),
  });
}

function commonOptions(colors, opts = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: { color: colors.text, boxWidth: 12, font: { size: 11 } },
      },
      tooltip: {
        callbacks: opts.yPrefix ? {
          label: (ctx) => `${ctx.dataset.label}: $${Number(ctx.parsed.y).toFixed(2)}`,
        } : undefined,
      },
    },
    scales: {
      x: {
        ticks: { color: colors.text, maxTicksLimit: 8, font: { size: 10 } },
        grid: { color: colors.grid },
      },
      y: {
        ticks: {
          color: colors.text,
          font: { size: 10 },
          callback: (v) => {
            if (opts.yPercent) return v + "%";
            if (opts.yCompact) return Number(v).toLocaleString(undefined, { notation: "compact" });
            if (opts.yPrefix) return "$" + v;
            return v;
          },
        },
        grid: { color: colors.grid },
      },
    },
  };
}

function hexToRgba(hex, alpha) {
  const c = hex.replace("#", "");
  const bigint = parseInt(c.length === 3 ? c.split("").map(x => x + x).join("") : c, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

document.addEventListener("DOMContentLoaded", init);
