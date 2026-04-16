// ===== portfolio.js =====
// Dashboard page logic: loads holdings, refreshes prices, shows P&L and signals.

import { requireConfig } from './config.js';
import { getHoldings, upsertHolding, deleteHolding } from './db.js';
import { fetchCurrentPrice } from './proxy.js';
import { analyzeStock } from './recommendations.js';
import {
  formatUSD, formatPct, formatShares, formatDate,
  ltr, pnlClass, signalBadge, showToast, showLoading, escapeHtml,
} from './utils.js';

// ── Bootstrap ─────────────────────────────────────────────────────────

if (!requireConfig()) { /* redirected */ } else {
  init();
}

async function init() {
  setupModal();
  setupImportExport();
  await loadDashboard();
}

// ── Load dashboard ─────────────────────────────────────────────────────

async function loadDashboard() {
  showLoading('dashboard-loading', true);
  try {
    const holdings = await getHoldings();
    if (!holdings.length) {
      showEmpty();
      return;
    }

    // Fetch current prices concurrently
    const quotes = await Promise.all(
      holdings.map(h => fetchCurrentPrice(h.ticker).catch(() => ({ price: null, previousClose: null, ticker: h.ticker })))
    );

    const quoteMap = Object.fromEntries(quotes.map(q => [q.ticker, q]));
    renderTable(holdings, quoteMap);
    renderSummary(holdings, quoteMap);
    renderAllocationChart(holdings, quoteMap);
  } catch (err) {
    showToast('שגיאה בטעינת הנתונים: ' + err.message, 'error');
  } finally {
    showLoading('dashboard-loading', false);
  }
}

// ── Table rendering ────────────────────────────────────────────────────

function renderTable(holdings, quoteMap) {
  const tbody = document.getElementById('holdings-tbody');
  if (!tbody) return;

  tbody.innerHTML = holdings.map(h => {
    const q = quoteMap[h.ticker] || {};
    const price = q.price;
    const mv    = price != null ? price * h.shares : null;
    const cost  = h.avg_cost * h.shares;
    const pnl   = mv != null ? mv - cost : null;
    const pnlP  = pnl != null ? (pnl / cost) * 100 : null;
    const dayChg = (price != null && q.previousClose != null) ? ((price - q.previousClose) / q.previousClose) * 100 : null;

    return `
      <tr data-id="${h.id}" data-ticker="${escapeHtml(h.ticker)}">
        <td class="ticker-cell">
          <a href="chart.html?ticker=${h.ticker}" class="ticker-link">${escapeHtml(h.ticker)}</a>
        </td>
        <td>${escapeHtml(h.name || q.name || h.ticker)}</td>
        <td dir="ltr">${ltr(formatShares(h.shares))}</td>
        <td dir="ltr">${ltr(formatUSD(h.avg_cost))}</td>
        <td dir="ltr" class="${price != null && dayChg != null ? pnlClass(dayChg) : ''}">${ltr(price != null ? formatUSD(price) : '—')}</td>
        <td dir="ltr">${ltr(mv != null ? formatUSD(mv) : '—')}</td>
        <td dir="ltr" class="${pnlClass(pnl)}">${ltr(pnl != null ? formatUSD(pnl) : '—')}</td>
        <td dir="ltr" class="${pnlClass(pnlP)}">${ltr(pnlP != null ? formatPct(pnlP) : '—')}</td>
        <td class="signal-cell" id="signal-${h.id}"><span class="badge badge-loading">טוען...</span></td>
        <td class="actions-cell">
          <button class="btn-icon btn-edit" data-id="${h.id}" title="ערוך">✎</button>
          <button class="btn-icon btn-delete" data-id="${h.id}" title="מחק">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  // Action listeners
  tbody.addEventListener('click', e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.classList.contains('btn-edit'))   openEditModal(id, holdings);
    if (e.target.classList.contains('btn-delete')) confirmDelete(id);
  });

  // Lazy-load signals
  holdings.forEach(h => loadSignalForHolding(h.ticker, h.id));
}

async function loadSignalForHolding(ticker, holdingId) {
  const cell = document.getElementById(`signal-${holdingId}`);
  if (!cell) return;
  try {
    const result = await analyzeStock(ticker);
    cell.innerHTML = `${signalBadge(result.signal)}<br><small class="score-text">${result.score > 0 ? '+' : ''}${result.score}</small>`;
    cell.title = result.signals.map(s => s.desc).join('\n');
  } catch (err) {
    cell.innerHTML = '<span class="badge badge-error">שגיאה</span>';
  }
}

// ── Summary bar ────────────────────────────────────────────────────────

function renderSummary(holdings, quoteMap) {
  let totalCost = 0, totalMV = 0;
  for (const h of holdings) {
    totalCost += h.avg_cost * h.shares;
    const q = quoteMap[h.ticker];
    if (q?.price != null) totalMV += q.price * h.shares;
  }
  const totalPnl  = totalMV - totalCost;
  const totalPnlP = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  setText('summary-value',  formatUSD(totalMV));
  setText('summary-cost',   formatUSD(totalCost));
  setText('summary-pnl',    formatUSD(totalPnl));
  setText('summary-pnl-pct', formatPct(totalPnlP));
  setText('summary-count',  String(holdings.length));

  setClass('summary-pnl',     pnlClass(totalPnl));
  setClass('summary-pnl-pct', pnlClass(totalPnlP));
}

// ── Allocation chart (Chart.js pie) ───────────────────────────────────

function renderAllocationChart(holdings, quoteMap) {
  const canvas = document.getElementById('allocation-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = holdings.map(h => h.ticker);
  const values = holdings.map(h => {
    const q = quoteMap[h.ticker];
    return q?.price != null ? q.price * h.shares : h.avg_cost * h.shares;
  });

  const colors = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6'];

  if (canvas._chartInstance) canvas._chartInstance.destroy();
  canvas._chartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: '#0f172a' }],
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Heebo' } } } },
      responsive: true,
      cutout: '60%',
    },
  });
}

// ── Modal ──────────────────────────────────────────────────────────────

function setupModal() {
  document.getElementById('btn-add-holding')?.addEventListener('click', () => openAddModal());
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('btn-modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('holding-form')?.addEventListener('submit', handleFormSubmit);
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'הוסף אחזקה';
  document.getElementById('holding-form').reset();
  delete document.getElementById('holding-form').dataset.editId;
  openModal();
}

function openEditModal(id, holdings) {
  const h = holdings.find(x => x.id === id);
  if (!h) return;
  document.getElementById('modal-title').textContent = 'ערוך אחזקה';
  document.getElementById('field-ticker').value = h.ticker;
  document.getElementById('field-shares').value = h.shares;
  document.getElementById('field-cost').value   = h.avg_cost;
  document.getElementById('field-date').value   = h.added_at?.split('T')[0] || '';
  document.getElementById('holding-form').dataset.editId = id;
  openModal();
}

function openModal()  { document.getElementById('modal-overlay').classList.add('open'); }
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

async function handleFormSubmit(e) {
  e.preventDefault();
  const form   = e.target;
  const ticker = form.querySelector('#field-ticker').value.trim().toUpperCase();
  const shares = parseFloat(form.querySelector('#field-shares').value);
  const cost   = parseFloat(form.querySelector('#field-cost').value);
  const dateV  = form.querySelector('#field-date').value;

  if (!ticker || isNaN(shares) || isNaN(cost)) {
    showToast('אנא מלא את כל השדות הנדרשים', 'error'); return;
  }

  const row = { ticker, shares, avg_cost: cost };
  if (form.dataset.editId) row.id = form.dataset.editId;
  if (dateV) row.added_at = dateV;

  try {
    await upsertHolding(row);
    closeModal();
    showToast('האחזקה נשמרה בהצלחה', 'success');
    await loadDashboard();
  } catch (err) {
    showToast('שגיאה בשמירה: ' + err.message, 'error');
  }
}

async function confirmDelete(id) {
  if (!confirm('האם למחוק אחזקה זו?')) return;
  try {
    await deleteHolding(id);
    showToast('האחזקה נמחקה', 'success');
    await loadDashboard();
  } catch (err) {
    showToast('שגיאה במחיקה: ' + err.message, 'error');
  }
}

// ── Import / Export ────────────────────────────────────────────────────

function setupImportExport() {
  document.getElementById('btn-export')?.addEventListener('click', exportCSV);
  document.getElementById('btn-import')?.addEventListener('click', () => document.getElementById('file-import')?.click());
  document.getElementById('file-import')?.addEventListener('change', importCSV);
}

async function exportCSV() {
  const holdings = await getHoldings();
  const rows = [['ticker','shares','avg_cost','added_at'], ...holdings.map(h => [h.ticker, h.shares, h.avg_cost, h.added_at || ''])];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'portfolio.csv';
  a.click();
}

async function importCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const header = lines[0].toLowerCase().split(',');
  const ti = header.indexOf('ticker'), si = header.indexOf('shares'), ci = header.indexOf('avg_cost');
  if (ti < 0 || si < 0 || ci < 0) { showToast('CSV חייב לכלול עמודות: ticker, shares, avg_cost', 'error'); return; }

  let count = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const ticker = cols[ti]?.trim().toUpperCase();
    const shares = parseFloat(cols[si]);
    const avg_cost = parseFloat(cols[ci]);
    if (!ticker || isNaN(shares) || isNaN(avg_cost)) continue;
    await upsertHolding({ ticker, shares, avg_cost }).catch(() => {});
    count++;
  }

  showToast(`יובאו ${count} אחזקות`, 'success');
  await loadDashboard();
  e.target.value = '';
}

// ── Empty state ────────────────────────────────────────────────────────

function showEmpty() {
  const tbody = document.getElementById('holdings-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="empty-state">אין אחזקות עדיין. לחץ "הוסף אחזקה" כדי להתחיל.</td></tr>';
}

// ── DOM helpers ────────────────────────────────────────────────────────
function setText(id, val)  { const el = document.getElementById(id); if (el) el.textContent = val; }
function setClass(id, cls) { const el = document.getElementById(id); if (el) { el.className = el.className.replace(/positive|negative/g, ''); if (cls) el.classList.add(cls); } }
