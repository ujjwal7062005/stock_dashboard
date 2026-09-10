// ============================================================
// Stock Analytics Dashboard — client logic
// Fetches JSON from the Flask API and renders interactive
// Chart.js visualizations. All filters re-query the backend.
// ============================================================

const state = {
  ticker: null,
  start: null,
  end: null,
  chartType: "line",
  showMA7: true,
  showMA30: true,
};

let priceChart, volumeChart, sectorChart;

const el = (id) => document.getElementById(id);

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
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

function fmtMoney(v) {
  return "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(v) {
  return Number(v).toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

// ---------- Init ----------
async function init() {
  const tickers = await fetchJSON("/api/tickers");
  const select = el("ticker-select");
  select.innerHTML = tickers.map(t => `<option value="${t.ticker}">${t.ticker}</option>`).join("");
  state.ticker = tickers[0].ticker;

  state.start = el("start-date").value;
  state.end = el("end-date").value;

  bindControls();
  await refreshAll();
}

function bindControls() {
  el("ticker-select").addEventListener("change", async (e) => {
    state.ticker = e.target.value;
    await refreshAll();
  });

  el("start-date").addEventListener("change", async (e) => {
    state.start = e.target.value;
    setActiveChip("quick-range", null);
    await refreshAll();
  });

  el("end-date").addEventListener("change", async (e) => {
    state.end = e.target.value;
    setActiveChip("quick-range", null);
    await refreshAll();
  });

  document.querySelectorAll("#quick-range .chip").forEach(btn => {
    btn.addEventListener("click", async () => {
      setActiveChip("quick-range", btn);
      const days = btn.dataset.days;
      const maxDate = el("end-date").max;
      const minDate = el("start-date").min;
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
      await refreshAll();
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
    const url = `/api/export/${state.ticker}?start=${state.start}&end=${state.end}`;
    window.location.href = url;
  });

  el("theme-toggle").addEventListener("change", (e) => {
    document.documentElement.setAttribute("data-theme", e.target.checked ? "dark" : "light");
    // Redraw charts so gridline/text colors follow the new theme
    renderPriceChart(state._lastData);
    renderVolumeChart(state._lastData);
  });
}

function setActiveChip(groupId, activeBtn) {
  document.querySelectorAll(`#${groupId} .chip`).forEach(b => b.classList.remove("active"));
  if (activeBtn) activeBtn.classList.add("active");
}

// ---------- Data + rendering ----------
async function refreshAll() {
  try {
    const [data, summary, sectorData] = await Promise.all([
      fetchJSON(`/api/data/${state.ticker}?start=${state.start}&end=${state.end}`),
      fetchJSON(`/api/summary/${state.ticker}?start=${state.start}&end=${state.end}`),
      fetchJSON(`/api/sector-comparison?start=${state.start}&end=${state.end}`),
    ]);

    state._lastData = data;

    el("page-title").textContent = `${state.ticker} — Stock Analytics`;
    el("sector-badge").textContent = tickerSectorLookup(sectorData, state.ticker);

    renderKPIs(summary);
    renderPriceChart(data);
    renderVolumeChart(data);
    renderSectorChart(sectorData);
  } catch (err) {
    showStatus(err.message, true);
  }
}

function tickerSectorLookup(sectorRows, ticker) {
  const row = sectorRows.find(r => r.ticker === ticker);
  return row ? row.sector : "—";
}

function renderKPIs(summary) {
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
    // "OHLC-ish" view using high/low band + close line, drawable with base Chart.js
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
