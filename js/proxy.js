// ===== proxy.js =====
// Fetches OHLCV data from Yahoo Finance via a CORS proxy.
// Checks Supabase analysis_cache first; falls back to fresh fetch.

import { getConfig } from './config.js';
import { getCachedOHLCV, setCachedOHLCV } from './db.js';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

// Yahoo Finance interval + range mappings
const RANGE_MAP = {
  '1mo': '1mo', '3mo': '3mo', '6mo': '6mo',
  '1y': '1y', '2y': '2y', '3y': '3y', '5y': '5y', 'max': 'max',
};

/**
 * Fetch OHLCV candles for a ticker.
 * @param {string} ticker   e.g. "AAPL"
 * @param {string} interval '1d' | '1wk' | '1mo'
 * @param {string} range    '1y' | '5y' | 'max' etc.
 * @returns {Array<{date,open,high,low,close,volume,adjClose}>}
 */
export async function fetchOHLCV(ticker, interval = '1d', range = '5y') {
  const cacheKey = `${ticker.toUpperCase()}_${interval}`;

  // 1. Check cache
  try {
    const cached = await getCachedOHLCV(cacheKey);
    if (cached && cached.ohlcv_json) {
      return deserializeOHLCV(cached.ohlcv_json);
    }
  } catch (_) { /* cache miss or Supabase not configured – continue */ }

  // 2. Fetch from Yahoo via proxy
  const yahooUrl = `${YAHOO_BASE}${encodeURIComponent(ticker.toUpperCase())}?interval=${interval}&range=${RANGE_MAP[range] || '5y'}&includePrePost=false`;
  const raw = await fetchViaProxy(yahooUrl);
  const ohlcv = parseYahooResponse(raw);

  // 3. Store in cache
  try {
    await setCachedOHLCV(cacheKey, interval, serializeOHLCV(ohlcv));
  } catch (_) { /* non-fatal */ }

  return ohlcv;
}

/**
 * Fetch the latest closing price for a ticker (uses 5-day daily data).
 */
export async function fetchCurrentPrice(ticker) {
  const yahooUrl = `${YAHOO_BASE}${encodeURIComponent(ticker.toUpperCase())}?interval=1d&range=5d&includePrePost=false`;
  try {
    const raw = await fetchViaProxy(yahooUrl);
    const result = raw.chart?.result?.[0];
    if (!result) throw new Error('No data');
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter(c => c != null);
    if (!validCloses.length) throw new Error('No closes');
    const meta = result.meta || {};
    return {
      price: meta.regularMarketPrice ?? validCloses.at(-1),
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? validCloses.at(-2),
      ticker: ticker.toUpperCase(),
      name: meta.longName || meta.shortName || ticker.toUpperCase(),
    };
  } catch (err) {
    console.warn(`fetchCurrentPrice(${ticker}) failed:`, err.message);
    return { price: null, previousClose: null, ticker: ticker.toUpperCase(), name: ticker.toUpperCase() };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────

async function fetchViaProxy(url) {
  const { proxyUrl, proxyFallback } = getConfig();

  // Try primary proxy
  try {
    return await doFetch(proxyUrl, url);
  } catch (e1) {
    console.warn('Primary proxy failed, trying fallback:', e1.message);
  }

  // Try fallback proxy (allorigins wraps in {contents: "..."})
  const fallbackResult = await doFetch(proxyFallback, url, true);
  return fallbackResult;
}

async function doFetch(proxyBase, targetUrl, isAllOrigins = false) {
  const proxied = proxyBase + encodeURIComponent(targetUrl);
  const resp = await fetch(proxied);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (isAllOrigins) {
    // allorigins returns { contents: "...", status: {...} }
    if (!json.contents) throw new Error('allorigins: empty contents');
    return JSON.parse(json.contents);
  }
  return json;
}

function parseYahooResponse(json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('תגובת Yahoo Finance לא תקינה');

  const { timestamp } = result;
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjCloseArr = result.indicators?.adjclose?.[0]?.adjclose ?? quote.close;

  if (!timestamp || !timestamp.length) throw new Error('אין נתונים עבור מניה זו');

  return timestamp
    .map((ts, i) => ({
      date: new Date(ts * 1000),
      open:     quote.open?.[i]   ?? null,
      high:     quote.high?.[i]   ?? null,
      low:      quote.low?.[i]    ?? null,
      close:    quote.close?.[i]  ?? null,
      volume:   quote.volume?.[i] ?? null,
      adjClose: adjCloseArr?.[i]  ?? quote.close?.[i] ?? null,
    }))
    .filter(b => b.close !== null && b.open !== null);
}

/** Serialize for Supabase JSONB (dates as ISO strings) */
function serializeOHLCV(ohlcv) {
  return ohlcv.map(b => ({ ...b, date: b.date.toISOString() }));
}

/** Deserialize from Supabase JSONB */
function deserializeOHLCV(json) {
  return json.map(b => ({ ...b, date: new Date(b.date) }));
}

/** Extract just the closing prices array */
export function getCloses(ohlcv) {
  return ohlcv.map(b => b.close);
}

/** Extract weekly closing prices from daily OHLCV (last bar of each week) */
export function toWeekly(dailyOhlcv) {
  if (!dailyOhlcv.length) return [];
  const weeks = {};
  for (const bar of dailyOhlcv) {
    // ISO week key: year + week number
    const d = bar.date;
    const weekKey = `${d.getFullYear()}-${getWeekNumber(d)}`;
    weeks[weekKey] = bar; // overwrite → keeps last day of week
  }
  return Object.values(weeks).sort((a, b) => a.date - b.date);
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
