import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { calculateATR, calculateEMA, detectMSS, detectFVG, checkConfluence } from '@/lib/indicators';

interface BacktestParams {
  pair: string;
  periodDays: number;
  leverage: number;
  rrRatio: number;
  riskPercent: number;
  trendFilterEnabled: boolean;
  volFilterEnabled: boolean;
  volFilterMultiplier: number;
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
      const { pair, periodDays, leverage, rrRatio, riskPercent, trendFilterEnabled, volFilterEnabled, volFilterMultiplier } = params;

      // Fetch historical klines
      const hoursNeeded = periodDays * 24;
      const klines1H = await fetchKlines(pair, '1h', Math.min(hoursNeeded, 1000));
      const klines15M = await fetchKlines(pair, '15m', Math.min(hoursNeeded * 4, 1000));

      // Calculate 200 EMA on 1H candles
      const ema200 = calculateEMA(klines1H, 200);

      // Calculate ATR series for volatility filter & chart
      const atrSeries: { date: string; atr: number; atrAvg: number }[] = [];
      const atrWindow = 14;
      const atrAvgWindow = 20;
      // Pre-compute all ATR values
      const allAtrs: number[] = [];
      for (let i = 1; i < klines1H.length; i++) {
        const prev = klines1H[i - 1];
        const curr = klines1H[i];
        const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
        if (i < atrWindow) { allAtrs.push(0); continue; }
        const slice = [];
        for (let j = Math.max(1, i - atrWindow + 1); j <= i; j++) {
          const p2 = klines1H[j - 1]; const c2 = klines1H[j];
          slice.push(Math.max(c2.high - c2.low, Math.abs(c2.high - p2.close), Math.abs(c2.low - p2.close)));
        }
        allAtrs.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }
      // Insert a 0 at index 0 to align with klines1H indices
      allAtrs.unshift(0);

      // Build ATR series with rolling average
      for (let i = atrWindow; i < klines1H.length; i++) {
        const currentAtr = allAtrs[i];
        const avgSlice = allAtrs.slice(Math.max(0, i - atrAvgWindow + 1), i + 1).filter(v => v > 0);
        const atrAvg = avgSlice.length > 0 ? avgSlice.reduce((a, b) => a + b, 0) / avgSlice.length : currentAtr;
        atrSeries.push({
          date: new Date(klines1H[i].time).toISOString().split('T')[0],
          atr: parseFloat(currentAtr.toFixed(2)),
          atrAvg: parseFloat((atrAvg * volFilterMultiplier).toFixed(2)),
        });
      }

      // Simulate trades
      const trades: any[] = [];
      let filteredOutSignals = 0;
      let volFilteredSignals = 0;
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

        // Trend filter: check 200 EMA
        if (trendFilterEnabled) {
          const currentEma = ema200[i];
          if (confluence.direction === 'long' && currentPrice < currentEma) {
            filteredOutSignals++;
            continue;
          }
          if (confluence.direction === 'short' && currentPrice > currentEma) {
            filteredOutSignals++;
            continue;
          }
        }

        // Volatility filter
        if (volFilterEnabled && allAtrs[i] > 0) {
          const avgSlice = allAtrs.slice(Math.max(0, i - atrAvgWindow + 1), i + 1).filter(v => v > 0);
          const atrAvg = avgSlice.length > 0 ? avgSlice.reduce((a, b) => a + b, 0) / avgSlice.length : allAtrs[i];
          if (allAtrs[i] < atrAvg * volFilterMultiplier) {
            volFilteredSignals++;
            continue;
          }
        }

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
        params: { leverage, rrRatio, riskPercent, trendFilterEnabled, volFilterEnabled, volFilterMultiplier },
        total_trades: trades.length,
        win_rate: trades.length > 0 ? parseFloat(((wins.length / trades.length) * 100).toFixed(1)) : 0,
        total_return: parseFloat(totalReturn.toFixed(2)),
        max_drawdown: parseFloat(mdd.toFixed(2)),
        trades,
        max_consec_loss: maxConsecLoss,
        filtered_out_signals: filteredOutSignals,
        trend_filter_active: trendFilterEnabled,
        vol_filtered_signals: volFilteredSignals,
        vol_filter_active: volFilterEnabled,
        atr_series: atrSeries,
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
