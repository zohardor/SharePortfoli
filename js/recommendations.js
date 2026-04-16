// ===== recommendations.js =====
// Composite BUY / SELL scoring engine.
// Score range: -100 (strong sell) to +100 (strong buy).

import { computeAllIndicators, detectCrossover } from './indicators.js';
import { detectAllPatterns } from './patterns.js';
import { fetchOHLCV, toWeekly, getCloses } from './proxy.js';
import { scoreToSignal } from './utils.js';

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Full analysis for a ticker: fetch data, compute indicators, detect patterns, score.
 * @param {string} ticker
 * @returns {AnalysisResult}
 */
export async function analyzeStock(ticker) {
  ticker = ticker.toUpperCase();

  // Fetch daily and weekly OHLCV
  const [dailyOhlcv, weeklyOhlcv] = await Promise.all([
    fetchOHLCV(ticker, '1d', '5y'),
    fetchOHLCV(ticker, '1wk', '5y'),
  ]);

  if (!dailyOhlcv.length) throw new Error(`אין נתונים עבור ${ticker}`);

  const indicators = computeAllIndicators(dailyOhlcv, weeklyOhlcv);
  const patterns   = detectAllPatterns(dailyOhlcv);

  const { score, signals } = computeScore(indicators, patterns, dailyOhlcv);
  const signal = scoreToSignal(score);

  return {
    ticker,
    score,
    signal,
    signals,      // array of individual signal objects
    indicators,
    patterns,
    dailyOhlcv,
    weeklyOhlcv,
    analyzedAt: new Date(),
  };
}

// ── Scoring ───────────────────────────────────────────────────────────

function computeScore(ind, patterns, ohlcv) {
  const signals = [];
  let score = 0;

  const { last, macd, rsi, sma20, sma50, sma200, ma150w, volumes, volSma20 } = ind;

  // 1. RSI  (±20)
  if (last.rsi != null) {
    let rsScore = 0;
    if (last.rsi < 30) {
      rsScore = +20;
      signals.push({ key: 'rsi', score: rsScore, desc: `RSI נמוך (${last.rsi.toFixed(1)}) — מניה מוכרת יתר, פוטנציאל קנייה` });
    } else if (last.rsi > 70) {
      rsScore = -20;
      signals.push({ key: 'rsi', score: rsScore, desc: `RSI גבוה (${last.rsi.toFixed(1)}) — מניה קנויה יתר, פוטנציאל מכירה` });
    } else {
      // Linear scale between 30-70
      rsScore = Math.round((50 - last.rsi) / 2);
      signals.push({ key: 'rsi', score: rsScore, desc: `RSI נייטרל (${last.rsi.toFixed(1)})` });
    }
    score += rsScore;
  }

  // 2. MACD crossover (±15)
  const macdCross = detectCrossover(macd.macdLine, macd.signalLine, 5);
  if (macdCross === 'bullish') {
    score += 15;
    signals.push({ key: 'macd', score: 15, desc: 'MACD חציה חיובית לאחרונה — מומנטום עולה' });
  } else if (macdCross === 'bearish') {
    score -= 15;
    signals.push({ key: 'macd', score: -15, desc: 'MACD חציה שלילית לאחרונה — מומנטום יורד' });
  } else if (last.macdHist != null) {
    const histScore = last.macdHist > 0 ? 5 : -5;
    score += histScore;
    signals.push({ key: 'macd', score: histScore, desc: `MACD histogram ${last.macdHist > 0 ? 'חיובי' : 'שלילי'}` });
  }

  // 3. Price vs 150-week MA (±20)
  if (last.ma150w != null && last.close != null) {
    const devPct = ((last.close - last.ma150w) / last.ma150w) * 100;
    if (devPct > 0) {
      const s = Math.min(20, Math.round(devPct / 2));
      score += s;
      signals.push({ key: 'ma150w', score: s, desc: `מחיר ${devPct.toFixed(1)}% מעל ממוצע נע 150 שבועות ($${last.ma150w.toFixed(2)})` });
    } else {
      const s = Math.max(-20, Math.round(devPct / 2));
      score += s;
      signals.push({ key: 'ma150w', score: s, desc: `מחיר ${Math.abs(devPct).toFixed(1)}% מתחת לממוצע נע 150 שבועות ($${last.ma150w.toFixed(2)})` });
    }
  }

  // 4. Price vs 50-day SMA (±10)
  if (last.sma50 != null) {
    if (last.close > last.sma50) {
      score += 10;
      signals.push({ key: 'sma50', score: 10, desc: `מחיר מעל ממוצע נע 50 יום ($${last.sma50.toFixed(2)})` });
    } else {
      score -= 10;
      signals.push({ key: 'sma50', score: -10, desc: `מחיר מתחת לממוצע נע 50 יום ($${last.sma50.toFixed(2)})` });
    }
  }

  // 5. Bollinger Bands (±10)
  if (last.bbUpper != null && last.bbLower != null) {
    const bbRange = last.bbUpper - last.bbLower;
    const bbPos = (last.close - last.bbLower) / bbRange; // 0=lower, 1=upper
    if (bbPos < 0.15) {
      score += 10;
      signals.push({ key: 'bb', score: 10, desc: 'מחיר קרוב לרצועת בולינגר התחתונה — אזור קנייה אפשרי' });
    } else if (bbPos > 0.85) {
      score -= 10;
      signals.push({ key: 'bb', score: -10, desc: 'מחיר קרוב לרצועת בולינגר העליונה — אזור מכירה אפשרי' });
    }
  }

  // 6. Volume trend (±10)
  if (last.volume != null && last.volSma20 != null && ohlcv.length >= 2) {
    const priceChange = ohlcv.at(-1).close - ohlcv.at(-2).close;
    const highVolume  = last.volume > last.volSma20 * 1.2;
    if (highVolume && priceChange > 0) {
      score += 10;
      signals.push({ key: 'volume', score: 10, desc: 'נפח מסחר גבוה עם עלייה במחיר — אישור מגמה שורית' });
    } else if (highVolume && priceChange < 0) {
      score -= 10;
      signals.push({ key: 'volume', score: -10, desc: 'נפח מסחר גבוה עם ירידה במחיר — אישור מגמה דובית' });
    }
  }

  // 7. Patterns (±15)
  const bullishPatterns = patterns.filter(p => p.direction === 'bullish');
  const bearishPatterns = patterns.filter(p => p.direction === 'bearish');

  if (bullishPatterns.length) {
    const best = bullishPatterns.reduce((a, b) => a.confidence > b.confidence ? a : b);
    const ps = Math.round(best.confidence * 15);
    score += ps;
    signals.push({ key: 'pattern', score: ps, desc: `תבנית שורית: ${best.description}` });
  }
  if (bearishPatterns.length) {
    const best = bearishPatterns.reduce((a, b) => a.confidence > b.confidence ? a : b);
    const ps = -Math.round(best.confidence * 15);
    score += ps;
    signals.push({ key: 'pattern', score: ps, desc: `תבנית דובית: ${best.description}` });
  }

  // 8. Golden / Death Cross (±8 bonus)
  if (last.sma50 != null && last.sma200 != null) {
    if (last.sma50 > last.sma200) {
      score += 8;
      signals.push({ key: 'cross', score: 8, desc: 'Golden Cross — MA50 מעל MA200, מגמת עלייה ארוכת טווח' });
    } else {
      score -= 8;
      signals.push({ key: 'cross', score: -8, desc: 'Death Cross — MA50 מתחת ל-MA200, מגמת ירידה ארוכת טווח' });
    }
  }

  // Clamp to [-100, +100]
  score = Math.max(-100, Math.min(100, score));

  return { score, signals };
}

// ── Batch analysis for portfolio ──────────────────────────────────────

/**
 * Analyze multiple tickers concurrently (with concurrency limit).
 * @param {string[]} tickers
 * @param {number}   concurrency
 * @returns {Object} { ticker: AnalysisResult | Error }
 */
export async function analyzePortfolio(tickers, concurrency = 3) {
  const results = {};
  const queue = [...tickers];

  async function worker() {
    while (queue.length) {
      const ticker = queue.shift();
      try {
        results[ticker] = await analyzeStock(ticker);
      } catch (err) {
        results[ticker] = { error: err.message, ticker };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tickers.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
