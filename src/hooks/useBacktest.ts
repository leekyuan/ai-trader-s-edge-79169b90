import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { calculateATR, detectMSS, detectFVG, checkConfluence } from '@/lib/indicators';

interface BacktestParams {
  pair: string;
  periodDays: number;
  leverage: number;
  rrRatio: number;
  riskPercent: number;
}

async function fetchKlines(symbol: string, interval: string, limit: number, endTime?: number) {
  const pair = `${symbol.toUpperCase()}USDT`;
  let url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
  if (endTime) url += `&endTime=${endTime}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.map((k: any) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    time: k[0],
  }));
}

export function useRunBacktest() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: BacktestParams) => {
      const { pair, periodDays, leverage, rrRatio, riskPercent } = params;

      // Fetch historical klines
      const hoursNeeded = periodDays * 24;
      const klines1H = await fetchKlines(pair, '1h', Math.min(hoursNeeded, 1000));
      const klines15M = await fetchKlines(pair, '15m', Math.min(hoursNeeded * 4, 1000));

      // Simulate trades
      const trades: any[] = [];
      const capital = 10000;

      for (let i = 50; i < klines1H.length; i++) {
        const slice1H = klines1H.slice(Math.max(0, i - 50), i + 1);
        const currentPrice = klines1H[i].close;

        // Find matching 15M candles
        const time1H = klines1H[i].time;
        const slice15M = klines15M.filter((k: any) => k.time <= time1H && k.time > time1H - 15 * 60 * 1000 * 50);

        if (slice15M.length < 10) continue;

        const atr = calculateATR(slice1H);
        const mss = detectMSS(slice1H);
        const fvg = detectFVG(slice15M, currentPrice);
        const confluence = checkConfluence(mss, fvg, currentPrice, atr);

        if (!confluence.isHighProbability) continue;

        const direction = confluence.direction;
        const entry = confluence.suggestedEntry;
        const sl = confluence.suggestedSL;
        const tp = confluence.suggestedTP;

        // Simulate forward
        let result = 'loss';
        let exitPrice = sl;

        for (let j = i + 1; j < Math.min(i + 48, klines1H.length); j++) {
          const candle = klines1H[j];
          if (direction === 'long') {
            if (candle.low <= sl) { exitPrice = sl; result = 'loss'; break; }
            if (candle.high >= tp) { exitPrice = tp; result = 'win'; break; }
          } else {
            if (candle.high >= sl) { exitPrice = sl; result = 'loss'; break; }
            if (candle.low <= tp) { exitPrice = tp; result = 'win'; break; }
          }
        }

        const pnlPct = direction === 'long'
          ? ((exitPrice - entry) / entry) * 100 * leverage
          : ((entry - exitPrice) / entry) * 100 * leverage;

        trades.push({
          date: new Date(klines1H[i].time).toISOString(),
          direction,
          entry: entry.toFixed(2),
          exit: exitPrice.toFixed(2),
          result,
          pnl_pct: parseFloat(pnlPct.toFixed(2)),
        });
      }

      const wins = trades.filter(t => t.result === 'win');
      const totalReturn = trades.reduce((s, t) => s + t.pnl_pct, 0);

      let peak = 0, mdd = 0, cum = 0;
      trades.forEach(t => {
        cum += t.pnl_pct;
        if (cum > peak) peak = cum;
        const dd = peak - cum;
        if (dd > mdd) mdd = dd;
      });

      // Max consecutive losses
      let maxConsecLoss = 0, consecLoss = 0;
      trades.forEach(t => {
        if (t.result === 'loss') { consecLoss++; maxConsecLoss = Math.max(maxConsecLoss, consecLoss); }
        else consecLoss = 0;
      });

      const result = {
        pair,
        period_days: periodDays,
        params: { leverage, rrRatio, riskPercent },
        total_trades: trades.length,
        win_rate: trades.length > 0 ? parseFloat(((wins.length / trades.length) * 100).toFixed(1)) : 0,
        total_return: parseFloat(totalReturn.toFixed(2)),
        max_drawdown: parseFloat(mdd.toFixed(2)),
        trades,
        max_consec_loss: maxConsecLoss,
      };

      // Save to Supabase
      if (user) {
        await supabase.from('backtest_results').insert({
          user_id: user.id,
          pair,
          period_days: periodDays,
          params: { leverage, rrRatio, riskPercent } as any,
          total_trades: result.total_trades,
          win_rate: result.win_rate,
          total_return: result.total_return,
          max_drawdown: result.max_drawdown,
          trades: result.trades as any,
        });
      }

      return result;
    },
  });
}

export function useBacktestHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['backtest-history', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backtest_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
