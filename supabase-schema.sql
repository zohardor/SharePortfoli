-- ============================================================
-- SharePortfolio — Supabase SQL Schema
-- הרץ קובץ זה ב: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── אחזקות ──────────────────────────────────────────────────
create table if not exists holdings (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  ticker     text not null,
  name       text,
  shares     numeric(18,6) not null,
  avg_cost   numeric(18,4) not null,
  added_at   timestamptz default now(),
  updated_at timestamptz default now()
);

alter table holdings enable row level security;

create policy "own rows holdings" on holdings
  using (user_id = current_setting('request.headers')::json->>'x-user-id');

create index if not exists idx_holdings_user_id on holdings (user_id);

-- ── רשימת מעקב ──────────────────────────────────────────────
create table if not exists watchlist (
  id       uuid primary key default gen_random_uuid(),
  user_id  text not null,
  ticker   text not null,
  added_at timestamptz default now(),
  unique(user_id, ticker)
);

alter table watchlist enable row level security;

create policy "own rows watchlist" on watchlist
  using (user_id = current_setting('request.headers')::json->>'x-user-id');

create index if not exists idx_watchlist_user_id on watchlist (user_id);

-- ── מטמון ניתוח OHLCV (ציבורי — ללא RLS) ───────────────────
-- expires_at מחושב אוטומטית: 4 שעות אחרי fetched_at
create table if not exists analysis_cache (
  ticker      text primary key,
  interval    text not null default '1d',
  ohlcv_json  jsonb not null,
  fetched_at  timestamptz default now(),
  expires_at  timestamptz generated always as
              (fetched_at + interval '4 hours') stored
);

-- index לחיפוש cache תקף
create index if not exists idx_cache_expires on analysis_cache (expires_at);

-- ── הרשאות anon ──────────────────────────────────────────────
-- בשביל ש-anon key יוכל לקרוא/לכתוב
grant all on holdings       to anon;
grant all on watchlist      to anon;
grant all on analysis_cache to anon;

-- ============================================================
-- הערות:
-- 1. ה-user_id נשלח כ-header 'x-user-id' מה-JS (localStorage UUID)
-- 2. analysis_cache משותף לכולם — נתוני מניות הם ציבוריים
-- 3. ה-expires_at מחושב אוטומטית — אין צורך לנהל TTL ב-JS
-- ============================================================
