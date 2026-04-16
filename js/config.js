// ===== config.js =====
// Supabase credentials, proxy URL, and anonymous user identity.
// Edit these values in settings.html — they are saved to localStorage.

// Generate a persistent anonymous user ID (one-time, stored in localStorage)
export const USER_ID = (() => {
  let id = localStorage.getItem('portfolio_uid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('portfolio_uid', id);
  }
  return id;
})();

// Load settings from localStorage (set via settings.html)
export function getConfig() {
  return {
    supabaseUrl:  localStorage.getItem('supabase_url')  || '',
    supabaseKey:  localStorage.getItem('supabase_key')  || '',
    proxyUrl:     localStorage.getItem('proxy_url')     || 'https://corsproxy.io/?',
    proxyFallback: 'https://api.allorigins.win/get?url=',
  };
}

export function saveConfig({ supabaseUrl, supabaseKey, proxyUrl }) {
  if (supabaseUrl) localStorage.setItem('supabase_url', supabaseUrl);
  if (supabaseKey) localStorage.setItem('supabase_key', supabaseKey);
  if (proxyUrl)    localStorage.setItem('proxy_url', proxyUrl);
}

export function isConfigured() {
  const { supabaseUrl, supabaseKey } = getConfig();
  return !!(supabaseUrl && supabaseKey);
}

// Redirect to settings if not configured (call from each page)
export function requireConfig() {
  if (!isConfigured()) {
    const current = encodeURIComponent(location.pathname + location.search);
    location.href = `settings.html?redirect=${current}`;
    return false;
  }
  return true;
}
