// ===== utils.js =====
// Formatting helpers, Hebrew labels, date utilities.

// ── Number / currency formatting ──────────────────────────────────────────
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' });
const numFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatUSD   = v => v == null ? '—' : usdFmt.format(v);
export const formatPct   = v => v == null ? '—' : pctFmt.format(v / 100);
export const formatNum   = v => v == null ? '—' : numFmt.format(v);
export const formatShares = v => v == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(v);

/** Wrap a number in an LTR span so it renders correctly inside RTL text */
export const ltr = v => `<span dir="ltr">${v}</span>`;

/** Returns "positive" | "negative" | "" CSS class */
export const pnlClass = v => v > 0 ? 'positive' : v < 0 ? 'negative' : '';

// ── Date helpers ────────────────────────────────────────────────────────
export function formatDate(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(date) {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('he-IL');
}

export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split('T')[0];
}

export function subtractDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

// ── Hebrew labels ──────────────────────────────────────────────────────
export const SIGNAL_LABELS = {
  'strong-buy':  { text: 'קנייה חזקה',   cls: 'signal-strong-buy'  },
  'buy':         { text: 'קנייה',         cls: 'signal-buy'         },
  'weak-buy':    { text: 'קנייה חלשה',   cls: 'signal-weak-buy'    },
  'hold':        { text: 'המתן',          cls: 'signal-hold'        },
  'weak-sell':   { text: 'מכירה חלשה',   cls: 'signal-weak-sell'   },
  'sell':        { text: 'מכירה',         cls: 'signal-sell'        },
  'strong-sell': { text: 'מכירה חזקה',   cls: 'signal-strong-sell' },
};

export const PATTERN_LABELS = {
  'head-and-shoulders':         { text: 'ראש וכתפיים',         dir: 'bearish' },
  'inverse-head-and-shoulders': { text: 'ראש וכתפיים הפוך',   dir: 'bullish' },
  'double-top':                 { text: 'קודקוד כפול',         dir: 'bearish' },
  'double-bottom':              { text: 'תחתית כפולה',         dir: 'bullish' },
  'ascending-bottoms':          { text: 'תחתיות עולות',        dir: 'bullish' },
  'descending-tops':            { text: 'קודקודים יורדים',     dir: 'bearish' },
  'ascending-triangle':         { text: 'משולש עולה',          dir: 'bullish' },
  'descending-triangle':        { text: 'משולש יורד',          dir: 'bearish' },
  'symmetrical-triangle':       { text: 'משולש סימטרי',        dir: 'neutral' },
};

export function scoreToSignal(score) {
  if (score >= 30)        return 'strong-buy';
  if (score >= 10)        return 'buy';
  if (score >= 1)         return 'weak-buy';
  if (score > -1)         return 'hold';
  if (score >= -29)       return 'weak-sell';
  if (score >= -49)       return 'sell';
  return 'strong-sell';
}

/** Render a signal badge HTML string */
export function signalBadge(signal) {
  const s = SIGNAL_LABELS[signal] || SIGNAL_LABELS['hold'];
  return `<span class="badge ${s.cls}">${s.text}</span>`;
}

/** Render a direction badge (bullish / bearish / neutral) */
export function dirBadge(dir) {
  const map = { bullish: ['שורי', 'badge-bullish'], bearish: ['דובי', 'badge-bearish'], neutral: ['נייטרל', 'badge-neutral'] };
  const [text, cls] = map[dir] || map.neutral;
  return `<span class="badge ${cls}">${text}</span>`;
}

// ── Misc ────────────────────────────────────────────────────────────────
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  setTimeout(() => el.classList.remove('show'), 3500);
}

export function showLoading(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? 'flex' : 'none';
}
