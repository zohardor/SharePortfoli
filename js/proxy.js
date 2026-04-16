// ===== proxy.js =====
// Fetches OHLCV data from Yahoo Finance via CORS proxies (tries multiple fallbacks).

import { getCachedOHLCV, setCachedOHLCV } from './db.js';

// Yahoo Finance endpoints (try both query1 + query2)
const YAHOO_BASES = [
  'https://query2.finance.yahoo.com/v8/finance/chart/',
  'https://query1.finance.yahoo.com/v8/finance/chart/',
];

// Proxy list in priority order
// type 'raw'     → response is the JSON directly
// type 'wrapped' → allorigins wraps in { contents: "..." }
const PROXY_LIST = [
  { base: 'https://api.allorigins.win/raw?url=',          type: 'raw'     },
  { base: 'https://corsproxy.io/?',                        type: 'raw'     },
  { base: 'https://api.allorigins.win/get?url=',           type: 'wrapped' },
  { base: 'https://thingproxy.freeboard.io/fetch/',        type: 'raw'     },
];

const RANGE_MAP = {
  '1mo':'1mo','3mo':'3mo','6mo':'6mo',
  '1y':'1y','2y':'2y','3y':'3y','5y':'5y','max':'max',
};

/**
 * Fetch OHLCV candles for a ticker.
 * Tries Supabase cache first, then fetches via proxy with multiple fallbacks.
 */
export async function fetchOHLCV(ticker, interval = '1d', range = '5y') {
  const cacheKey = `${ticker.toUpperCase()}_${interval}`;

  // 1. Check Supabase cache
  try {
    const cached = await getCachedOHLCV(cacheKey);
    if (cached?.ohlcv_json) return deserializeOHLCV(cached.ohlcv_json);
  } catch (_) { /* cache unavailable — continue */ }

  // 2. Try each Yahoo base + each proxy combination
  const params = `?interval=${interval}&range=${RANGE_MAP[range] || '5y'}&includePrePost=false&events=div,splits`;
  let lastError = null;

  for (const yahooBase of YAHOO_BASES) {
    for (const proxy of PROXY_LIST) {
      const yahooUrl = `${yahooBase}${encodeURIComponent(ticker.toUpperCase())}${params}`;
      try {
        const json = await fetchWithProxy(proxy, yahooUrl);
        const ohlcv = parseYahooResponse(json, ticker);
        if (ohlcv.length === 0) continue;

        // 3. Save to cache (non-blocking)
        try { await setCachedOHLCV(cacheKey, interval, serializeOHLCV(ohlcv)); } catch (_) {}

        return ohlcv;
      } catch (err) {
        lastError = err;
        // Continue to next proxy
      }
    }
  }

  throw new Error(`לא ניתן לטעון נתונים עבור ${ticker}. בדוק את חיבור האינטרנט.\n${lastError?.message || ''}`);
}

/**
 * Fetch the latest closing price for a ticker.
 */
export async function fetchCurrentPrice(ticker) {
  try {
    const ohlcv = await fetchOHLCV(ticker.toUpperCase(), '1d', '5d');
    if (!ohlcv.length) throw new Error('No data');
    const last = ohlcv.at(-1);
    const prev = ohlcv.length > 1 ? ohlcv.at(-2) : null;
    // Try to get company name from a quick fetch
    return {
      price:         last.close,
      previousClose: prev?.close ?? null,
      ticker:        ticker.toUpperCase(),
      name:          ticker.toUpperCase(),
    };
  } catch (err) {
    console.warn(`fetchCurrentPrice(${ticker}):`, err.message);
    return { price: null, previousClose: null, ticker: ticker.toUpperCase(), name: ticker.toUpperCase() };
  }
}

// ── Internal helpers ───────────────────────────────────────────────────

async function fetchWithProxy(proxy, yahooUrl) {
  const url = proxy.base + encodeURIComponent(yahooUrl);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10000); // 10s timeout per proxy

  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from proxy`);

    if (proxy.type === 'wrapped') {
      // allorigins /get wraps response: { contents: "...", status: {...} }
      const outer = await resp.json();
      if (!outer.contents) throw new Error('allorigins: empty contents');
      return JSON.parse(outer.contents);
    } else {
      return await resp.json();
    }
  } finally {
    clearTimeout(timeout);
  }
}

function parseYahooResponse(json, ticker) {
  // Handle Yahoo error responses
  if (json?.chart?.error) {
    throw new Error(`Yahoo Finance: ${json.chart.error.description || 'unknown error'}`);
  }

  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('תגובת Yahoo Finance לא תקינה');

  const { timestamp } = result;
  const quote    = result.indicators?.quote?.[0] ?? {};
  const adjClose = result.indicators?.adjclose?.[0]?.adjclose ?? quote.close;

  if (!timestamp?.length) throw new Error(`אין נתונים עבור ${ticker}`);

  return timestamp
    .map((ts, i) => ({
      date:     new Date(ts * 1000),
      open:     quote.open?.[i]   ?? null,
      high:     quote.high?.[i]   ?? null,
      low:      quote.low?.[i]    ?? null,
      close:    quote.close?.[i]  ?? null,
      volume:   quote.volume?.[i] ?? null,
      adjClose: adjClose?.[i]     ?? quote.close?.[i] ?? null,
    }))
    .filter(b => b.close !== null && b.open !== null && b.high !== null && b.low !== null);
}

function serializeOHLCV(ohlcv)   { return ohlcv.map(b => ({ ...b, date: b.date.toISOString() })); }
function deserializeOHLCV(json)  { return json.map(b => ({ ...b, date: new Date(b.date) })); }

export function getCloses(ohlcv)  { return ohlcv.map(b => b.close); }

export function toWeekly(dailyOhlcv) {
  if (!dailyOhlcv.length) return [];
  const weeks = {};
  for (const bar of dailyOhlcv) {
    const wk = `${bar.date.getFullYear()}-${getWeekNumber(bar.date)}`;
    weeks[wk] = bar;
  }
  return Object.values(weeks).sort((a, b) => a.date - b.date);
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day  = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
