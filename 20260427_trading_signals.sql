-- ============================================================
-- Supabase 마이그레이션: trading_signals 테이블 생성
-- supabase/migrations/ 에 넣고 supabase db push 실행
-- ============================================================

create table if not exists public.trading_signals (
  id          text        primary key,
  symbol      text        not null,
  direction   text        not null check (direction in ('LONG','SHORT')),
  strength    int2        not null default 1,
  entry1      numeric     not null,
  entry2      numeric     not null,
  tp1         numeric     not null,
  tp2         numeric     not null,
  sl1         numeric     not null,
  sl2         numeric     not null,
  rr_ratio    numeric     not null default 0,
  reasons     text[]      not null default '{}',
  indicators  jsonb,
  status      text        not null default 'ACTIVE'
                check (status in ('ACTIVE','TP1_HIT','TP2_HIT','SL_HIT','EXPIRED')),
  timestamp   bigint      not null,
  created_at  timestamptz not null default now()
);

-- 인덱스
create index if not exists idx_signals_symbol    on public.trading_signals(symbol);
create index if not exists idx_signals_timestamp on public.trading_signals(timestamp desc);
create index if not exists idx_signals_status    on public.trading_signals(status);

-- RLS (public read, anon insert 허용)
alter table public.trading_signals enable row level security;

create policy "Anyone can read signals"
  on public.trading_signals for select using (true);

create policy "Anon can insert signals"
  on public.trading_signals for insert
  with check (true);

create policy "Anon can update status"
  on public.trading_signals for update
  using (true) with check (true);

-- Realtime 활성화
alter publication supabase_realtime add table public.trading_signals;
