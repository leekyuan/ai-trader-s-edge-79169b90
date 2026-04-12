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
  volumeFilterEnabled: boolean;
  volumeThreshold: number;
  mtfFilterEnabled: boolean;
  higherTimeframe: string;
}

interface KlineWithVolume {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

async function fetchKlinesWithVolume(symbol: string, interval: string, limit: number): Promise<KlineWithVolume[]> {
  const pair = `${symbol.toUpperCase()}USDT`;
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.map((k: any) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    time: k[0],
  }));
}

export function useRunBacktest() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: BacktestParams) => {
      const {
        pair, periodDays, leverage, rrRatio, riskPercent,
        trendFilterEnabled, volFilterEnabled, volFilterMultiplier,
        volumeFilterEnabled, volumeThreshold,
        mtfFilterEnabled, higherTimeframe,
      } = params;

      const hoursNeeded = periodDays * 24;
      const klines1H = await fetchKlinesWithVolume(pair, '1h', Math.min(hoursNeeded, 1000));
      const klines15M = await fetchKlinesWithVolume(pair, '15m', Math.min(hoursNeeded * 4, 1000));

      // Fetch higher timeframe data for MTF filter
      let klinesHTF: KlineWithVolume[] = [];
      if (mtfFilterEnabled) {
        const htfLimitMap: Record<string, number> = { '4h': Math.min(periodDays * 6, 1000), '1d': Math.min(periodDays, 1000), '1w': Math.min(Math.ceil(periodDays / 7), 500) };
        klinesHTF = await fetchKlinesWithVolume(pair, higherTimeframe, htfLimitMap[higherTimeframe] || 200);
      }

      // Pre-compute EMA50 on higher timeframe
      const htfEma50 = mtfFilterEnabled && klinesHTF.length > 0 ? calculateEMA(klinesHTF as any, 50) : [];

      // Calculate 200 EMA on 1H candles
      const ema200 = calculateEMA(klines1H as any, 200);

      // Pre-compute all ATR values
      const atrWindow = 14;
      const atrAvgWindow = 20;
      const allAtrs: number[] = [0];
      for (let i = 1; i < klines1H.length; i++) {
        if (i < atrWindow) { allAtrs.push(0); continue; }
        const slice = [];
        for (let j = Math.max(1, i - atrWindow + 1); j <= i; j++) {
          const p2 = klines1H[j - 1]; const c2 = klines1H[j];
          slice.push(Math.max(c2.high - c2.low, Math.abs(c2.high - p2.close), Math.abs(c2.low - p2.close)));
        }
        allAtrs.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      }

      // Build ATR series
      const atrSeries: { date: string; atr: number; atrAvg: number }[] = [];
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

      // Pre-compute 20-period average volume for 1H
      const volAvg20 = (idx: number): number => {
        const start = Math.max(0, idx - 19);
        const slice = klines1H.slice(start, idx + 1);
        return slice.reduce((s, k) => s + k.volume, 0) / slice.length;
      };

      // Simulate trades
      const trades: any[] = [];
      let filteredOutSignals = 0;
      let volFilteredSignals = 0;
      let volumeFilteredSignals = 0;
      let mtfFilteredSignals = 0;
      let mtfAlignedCount = 0;
      let mtfTotalChecked = 0;

      for (let i = 50; i < klines1H.length; i++) {
        const slice1H = klines1H.slice(Math.max(0, i - 50), i + 1);
        const currentPrice = klines1H[i].close;

        const time1H = klines1H[i].time;
        const slice15M = klines15M.filter((k) => k.time <= time1H && k.time > time1H - 15 * 60 * 1000 * 50);
        if (slice15M.length < 10) continue;

        const atr = calculateATR(slice1H as any);
        const mss = detectMSS(slice1H as any);
        const fvg = detectFVG(slice15M as any, currentPrice);
        const confluence = checkConfluence(mss, fvg, currentPrice, atr);
        if (!confluence.isHighProbability) continue;

        // Trend filter
        if (trendFilterEnabled) {
          const currentEma = ema200[i];
          if (confluence.direction === 'long' && currentPrice < currentEma) { filteredOutSignals++; continue; }
          if (confluence.direction === 'short' && currentPrice > currentEma) { filteredOutSignals++; continue; }
        }

        // Volatility filter
        if (volFilterEnabled && allAtrs[i] > 0) {
          const avgSlice = allAtrs.slice(Math.max(0, i - atrAvgWindow + 1), i + 1).filter(v => v > 0);
          const atrAvg = avgSlice.length > 0 ? avgSlice.reduce((a, b) => a + b, 0) / avgSlice.length : allAtrs[i];
          if (allAtrs[i] < atrAvg * volFilterMultiplier) { volFilteredSignals++; continue; }
        }

        // Volume confirmation filter
        const currentVolume = klines1H[i].volume;
        const avgVol = volAvg20(i);
        const volRatio = avgVol > 0 ? parseFloat((currentVolume / avgVol).toFixed(2)) : 1;

        if (volumeFilterEnabled) {
          if (volRatio < volumeThreshold) { volumeFilteredSignals++; continue; }
        }

        // Multi-timeframe filter
        if (mtfFilterEnabled && klinesHTF.length > 0 && htfEma50.length > 0) {
          mtfTotalChecked++;
          // Find the most recent HTF candle at or before this 1H candle time
          let htfIdx = -1;
          for (let h = klinesHTF.length - 1; h >= 0; h--) {
            if (klinesHTF[h].time <= time1H) { htfIdx = h; break; }
          }
          if (htfIdx >= 0 && htfIdx < htfEma50.length) {
            const htfPrice = klinesHTF[htfIdx].close;
            const htfEma = htfEma50[htfIdx];
            const htfBullish = htfPrice > htfEma;
            const htfBearish = htfPrice < htfEma;
            const aligned = (confluence.direction === 'long' && htfBullish) || (confluence.direction === 'short' && htfBearish);
            if (aligned) {
              mtfAlignedCount++;
            } else {
              mtfFilteredSignals++;
              continue;
            }
          }
        }

        const direction = confluence.direction;
        const entry = confluence.suggestedEntry;
        const sl = confluence.suggestedSL;
        const tp = confluence.suggestedTP;

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
          vol_ratio: volRatio,
        });
      }

      const wins = trades.filter(t => t.result === 'win');
      const losses = trades.filter(t => t.result === 'loss');
      const totalReturn = trades.reduce((s, t) => s + t.pnl_pct, 0);

      // Volume ratio stats
      const avgVolRatioWins = wins.length > 0 ? parseFloat((wins.reduce((s: number, t: any) => s + t.vol_ratio, 0) / wins.length).toFixed(2)) : 0;
      const avgVolRatioLosses = losses.length > 0 ? parseFloat((losses.reduce((s: number, t: any) => s + t.vol_ratio, 0) / losses.length).toFixed(2)) : 0;

      let peak = 0, mdd = 0, cum = 0;
      trades.forEach(t => { cum += t.pnl_pct; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > mdd) mdd = dd; });

      let maxConsecLoss = 0, consecLoss = 0;
      trades.forEach(t => { if (t.result === 'loss') { consecLoss++; maxConsecLoss = Math.max(maxConsecLoss, consecLoss); } else consecLoss = 0; });

      const mtfAlignmentRate = mtfTotalChecked > 0 ? parseFloat(((mtfAlignedCount / mtfTotalChecked) * 100).toFixed(1)) : 0;

      const result = {
        pair,
        period_days: periodDays,
        params: { leverage, rrRatio, riskPercent, trendFilterEnabled, volFilterEnabled, volFilterMultiplier, volumeFilterEnabled, volumeThreshold, mtfFilterEnabled, higherTimeframe },
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
        volume_filtered_signals: volumeFilteredSignals,
        volume_filter_active: volumeFilterEnabled,
        avg_vol_ratio_wins: avgVolRatioWins,
        avg_vol_ratio_losses: avgVolRatioLosses,
        mtf_filtered_signals: mtfFilteredSignals,
        mtf_filter_active: mtfFilterEnabled,
        mtf_alignment_rate: mtfAlignmentRate,
      };

      if (user) {
        await supabase.from('backtest_results').insert({
          user_id: user.id, pair, period_days: periodDays,
          params: result.params as any,
          total_trades: result.total_trades, win_rate: result.win_rate,
          total_return: result.total_return, max_drawdown: result.max_drawdown,
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
      const { data, error } = await supabase.from('backtest_results').select('*').order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
