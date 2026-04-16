// ===== patterns.js =====
// Chart pattern detection algorithms.
// All detectors accept an OHLCV[] array and return Pattern[] (may be empty).

// ── Peak / Trough detection ────────────────────────────────────────────

/**
 * Find swing highs: bars where high[i] is the highest within ±lookback bars.
 * Returns array of indices.
 */
function findPeaks(ohlcv, lookback = 5) {
  const peaks = [];
  for (let i = lookback; i < ohlcv.length - lookback; i++) {
    let isMax = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && ohlcv[j].high >= ohlcv[i].high) { isMax = false; break; }
    }
    if (isMax) peaks.push(i);
  }
  return peaks;
}

/**
 * Find swing lows: bars where low[i] is the lowest within ±lookback bars.
 */
function findTroughs(ohlcv, lookback = 5) {
  const troughs = [];
  for (let i = lookback; i < ohlcv.length - lookback; i++) {
    let isMin = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && ohlcv[j].low <= ohlcv[i].low) { isMin = false; break; }
    }
    if (isMin) troughs.push(i);
  }
  return troughs;
}

// ── Pattern result factory ─────────────────────────────────────────────

function makePattern(type, direction, confidence, startIdx, endIdx, keyPoints, targetPrice, description) {
  return { type, direction, confidence, startIndex: startIdx, endIndex: endIdx, keyPoints, targetPrice, description };
}

// ── 1. Head & Shoulders ────────────────────────────────────────────────

export function detectHeadAndShoulders(ohlcv, lookback = 5) {
  const results = [];
  const peaks = findPeaks(ohlcv, lookback);
  const troughs = findTroughs(ohlcv, lookback);

  for (let pi = 0; pi < peaks.length - 2; pi++) {
    const lsIdx = peaks[pi];
    const hIdx  = peaks[pi + 1];
    const rsIdx = peaks[pi + 2];

    const ls = ohlcv[lsIdx].high;
    const h  = ohlcv[hIdx].high;
    const rs = ohlcv[rsIdx].high;

    // Head must be higher than both shoulders
    if (h <= ls || h <= rs) continue;
    // Shoulders within 10% of each other
    if (Math.abs(ls - rs) / ls > 0.10) continue;
    // Minimum separation
    if (hIdx - lsIdx < 5 || rsIdx - hIdx < 5) continue;

    // Find troughs between shoulders
    const t1 = troughs.filter(t => t > lsIdx && t < hIdx);
    const t2 = troughs.filter(t => t > hIdx  && t < rsIdx);
    if (!t1.length || !t2.length) continue;

    const trough1Idx = t1.reduce((a, b) => ohlcv[a].low < ohlcv[b].low ? a : b);
    const trough2Idx = t2.reduce((a, b) => ohlcv[a].low < ohlcv[b].low ? a : b);
    const necklineLevel = (ohlcv[trough1Idx].low + ohlcv[trough2Idx].low) / 2;

    // Confidence: symmetry + neckline flatness
    const symmetry = 1 - Math.abs(ls - rs) / ls;
    const neckFlat = 1 - Math.abs(ohlcv[trough1Idx].low - ohlcv[trough2Idx].low) / necklineLevel;
    const confidence = Math.min(0.95, (symmetry * 0.6 + neckFlat * 0.4));

    if (confidence < 0.4) continue;

    const patternHeight = h - necklineLevel;
    const targetPrice = necklineLevel - patternHeight;

    results.push(makePattern(
      'head-and-shoulders', 'bearish', confidence,
      lsIdx, rsIdx,
      [
        { index: lsIdx, price: ls, label: 'כתף שמאל' },
        { index: hIdx,  price: h,  label: 'ראש' },
        { index: rsIdx, price: rs, label: 'כתף ימין' },
        { index: trough1Idx, price: ohlcv[trough1Idx].low, label: 'צוואר 1' },
        { index: trough2Idx, price: ohlcv[trough2Idx].low, label: 'צוואר 2' },
      ],
      targetPrice,
      `ראש וכתפיים — תבנית היפוך דובית. מחיר יעד: $${targetPrice.toFixed(2)}`
    ));
  }
  return results;
}

// ── 2. Inverse Head & Shoulders ────────────────────────────────────────

export function detectInverseHeadAndShoulders(ohlcv, lookback = 5) {
  const results = [];
  const troughs = findTroughs(ohlcv, lookback);
  const peaks   = findPeaks(ohlcv, lookback);

  for (let ti = 0; ti < troughs.length - 2; ti++) {
    const lsIdx = troughs[ti];
    const hIdx  = troughs[ti + 1];
    const rsIdx = troughs[ti + 2];

    const ls = ohlcv[lsIdx].low;
    const h  = ohlcv[hIdx].low;
    const rs = ohlcv[rsIdx].low;

    // Head (lowest trough) must be lower
    if (h >= ls || h >= rs) continue;
    if (Math.abs(ls - rs) / ls > 0.10) continue;
    if (hIdx - lsIdx < 5 || rsIdx - hIdx < 5) continue;

    const p1 = peaks.filter(p => p > lsIdx && p < hIdx);
    const p2 = peaks.filter(p => p > hIdx  && p < rsIdx);
    if (!p1.length || !p2.length) continue;

    const peak1Idx = p1.reduce((a, b) => ohlcv[a].high > ohlcv[b].high ? a : b);
    const peak2Idx = p2.reduce((a, b) => ohlcv[a].high > ohlcv[b].high ? a : b);
    const necklineLevel = (ohlcv[peak1Idx].high + ohlcv[peak2Idx].high) / 2;

    const symmetry = 1 - Math.abs(ls - rs) / ls;
    const confidence = Math.min(0.95, symmetry * 0.7 + 0.15);
    if (confidence < 0.4) continue;

    const patternHeight = necklineLevel - h;
    const targetPrice = necklineLevel + patternHeight;

    results.push(makePattern(
      'inverse-head-and-shoulders', 'bullish', confidence,
      lsIdx, rsIdx,
      [
        { index: lsIdx, price: ls, label: 'כתף שמאל' },
        { index: hIdx,  price: h,  label: 'ראש' },
        { index: rsIdx, price: rs, label: 'כתף ימין' },
        { index: peak1Idx, price: ohlcv[peak1Idx].high, label: 'צוואר 1' },
        { index: peak2Idx, price: ohlcv[peak2Idx].high, label: 'צוואר 2' },
      ],
      targetPrice,
      `ראש וכתפיים הפוך — תבנית היפוך שורית. מחיר יעד: $${targetPrice.toFixed(2)}`
    ));
  }
  return results;
}

// ── 3. Double Top ─────────────────────────────────────────────────────

export function detectDoubleTop(ohlcv, lookback = 5) {
  const results = [];
  const peaks = findPeaks(ohlcv, lookback);

  for (let i = 0; i < peaks.length - 1; i++) {
    const p1Idx = peaks[i];
    const p2Idx = peaks[i + 1];
    const p1 = ohlcv[p1Idx].high;
    const p2 = ohlcv[p2Idx].high;

    // Similar height (within 3%)
    if (Math.abs(p1 - p2) / p1 > 0.03) continue;
    // Separation: 10–80 bars
    const sep = p2Idx - p1Idx;
    if (sep < 10 || sep > 80) continue;

    // Find lowest trough between the peaks
    let lowestIdx = p1Idx + 1;
    for (let j = p1Idx + 1; j < p2Idx; j++) {
      if (ohlcv[j].low < ohlcv[lowestIdx].low) lowestIdx = j;
    }
    const valleyPrice = ohlcv[lowestIdx].low;

    // Valley must retrace at least 5% from tops
    const avgTop = (p1 + p2) / 2;
    if ((avgTop - valleyPrice) / avgTop < 0.05) continue;

    const confidence = Math.min(0.90, 0.5 + (1 - Math.abs(p1 - p2) / p1) * 0.4);
    const targetPrice = valleyPrice - (avgTop - valleyPrice);

    results.push(makePattern(
      'double-top', 'bearish', confidence,
      p1Idx, p2Idx,
      [
        { index: p1Idx,    price: p1,         label: 'שיא ראשון' },
        { index: p2Idx,    price: p2,         label: 'שיא שני' },
        { index: lowestIdx, price: valleyPrice, label: 'עמק' },
      ],
      targetPrice,
      `קודקוד כפול — שיא כפול ברמת מחיר דומה. מחיר יעד: $${targetPrice.toFixed(2)}`
    ));
  }
  return results;
}

// ── 4. Double Bottom ──────────────────────────────────────────────────

export function detectDoubleBottom(ohlcv, lookback = 5) {
  const results = [];
  const troughs = findTroughs(ohlcv, lookback);

  for (let i = 0; i < troughs.length - 1; i++) {
    const t1Idx = troughs[i];
    const t2Idx = troughs[i + 1];
    const t1 = ohlcv[t1Idx].low;
    const t2 = ohlcv[t2Idx].low;

    if (Math.abs(t1 - t2) / t1 > 0.03) continue;
    const sep = t2Idx - t1Idx;
    if (sep < 10 || sep > 80) continue;

    // Find highest peak between
    let highestIdx = t1Idx + 1;
    for (let j = t1Idx + 1; j < t2Idx; j++) {
      if (ohlcv[j].high > ohlcv[highestIdx].high) highestIdx = j;
    }
    const peakPrice = ohlcv[highestIdx].high;

    const avgBottom = (t1 + t2) / 2;
    if ((peakPrice - avgBottom) / avgBottom < 0.05) continue;

    const confidence = Math.min(0.90, 0.5 + (1 - Math.abs(t1 - t2) / t1) * 0.4);
    const targetPrice = peakPrice + (peakPrice - avgBottom);

    results.push(makePattern(
      'double-bottom', 'bullish', confidence,
      t1Idx, t2Idx,
      [
        { index: t1Idx,     price: t1,        label: 'תחתית ראשונה' },
        { index: t2Idx,     price: t2,        label: 'תחתית שנייה' },
        { index: highestIdx, price: peakPrice, label: 'שיא ביניים' },
      ],
      targetPrice,
      `תחתית כפולה — תבנית היפוך שורית. מחיר יעד: $${targetPrice.toFixed(2)}`
    ));
  }
  return results;
}

// ── 5. Ascending Bottoms (Higher Lows) ────────────────────────────────

export function detectAscendingBottoms(ohlcv, lookback = 5) {
  const troughs = findTroughs(ohlcv, lookback);
  if (troughs.length < 3) return [];

  const results = [];
  // Sliding window of consecutive troughs
  for (let i = 0; i <= troughs.length - 3; i++) {
    const window = troughs.slice(i, i + Math.min(6, troughs.length - i));
    if (window.length < 3) continue;

    // Check each consecutive pair is higher
    let allHigher = true;
    for (let j = 1; j < window.length; j++) {
      if (ohlcv[window[j]].low <= ohlcv[window[j-1]].low) { allHigher = false; break; }
    }
    if (!allHigher) continue;

    // Linear regression slope on trough lows
    const ys = window.map(idx => ohlcv[idx].low);
    const xs = window.map((_, j) => j);
    const slope = linRegSlope(xs, ys);
    if (slope <= 0) continue;

    const confidence = Math.min(0.85, 0.45 + (window.length - 3) * 0.1 + (slope / ys[0]) * 5);
    const targetPrice = ohlcv[window.at(-1)].low * 1.10; // rough upside target

    results.push(makePattern(
      'ascending-bottoms', 'bullish', confidence,
      window[0], window.at(-1),
      window.map(idx => ({ index: idx, price: ohlcv[idx].low, label: 'תחתית עולה' })),
      targetPrice,
      `תחתיות עולות — ${window.length} תחתיות עולות ברצף, מגמת קנייה`
    ));
    break; // One result per lookback
  }
  return results;
}

// ── 6. Descending Tops (Lower Highs) ─────────────────────────────────

export function detectDescendingTops(ohlcv, lookback = 5) {
  const peaks = findPeaks(ohlcv, lookback);
  if (peaks.length < 3) return [];

  const results = [];
  for (let i = 0; i <= peaks.length - 3; i++) {
    const window = peaks.slice(i, i + Math.min(6, peaks.length - i));
    if (window.length < 3) continue;

    let allLower = true;
    for (let j = 1; j < window.length; j++) {
      if (ohlcv[window[j]].high >= ohlcv[window[j-1]].high) { allLower = false; break; }
    }
    if (!allLower) continue;

    const ys = window.map(idx => ohlcv[idx].high);
    const xs = window.map((_, j) => j);
    const slope = linRegSlope(xs, ys);
    if (slope >= 0) continue;

    const confidence = Math.min(0.80, 0.40 + (window.length - 3) * 0.1);

    results.push(makePattern(
      'descending-tops', 'bearish', confidence,
      window[0], window.at(-1),
      window.map(idx => ({ index: idx, price: ohlcv[idx].high, label: 'קודקוד יורד' })),
      null,
      `קודקודים יורדים — ${window.length} קודקודים יורדים ברצף, מגמת מכירה`
    ));
    break;
  }
  return results;
}

// ── 7. Triangle patterns ───────────────────────────────────────────────

export function detectTriangles(ohlcv, lookback = 5, minSwings = 4) {
  const peaks   = findPeaks(ohlcv, lookback);
  const troughs = findTroughs(ohlcv, lookback);

  if (peaks.length < 2 || troughs.length < 2) return [];

  // Use the last N swings
  const recentPeaks   = peaks.slice(-Math.min(peaks.length, 6));
  const recentTroughs = troughs.slice(-Math.min(troughs.length, 6));

  const resistSlope = linRegSlope(
    recentPeaks.map((_, i) => i),
    recentPeaks.map(i => ohlcv[i].high)
  );
  const supportSlope = linRegSlope(
    recentTroughs.map((_, i) => i),
    recentTroughs.map(i => ohlcv[i].low)
  );

  const startIdx = Math.min(recentPeaks[0], recentTroughs[0]);
  const endIdx   = Math.max(recentPeaks.at(-1), recentTroughs.at(-1));

  const FLAT = 0.001; // slope threshold to call it "flat"

  let type, direction, description;
  const resistFlat  = Math.abs(resistSlope) < FLAT * ohlcv.at(-1).close;
  const supportFlat = Math.abs(supportSlope) < FLAT * ohlcv.at(-1).close;

  if (!resistFlat && supportSlope > FLAT * ohlcv.at(-1).close) {
    type = 'ascending-triangle'; direction = 'bullish';
    description = 'משולש עולה — תמיכה עולה + התנגדות שטוחה. פוטנציאל פריצה כלפי מעלה';
  } else if (resistSlope < -FLAT * ohlcv.at(-1).close && !supportFlat) {
    type = 'descending-triangle'; direction = 'bearish';
    description = 'משולש יורד — התנגדות יורדת + תמיכה שטוחה. פוטנציאל פריצה כלפי מטה';
  } else if (resistSlope < -FLAT * ohlcv.at(-1).close && supportSlope > FLAT * ohlcv.at(-1).close) {
    type = 'symmetrical-triangle'; direction = 'neutral';
    description = 'משולש סימטרי — התכנסות מחיר. ציפייה לפריצה חדה בכל כיוון';
  } else {
    return [];
  }

  const confidence = 0.55;
  const keyPoints = [
    ...recentPeaks.map(i => ({ index: i, price: ohlcv[i].high, label: 'התנגדות' })),
    ...recentTroughs.map(i => ({ index: i, price: ohlcv[i].low, label: 'תמיכה' })),
  ].sort((a, b) => a.index - b.index);

  return [makePattern(type, direction, confidence, startIdx, endIdx, keyPoints, null, description)];
}

// ── Run all detectors ─────────────────────────────────────────────────

export function detectAllPatterns(ohlcv) {
  if (!ohlcv || ohlcv.length < 30) return [];

  // Use last 252 bars (≈1 year daily) for pattern detection
  const window = ohlcv.slice(-252);
  const offset = ohlcv.length - window.length;

  const raw = [
    ...detectHeadAndShoulders(window),
    ...detectInverseHeadAndShoulders(window),
    ...detectDoubleTop(window),
    ...detectDoubleBottom(window),
    ...detectAscendingBottoms(window),
    ...detectDescendingTops(window),
    ...detectTriangles(window),
  ];

  // Re-index to full array
  return raw
    .map(p => ({
      ...p,
      startIndex: p.startIndex + offset,
      endIndex:   p.endIndex   + offset,
      keyPoints:  p.keyPoints.map(kp => ({ ...kp, index: kp.index + offset })),
    }))
    .filter(p => p.confidence >= 0.40)
    .sort((a, b) => b.confidence - a.confidence);
}

// ── Math helper ───────────────────────────────────────────────────────

function linRegSlope(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}
