// ===== indicators.js =====
// Pure technical analysis functions.
// All operate on number[] (closes) or OHLCV[] and return same-length arrays
// (null for warm-up periods).

// ── Moving Averages ────────────────────────────────────────────────────

export function sma(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += (data[j] ?? 0);
    return sum / period;
  });
}

export function ema(data, period) {
  const k = 2 / (period + 1);
  const result = new Array(data.length).fill(null);
  let prevEma = null;
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    if (data[i] == null) continue;
    if (prevEma === null) {
      count++;
      if (count < period) continue;
      // First EMA = SMA of first `period` valid values
      let sum = 0, n = 0;
      for (let j = 0; j <= i; j++) {
        if (data[j] != null) { sum += data[j]; n++; }
      }
      prevEma = sum / n;
    } else {
      prevEma = data[i] * k + prevEma * (1 - k);
    }
    result[i] = prevEma;
  }
  return result;
}

// ── RSI (Wilder's smoothing) ───────────────────────────────────────────

export function rsi(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      const g = diff >= 0 ? diff : 0;
      const l = diff <  0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
    }
    if (avgLoss === 0) { result[i] = 100; continue; }
    const rs = avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }
  return result;
}

// ── MACD ───────────────────────────────────────────────────────────────

export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);

  // MACD line
  const macdLine = closes.map((_, i) =>
    fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null
  );

  // Signal line (EMA of MACD line)
  const signalLine = ema(macdLine, signal);

  // Histogram
  const histogram = macdLine.map((m, i) =>
    m != null && signalLine[i] != null ? m - signalLine[i] : null
  );

  return { macdLine, signalLine, histogram };
}

// ── Bollinger Bands ────────────────────────────────────────────────────

export function bollingerBands(closes, period = 20, stdMult = 2) {
  const mid = sma(closes, period);
  return closes.map((_, i) => {
    if (mid[i] == null) return { upper: null, middle: null, lower: null };
    const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
    const mean = mid[i];
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    return { upper: mean + stdMult * std, middle: mean, lower: mean - stdMult * std };
  });
}

// ── ATR ────────────────────────────────────────────────────────────────

export function atr(ohlcv, period = 14) {
  const tr = ohlcv.map((bar, i) => {
    if (i === 0) return bar.high - bar.low;
    const prev = ohlcv[i - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prev), Math.abs(bar.low - prev));
  });
  return sma(tr, period);
}

// ── Aggregated indicator calculation ──────────────────────────────────

/**
 * Compute all indicators for a OHLCV array.
 * @param {Array} ohlcv daily OHLCV bars
 * @param {Array} weeklyOhlcv weekly OHLCV bars
 * @returns {Object} indicators object
 */
export function computeAllIndicators(ohlcv, weeklyOhlcv = []) {
  const closes = ohlcv.map(b => b.close);
  const weeklyCloses = weeklyOhlcv.map(b => b.close);

  const sma20  = sma(closes, 20);
  const sma50  = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema20  = ema(closes, 20);

  const rsi14  = rsi(closes, 14);
  const macdData = macd(closes);
  const bBands = bollingerBands(closes, 20, 2);
  const atr14  = atr(ohlcv, 14);

  // 150-week MA on weekly data
  const ma150w = weeklyCloses.length >= 150 ? sma(weeklyCloses, 150) : [];

  // Volume 20-period average
  const volumes = ohlcv.map(b => b.volume);
  const volSma20 = sma(volumes, 20);

  return {
    closes,
    sma20, sma50, sma200, ema20,
    rsi: rsi14,
    macd: macdData,
    bb: bBands,
    atr: atr14,
    ma150w,
    volumes,
    volSma20,
    // Convenience: last values
    last: {
      close:    closes.at(-1),
      sma20:    sma20.at(-1),
      sma50:    sma50.at(-1),
      sma200:   sma200.at(-1),
      rsi:      rsi14.at(-1),
      macdLine: macdData.macdLine.at(-1),
      macdSig:  macdData.signalLine.at(-1),
      macdHist: macdData.histogram.at(-1),
      bbUpper:  bBands.at(-1)?.upper,
      bbLower:  bBands.at(-1)?.lower,
      bbMid:    bBands.at(-1)?.middle,
      ma150w:   ma150w.at(-1) ?? null,
      volume:   volumes.at(-1),
      volSma20: volSma20.at(-1),
    },
  };
}

// ── Helper: detect recent crossover in last N bars ─────────────────────

/**
 * Returns 'bullish' | 'bearish' | null based on recent crossover.
 * @param {number[]} fast  e.g. MACD line
 * @param {number[]} slow  e.g. Signal line
 * @param {number}   lookback number of bars to look back
 */
export function detectCrossover(fast, slow, lookback = 5) {
  const len = Math.min(fast.length, slow.length);
  for (let i = len - 1; i >= Math.max(1, len - lookback); i--) {
    if (fast[i] == null || fast[i-1] == null || slow[i] == null || slow[i-1] == null) continue;
    if (fast[i-1] <= slow[i-1] && fast[i] > slow[i]) return 'bullish';
    if (fast[i-1] >= slow[i-1] && fast[i] < slow[i]) return 'bearish';
  }
  return null;
}
