// ===== watchlist.js =====
// Watchlist page: shows tracked tickers with current price and quick signal.

import { requireConfig } from './config.js';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from './db.js';
import { fetchCurrentPrice } from './proxy.js';
import { analyzeStock } from './recommendations.js';
import { formatUSD, formatPct, signalBadge, showToast, showLoading, escapeHtml, pnlClass, ltr } from './utils.js';

if (!requireConfig()) { /* redirected */ } else {
  init();
}

async function init() {
  document.getElementById('btn-add-watch')?.addEventListener('click', addFromInput);
  document.getElementById('watch-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') addFromInput(); });
  await loadWatchlist();
}

async function loadWatchlist() {
  showLoading('watch-loading', true);
  try {
    const items = await getWatchlist();
    if (!items.length) { showEmpty(); return; }

    const grid = document.getElementById('watchlist-grid');
    if (!grid) return;
    grid.innerHTML = items.map(item => `
      <div class="watch-card" id="wc-${escapeHtml(item.ticker)}">
        <div class="watch-card-header">
          <a href="chart.html?ticker=${item.ticker}" class="ticker-link large">${escapeHtml(item.ticker)}</a>
          <button class="btn-icon btn-remove-watch" data-ticker="${escapeHtml(item.ticker)}" title="הסר">✕</button>
        </div>
        <div class="watch-price" id="wp-${item.ticker}">טוען...</div>
        <div class="watch-signal" id="ws-${item.ticker}"></div>
        <div class="watch-actions">
          <a href="chart.html?ticker=${item.ticker}" class="btn btn-sm btn-outline">גרף</a>
          <a href="buy.html?ticker=${item.ticker}" class="btn btn-sm btn-primary">נתח</a>
        </div>
      </div>
    `).join('');

    grid.addEventListener('click', e => {
      const ticker = e.target.dataset.ticker;
      if (e.target.classList.contains('btn-remove-watch') && ticker) {
        removeItem(ticker);
      }
    });

    // Load prices and signals concurrently
    items.forEach(item => loadCardData(item.ticker));
  } catch (err) {
    showToast('שגיאה בטעינת רשימת המעקב: ' + err.message, 'error');
  } finally {
    showLoading('watch-loading', false);
  }
}

async function loadCardData(ticker) {
  // Price
  const priceEl = document.getElementById(`wp-${ticker}`);
  try {
    const q = await fetchCurrentPrice(ticker);
    if (priceEl && q.price != null) {
      const chgPct = q.previousClose ? ((q.price - q.previousClose) / q.previousClose) * 100 : null;
      priceEl.innerHTML = `
        <span class="price-big" dir="ltr">${ltr(formatUSD(q.price))}</span>
        ${chgPct != null ? `<span class="${pnlClass(chgPct)}" dir="ltr">${ltr(formatPct(chgPct))}</span>` : ''}
      `;
    }
  } catch (_) {
    if (priceEl) priceEl.textContent = '—';
  }

  // Signal
  const sigEl = document.getElementById(`ws-${ticker}`);
  try {
    const result = await analyzeStock(ticker);
    if (sigEl) sigEl.innerHTML = signalBadge(result.signal);
  } catch (_) {
    if (sigEl) sigEl.innerHTML = '';
  }
}

async function addFromInput() {
  const input  = document.getElementById('watch-input');
  const ticker = input?.value.trim().toUpperCase();
  if (!ticker) return;
  try {
    await addToWatchlist(ticker);
    input.value = '';
    showToast(`${ticker} נוסף לרשימת המעקב`, 'success');
    await loadWatchlist();
  } catch (err) {
    showToast('שגיאה: ' + err.message, 'error');
  }
}

async function removeItem(ticker) {
  if (!confirm(`להסיר את ${ticker} מרשימת המעקב?`)) return;
  await removeFromWatchlist(ticker);
  showToast(`${ticker} הוסר`, 'success');
  await loadWatchlist();
}

function showEmpty() {
  const grid = document.getElementById('watchlist-grid');
  if (grid) grid.innerHTML = '<p class="empty-state">רשימת המעקב ריקה. הוסף סמלי מניות למעקב.</p>';
}
