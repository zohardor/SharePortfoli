// ===== db.js =====
// Supabase CRUD wrapper for holdings, watchlist, and analysis_cache.
// Requires the Supabase JS CDN to be loaded before this module.

import { getConfig, USER_ID } from './config.js';

let _client = null;

function getClient() {
  if (_client) return _client;
  const { supabaseUrl, supabaseKey } = getConfig();
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase לא מוגדר. עבור להגדרות.');
  // supabase is the global from CDN
  _client = supabase.createClient(supabaseUrl, supabaseKey, {
    global: { headers: { 'x-user-id': USER_ID } },
  });
  return _client;
}

// Reset client (call after saving new settings)
export function resetClient() { _client = null; }

// ── Holdings ────────────────────────────────────────────────────────────

export async function getHoldings() {
  const { data, error } = await getClient()
    .from('holdings')
    .select('*')
    .eq('user_id', USER_ID)
    .order('ticker');
  if (error) throw error;
  return data;
}

export async function upsertHolding(holding) {
  const row = {
    ...holding,
    user_id: USER_ID,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getClient()
    .from('holdings')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHolding(id) {
  const { error } = await getClient()
    .from('holdings')
    .delete()
    .eq('id', id)
    .eq('user_id', USER_ID);
  if (error) throw error;
}

// ── Watchlist ───────────────────────────────────────────────────────────

export async function getWatchlist() {
  const { data, error } = await getClient()
    .from('watchlist')
    .select('*')
    .eq('user_id', USER_ID)
    .order('added_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addToWatchlist(ticker) {
  const { data, error } = await getClient()
    .from('watchlist')
    .upsert({ user_id: USER_ID, ticker: ticker.toUpperCase() }, { onConflict: 'user_id,ticker' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFromWatchlist(ticker) {
  const { error } = await getClient()
    .from('watchlist')
    .delete()
    .eq('user_id', USER_ID)
    .eq('ticker', ticker.toUpperCase());
  if (error) throw error;
}

// ── Analysis Cache ──────────────────────────────────────────────────────

export async function getCachedOHLCV(cacheKey) {
  const { data } = await getClient()
    .from('analysis_cache')
    .select('ohlcv_json, fetched_at')
    .eq('ticker', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return data; // null if not found or expired
}

export async function setCachedOHLCV(cacheKey, interval, ohlcvJson) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4 hours
  const { error } = await getClient()
    .from('analysis_cache')
    .upsert({
      ticker: cacheKey,
      interval,
      ohlcv_json: ohlcvJson,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  if (error) console.warn('Cache write failed:', error.message);
}

// ── Connection test ──────────────────────────────────────────────────────

export async function testConnection() {
  const { error } = await getClient().from('holdings').select('id').limit(1);
  if (error) throw new Error(error.message);
  return true;
}
