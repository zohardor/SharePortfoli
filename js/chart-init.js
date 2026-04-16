// ===== chart-init.js =====
// TradingView Lightweight Charts setup with MA overlays, RSI/MACD sub-panes,
// and a canvas overlay for pattern annotations.

// Requires: lightweight-charts CDN global `LightweightCharts`

import { sma, ema, rsi as calcRsi, macd as calcMacd } from './indicators.js';
import { toWeekly } from './proxy.js';

// ── Chart factory ──────────────────────────────────────────────────────

export function createStockChart(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Container #${containerId} not found`);

  const chart = LightweightCharts.createChart(container, {
    width:  container.clientWidth,
    height: options.height || 420,
    layout: {
      background: { color: '#0f172a' },
      textColor:  '#94a3b8',
    },
    rightPriceScale: { borderColor: '#334155' },
    timeScale: {
      borderColor: '#334155',
      rightOffset: 10,
      timeVisible: true,
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    grid: {
      vertLines: { color: '#1e293b' },
      horzLines: { color: '#1e293b' },
    },
  });

  // Responsive resize
  const resizeObs = new ResizeObserver(() => {
    chart.applyOptions({ width: container.clientWidth });
  });
  resizeObs.observe(container);

  return { chart, container };
}

// ── Main chart loader ──────────────────────────────────────────────────

/**
 * Render a full stock chart: candlesticks + MA overlays + RSI + MACD panes
 * + volume + pattern annotations.
 *
 * @param {string}   containerId   DOM id of the chart wrapper
 * @param {Array}    ohlcv         daily OHLCV array
 * @param {Array}    weeklyOhlcv   weekly OHLCV array (for 150w MA)
 * @param {Array}    patterns      detected patterns from patterns.js
 * @param {Object}   visOptions    toggles: { showMA, showBB, showRSI, showMACD, showVolume }
 */
export function renderChart(containerId, ohlcv, weeklyOhlcv = [], patterns = [], visOptions = {}) {
  const opts = {
    showMA:     true,
    showBB:     false,
    showRSI:    true,
    showMACD:   true,
    showVolume: true,
    showMA150w: true,
    ...visOptions,
  };

  // Clear existing chart
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  // ── Sizes: main pane + optional sub-panes ──
  const subPaneCount = (opts.showRSI ? 1 : 0) + (opts.showMACD ? 1 : 0) + (opts.showVolume ? 1 : 0);
  const totalHeight  = container.clientHeight || 600;
  const mainHeight   = totalHeight - subPaneCount * 120;

  // Build separate containers
  const mainWrap = makeDiv(containerId + '-main', container, mainHeight);
  const subWraps = [];
  if (opts.showVolume) subWraps.push(makeDiv(containerId + '-vol',  container, 100));
  if (opts.showRSI)    subWraps.push(makeDiv(containerId + '-rsi',  container, 110));
  if (opts.showMACD)   subWraps.push(makeDiv(containerId + '-macd', container, 110));

  // ── Main (candlestick) chart ──
  const mainChart = LightweightCharts.createChart(mainWrap, chartTheme(mainWrap.clientWidth, mainHeight));
  const candleSeries = addCandlesticks(mainChart, ohlcv);

  // MA overlays
  const closes = ohlcv.map(b => b.close);
  if (opts.showMA) {
    addMaLine(mainChart, ohlcv, sma(closes, 20),  '#60a5fa', 'MA20');
    addMaLine(mainChart, ohlcv, sma(closes, 50),  '#f59e0b', 'MA50');
    addMaLine(mainChart, ohlcv, sma(closes, 200), '#a78bfa', 'MA200');
  }

  if (opts.showMA150w && weeklyOhlcv.length >= 150) {
    const weeklyCloses = weeklyOhlcv.map(b => b.close);
    const ma150w = sma(weeklyCloses, 150);
    // Align weekly 150w MA values to daily bars (carry-forward)
    const aligned = alignWeeklyToDailyDates(ohlcv, weeklyOhlcv, ma150w);
    addMaLine(mainChart, ohlcv, aligned, '#f97316', 'MA 150W', 2);
  }

  if (opts.showBB) {
    addBollingerBands(mainChart, ohlcv, closes);
  }

  // ── Volume sub-chart ──
  if (opts.showVolume && subWraps.length > 0) {
    const volWrap = document.getElementById(containerId + '-vol');
    if (volWrap) renderVolumeChart(volWrap, ohlcv);
  }

  // ── RSI sub-chart ──
  if (opts.showRSI) {
    const rsiWrap = document.getElementById(containerId + '-rsi');
    if (rsiWrap) renderRSIChart(rsiWrap, ohlcv, closes);
  }

  // ── MACD sub-chart ──
  if (opts.showMACD) {
    const macdWrap = document.getElementById(containerId + '-macd');
    if (macdWrap) renderMACDChart(macdWrap, ohlcv, closes);
  }

  // ── Pattern annotations ──
  if (patterns.length) {
    annotatePatterns(mainChart, candleSeries, mainWrap, ohlcv, patterns);
  }

  // Sync time scales (so zooming/panning is coordinated)
  // (Only possible if sub-charts share the same time range — approximate sync)
  const subCharts = [];
  mainChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    subCharts.forEach(sc => sc.timeScale().setVisibleLogicalRange(range));
  });

  // Responsive
  new ResizeObserver(() => {
    mainChart.applyOptions({ width: mainWrap.clientWidth });
    subCharts.forEach(sc => sc.applyOptions({ width: mainWrap.clientWidth }));
  }).observe(mainWrap);

  return { mainChart, candleSeries };
}

// ── Candlestick series ─────────────────────────────────────────────────

function addCandlesticks(chart, ohlcv) {
  const series = chart.addCandlestickSeries({
    upColor:        '#22c55e',
    downColor:      '#ef4444',
    borderUpColor:  '#22c55e',
    borderDownColor:'#ef4444',
    wickUpColor:    '#22c55e',
    wickDownColor:  '#ef4444',
  });
  series.setData(ohlcv.map(b => ({
    time:  toChartTime(b.date),
    open:  b.open,
    high:  b.high,
    low:   b.low,
    close: b.close,
  })));
  return series;
}

// ── MA line ────────────────────────────────────────────────────────────

function addMaLine(chart, ohlcv, values, color, title, width = 1) {
  const series = chart.addLineSeries({ color, lineWidth: width, title, priceLineVisible: false, lastValueVisible: true });
  const data = ohlcv
    .map((b, i) => values[i] != null ? { time: toChartTime(b.date), value: values[i] } : null)
    .filter(Boolean);
  series.setData(data);
  return series;
}

// ── Bollinger Bands ────────────────────────────────────────────────────

function addBollingerBands(chart, ohlcv, closes) {
  const { bollingerBands: bb } = await import('./indicators.js').catch(() => null) || {};
  // Inline simple BB to avoid async in sync function
  const period = 20, mult = 2;
  const mid = closes.map((_, i) => {
    if (i < period - 1) return null;
    const s = closes.slice(i - period + 1, i + 1);
    const m = s.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(s.reduce((a, v) => a + (v - m) ** 2, 0) / period);
    return { upper: m + mult * std, middle: m, lower: m - mult * std };
  });

  ['upper', 'middle', 'lower'].forEach((key, ki) => {
    const colors = ['#6366f180', '#6366f1', '#6366f180'];
    const s = chart.addLineSeries({ color: colors[ki], lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    s.setData(ohlcv.map((b, i) => mid[i]?.[key] != null ? { time: toChartTime(b.date), value: mid[i][key] } : null).filter(Boolean));
  });
}

// ── Volume chart ───────────────────────────────────────────────────────

function renderVolumeChart(wrap, ohlcv) {
  const chart = LightweightCharts.createChart(wrap, chartTheme(wrap.clientWidth, 100, false));
  const series = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
  });
  series.setData(ohlcv.map(b => ({
    time:  toChartTime(b.date),
    value: b.volume,
    color: b.close >= b.open ? '#22c55e55' : '#ef444455',
  })));
}

// ── RSI chart ──────────────────────────────────────────────────────────

function renderRSIChart(wrap, ohlcv, closes) {
  const chart = LightweightCharts.createChart(wrap, chartTheme(wrap.clientWidth, 110, false));
  const rsiValues = calcRsi(closes, 14);
  const series = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, title: 'RSI(14)', priceLineVisible: false });
  series.setData(ohlcv.map((b, i) => rsiValues[i] != null ? { time: toChartTime(b.date), value: rsiValues[i] } : null).filter(Boolean));

  // Overbought / oversold lines
  [70, 30].forEach(level => {
    series.createPriceLine({ price: level, color: level === 70 ? '#ef4444' : '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(level) });
  });
}

// ── MACD chart ─────────────────────────────────────────────────────────

function renderMACDChart(wrap, ohlcv, closes) {
  const chart = LightweightCharts.createChart(wrap, chartTheme(wrap.clientWidth, 110, false));
  const { macdLine, signalLine, histogram } = calcMacd(closes);

  const histSeries = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
  histSeries.setData(ohlcv.map((b, i) => histogram[i] != null ? {
    time: toChartTime(b.date), value: histogram[i],
    color: histogram[i] >= 0 ? '#22c55e88' : '#ef444488',
  } : null).filter(Boolean));

  const macdSeries = chart.addLineSeries({ color: '#60a5fa', lineWidth: 1, title: 'MACD', priceLineVisible: false });
  macdSeries.setData(ohlcv.map((b, i) => macdLine[i] != null ? { time: toChartTime(b.date), value: macdLine[i] } : null).filter(Boolean));

  const sigSeries = chart.addLineSeries({ color: '#f97316', lineWidth: 1, title: 'Signal', priceLineVisible: false });
  sigSeries.setData(ohlcv.map((b, i) => signalLine[i] != null ? { time: toChartTime(b.date), value: signalLine[i] } : null).filter(Boolean));
}

// ── Pattern annotations (canvas overlay) ──────────────────────────────

function annotatePatterns(chart, candleSeries, container, ohlcv, patterns) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
  container.style.position = 'relative';
  container.appendChild(canvas);

  function redraw() {
    const { width, height } = container.getBoundingClientRect();
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    for (const pat of patterns) {
      const color = pat.direction === 'bullish' ? '#22c55e' : pat.direction === 'bearish' ? '#ef4444' : '#f59e0b';

      // Draw lines between key points
      const coords = pat.keyPoints
        .map(kp => {
          if (kp.index >= ohlcv.length) return null;
          const x = chart.timeScale().timeToCoordinate(toChartTime(ohlcv[kp.index].date));
          const y = candleSeries.priceToCoordinate(kp.price);
          return x != null && y != null ? { x, y, label: kp.label } : null;
        })
        .filter(Boolean);

      if (coords.length < 2) continue;

      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(coords[0].x, coords[0].y);
      coords.forEach(c => ctx.lineTo(c.x, c.y));
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw dots and labels
      coords.forEach(c => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f1f5f9';
        ctx.font = '10px Heebo, sans-serif';
        ctx.fillText(c.label, c.x + 5, c.y - 5);
      });
    }
  }

  chart.subscribeCrosshairMove(redraw);
  chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
  new ResizeObserver(redraw).observe(container);
  redraw();
}

// ── Helpers ────────────────────────────────────────────────────────────

function chartTheme(width, height, showTimeAxis = true) {
  return {
    width, height,
    layout:  { background: { color: '#0f172a' }, textColor: '#94a3b8' },
    rightPriceScale: { borderColor: '#334155' },
    timeScale: { borderColor: '#334155', visible: showTimeAxis },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
    handleScroll: true,
    handleScale:  true,
  };
}

function makeDiv(id, parent, height) {
  const d = document.createElement('div');
  d.id = id;
  d.style.cssText = `width:100%;height:${height}px;`;
  parent.appendChild(d);
  return d;
}

function toChartTime(date) {
  // Lightweight Charts expects 'YYYY-MM-DD' strings for daily data
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
}

function alignWeeklyToDailyDates(dailyOhlcv, weeklyOhlcv, weeklyValues) {
  // Build a map: weekEnd-date → value
  const weekMap = new Map();
  weeklyOhlcv.forEach((w, i) => {
    if (weeklyValues[i] != null) {
      weekMap.set(toChartTime(w.date), weeklyValues[i]);
    }
  });

  // For each daily bar, carry the last known weekly MA value
  let lastVal = null;
  return dailyOhlcv.map(b => {
    const key = toChartTime(b.date);
    if (weekMap.has(key)) lastVal = weekMap.get(key);
    return lastVal;
  });
}

// ── Timeframe helpers ─────────────────────────────────────────────────

export function filterByTimeframe(ohlcv, tf) {
  const now = ohlcv.at(-1)?.date ?? new Date();
  const cutoffs = {
    '1mo': 30, '3mo': 90, '6mo': 180,
    '1y': 365, '3y': 365 * 3, '5y': 365 * 5,
  };
  if (!cutoffs[tf]) return ohlcv; // 'max'
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - cutoffs[tf]);
  return ohlcv.filter(b => b.date >= cutoff);
}
