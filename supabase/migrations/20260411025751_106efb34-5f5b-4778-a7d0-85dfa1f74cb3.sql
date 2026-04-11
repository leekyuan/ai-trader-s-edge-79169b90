
-- trade_logs table
CREATE TABLE public.trade_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  sl NUMERIC NOT NULL,
  tp NUMERIC NOT NULL,
  pnl_usdt NUMERIC DEFAULT 0,
  pnl_pct NUMERIC DEFAULT 0,
  leverage INTEGER NOT NULL DEFAULT 1,
  signal_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK (signal_type IN ('MSS', 'FVG', 'BOTH', 'MANUAL')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'be')),
  quantity NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.trade_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trade logs" ON public.trade_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trade logs" ON public.trade_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trade logs" ON public.trade_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trade logs" ON public.trade_logs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_trade_logs_user_id ON public.trade_logs (user_id);
CREATE INDEX idx_trade_logs_created_at ON public.trade_logs (created_at);

-- backtest_results table
CREATE TABLE public.backtest_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pair TEXT NOT NULL,
  period_days INTEGER NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_trades INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC NOT NULL DEFAULT 0,
  total_return NUMERIC NOT NULL DEFAULT 0,
  max_drawdown NUMERIC NOT NULL DEFAULT 0,
  trades JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backtest results" ON public.backtest_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own backtest results" ON public.backtest_results FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own backtest results" ON public.backtest_results FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_backtest_results_user_id ON public.backtest_results (user_id);

-- Enable realtime for trade_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_logs;
