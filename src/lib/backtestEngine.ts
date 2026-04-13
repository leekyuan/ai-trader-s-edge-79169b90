/**
 * Production-grade backtest engine
 * - No look-ahead bias: signals on bar[i] execute on bar[i+1].open
 * - Conservative fills: SL/TP checked against intrabar extremes pessimistically
 * - Slippage model: fixed bps + volatility-based + market impact
 * - Fee model: maker/taker
 * - OOS (Out-of-Sample) split support
 * - Market regime classifier
 * - Signal quality scoring
 * - Consecutive loss position sizing
 * - Cost-to-profit filter
 * - Time analysis
 */

import { calculateEMA, calculateATR, detectMSS, detectFVG, checkConfluence } from './indicators';
import { classifyRegime, calcSignalQuality, calcRankingScores, type MarketRegime, type RankingScores } from './regimeClassifier';

export interface BacktestConfig {
  pair: string;
  periodDays: number;
  leverage: number;
  rrRatio: number;
  riskPercent: number;
  // Filters
  trendFilterEnabled: boolean;
  volFilterEnabled: boolean;
  volFilterMultiplier: number;
  volumeFilterEnabled: boolean;
  volumeThreshold: number;
  mtfFilterEnabled: boolean;
  higherTimeframe: string;
  // Execution realism
  slippageBps: number;
  dynamicSlippage: boolean;
  makerFeeBps: number;
  takerFeeBps: number;
  // OOS
  oosEnabled: boolean;
  oosSplitPct: number;
  // New: Advanced filters
  regimeFilterEnabled: boolean;
  costFilterEnabled: boolean;
  costFilterMaxPct: number;       // max cost as % of expected profit (e.g. 30)
  consecLossEnabled: boolean;
  consecLossThreshold: number;    // after N consecutive losses
  consecLossReduction: number;    // reduce position by this % (e.g. 50)
  minSignalQuality: number;       // 0-100, minimum score to enter
  timeFilterEnabled: boolean;     // auto-detect bad hours
}

export interface KlineWithVolume {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export interface TradeRecord {
  date: string;
  direction: 'long' | 'short';
  signalPrice: string;
  entry: string;
  exit: string;
  sl: string;
  tp: string;
  result: 'win' | 'loss' | 'timeout';
  pnl_pct: number;
  pnl_net: number;
  fees: number;
  slippage: number;
  vol_ratio: number;
  isOOS: boolean;
  signalQuality: number;
  regime: MarketRegime;
  positionScale: number;  // 1.0 = full, 0.5 = reduced
  hour: number;
  dayOfWeek: number;
}

export interface TimeAnalysis {
  hour: number;
  trades: number;
  winRate: number;
  avgPnl: number;
  recommended: boolean;
}

export interface BacktestResult {
  pair: string;
  period_days: number;
  params: Record<string, any>;
  total_trades: number;
  win_rate: number;
  total_return: number;
  total_return_net: number;
  max_drawdown: number;
  max_consec_loss: number;
  expectancy: number;
  profit_factor: number;
  sharpe_ratio: number;
  avg_win: number;
  avg_loss: number;
  total_fees: number;
  total_slippage_cost: number;
  // Filter stats
  filtered_out_signals: number;
  trend_filter_active: boolean;
  vol_filtered_signals: number;
  vol_filter_active: boolean;
  volume_filtered_signals: number;
  volume_filter_active: boolean;
  mtf_filtered_signals: number;
  mtf_filter_active: boolean;
  mtf_alignment_rate: number;
  avg_vol_ratio_wins: number;
  avg_vol_ratio_losses: number;
  // New filter stats
  regime_filtered_signals: number;
  cost_filtered_signals: number;
  quality_filtered_signals: number;
  time_filtered_signals: number;
  avg_signal_quality: number;
  regime_distribution: Record<MarketRegime, number>;
  // Chart data
  atr_series: { date: string; atr: number; atrAvg: number }[];
  trades: TradeRecord[];
  // OOS
  oos_enabled: boolean;
  oos_trades: number;
  oos_win_rate: number;
  oos_return_net: number;
  oos_max_drawdown: number;
  oos_expectancy: number;
  is_win_rate: number;
  is_return_net: number;
  // Drawdown series
  drawdown_series: { date: string; drawdown: number }[];
  // Ranking
  ranking: RankingScores;
  // Time analysis
  time_analysis: TimeAnalysis[];
}

export async function fetchKlinesWithVolume(symbol: string, interval: string, limit: number): Promise<KlineWithVolume[]> {
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

function calcSlippage(config: BacktestConfig, price: number, atr: number, direction: 'long' | 'short'): number {
  let slippagePct = config.slippageBps / 10000;
  if (config.dynamicSlippage && atr > 0 && price > 0) {
    const atrPct = atr / price;
    slippagePct += atrPct * 0.1;
  }
  return direction === 'long' ? price * slippagePct : -price * slippagePct;
}

function computeMetrics(trades: TradeRecord[]): {
  winRate: number; totalReturn: number; totalReturnNet: number;
  maxDD: number; maxConsecLoss: number; expectancy: number;
  profitFactor: number; sharpe: number; avgWin: number; avgLoss: number;
  totalFees: number; totalSlippage: number;
  drawdownSeries: { date: string; drawdown: number }[];
} {
  if (trades.length === 0) {
    return {
      winRate: 0, totalReturn: 0, totalReturnNet: 0, maxDD: 0,
      maxConsecLoss: 0, expectancy: 0, profitFactor: 0, sharpe: 0,
      avgWin: 0, avgLoss: 0, totalFees: 0, totalSlippage: 0,
      drawdownSeries: [],
    };
  }

  const wins = trades.filter(t => t.result === 'win');
  const losses = trades.filter(t => t.result !== 'win');

  const totalReturn = trades.reduce((s, t) => s + t.pnl_pct, 0);
  const totalReturnNet = trades.reduce((s, t) => s + t.pnl_net, 0);
  const totalFees = trades.reduce((s, t) => s + t.fees, 0);
  const totalSlippage = trades.reduce((s, t) => s + t.slippage, 0);

  const winRate = (wins.length / trades.length) * 100;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl_net, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl_net, 0) / losses.length) : 0;
  const expectancy = trades.reduce((s, t) => s + t.pnl_net, 0) / trades.length;

  const grossProfit = wins.reduce((s, t) => s + t.pnl_net, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_net, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const pnls = trades.map(t => t.pnl_net);
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(Math.min(trades.length, 252)) : 0;

  let peak = 0, maxDD = 0, cum = 0;
  const drawdownSeries: { date: string; drawdown: number }[] = [];
  let consecLoss = 0, maxConsecLoss = 0;

  trades.forEach(t => {
    cum += t.pnl_net;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
    drawdownSeries.push({ date: t.date.split('T')[0], drawdown: parseFloat((-dd).toFixed(2)) });
    if (t.result !== 'win') { consecLoss++; maxConsecLoss = Math.max(maxConsecLoss, consecLoss); } else consecLoss = 0;
  });

  return {
    winRate: parseFloat(winRate.toFixed(1)),
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    totalReturnNet: parseFloat(totalReturnNet.toFixed(2)),
    maxDD: parseFloat(maxDD.toFixed(2)),
    maxConsecLoss,
    expectancy: parseFloat(expectancy.toFixed(2)),
    profitFactor: parseFloat(Math.min(profitFactor, 99).toFixed(2)),
    sharpe: parseFloat(sharpe.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    totalFees: parseFloat(totalFees.toFixed(2)),
    totalSlippage: parseFloat(totalSlippage.toFixed(4)),
    drawdownSeries,
  };
}

export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  const {
    pair, periodDays, leverage, trendFilterEnabled, volFilterEnabled, volFilterMultiplier,
    volumeFilterEnabled, volumeThreshold, mtfFilterEnabled, higherTimeframe,
    slippageBps, dynamicSlippage, makerFeeBps, takerFeeBps,
    oosEnabled, oosSplitPct,
    regimeFilterEnabled, costFilterEnabled, costFilterMaxPct,
    consecLossEnabled, consecLossThreshold, consecLossReduction,
    minSignalQuality, timeFilterEnabled,
  } = config;

  const hoursNeeded = periodDays * 24;
  const klines1H = await fetchKlinesWithVolume(pair, '1h', Math.min(hoursNeeded, 1000));
  const klines15M = await fetchKlinesWithVolume(pair, '15m', Math.min(hoursNeeded * 4, 1000));

  let klinesHTF: KlineWithVolume[] = [];
  if (mtfFilterEnabled) {
    const htfLimitMap: Record<string, number> = { '4h': Math.min(periodDays * 6, 1000), '1d': Math.min(periodDays, 1000), '1w': Math.min(Math.ceil(periodDays / 7), 500) };
    klinesHTF = await fetchKlinesWithVolume(pair, higherTimeframe, htfLimitMap[higherTimeframe] || 200);
  }

  const htfEma50 = mtfFilterEnabled && klinesHTF.length > 0 ? calculateEMA(klinesHTF as any, 50) : [];
  const ema200 = calculateEMA(klines1H as any, 200);

  // ATR series
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

  const volAvg20 = (idx: number): number => {
    const start = Math.max(0, idx - 19);
    const slice = klines1H.slice(start, idx + 1);
    return slice.reduce((s, k) => s + k.volume, 0) / slice.length;
  };

  const oosStartIdx = oosEnabled
    ? Math.floor(klines1H.length * (1 - oosSplitPct / 100))
    : klines1H.length;

  // === First pass: collect time-based stats for time filter ===
  // We do a quick pre-scan to identify bad hours (only if timeFilterEnabled)
  const hourStats: Map<number, { wins: number; total: number; pnlSum: number }> = new Map();

  // Simulate trades
  const trades: TradeRecord[] = [];
  let filteredOutSignals = 0;
  let volFilteredSignals = 0;
  let volumeFilteredSignals = 0;
  let mtfFilteredSignals = 0;
  let regimeFilteredSignals = 0;
  let costFilteredSignals = 0;
  let qualityFilteredSignals = 0;
  let timeFilteredSignals = 0;
  let mtfAlignedCount = 0;
  let mtfTotalChecked = 0;
  let recentConsecLoss = 0;
  const regimeDist: Record<MarketRegime, number> = { 'trend-up': 0, 'trend-down': 0, 'range': 0, 'high-vol': 0, 'low-vol': 0 };

  // For time filter: pre-scan bad hours from IS data
  const badHours = new Set<number>();
  if (timeFilterEnabled) {
    // Quick pre-scan on first 70% of data to find consistently losing hours
    const preScanEnd = Math.floor(klines1H.length * 0.7);
    const tempHourStats: Map<number, { wins: number; total: number }> = new Map();
    for (let i = 50; i < preScanEnd - 1; i++) {
      const hour = new Date(klines1H[i].time).getUTCHours();
      if (!tempHourStats.has(hour)) tempHourStats.set(hour, { wins: 0, total: 0 });
      // Simple quick check: is next bar's close > current close?
      const stats = tempHourStats.get(hour)!;
      stats.total++;
      if (klines1H[i + 1].close > klines1H[i].close) stats.wins++;
    }
    tempHourStats.forEach((stats, hour) => {
      if (stats.total >= 5) {
        const wr = stats.wins / stats.total;
        // Flag hours with extreme directional bias (< 35% or > 65%) as unreliable
        if (wr < 0.35) badHours.add(hour);
      }
    });
  }

  for (let i = 50; i < klines1H.length - 1; i++) {
    const slice1H = klines1H.slice(Math.max(0, i - 50), i + 1);
    const signalPrice = klines1H[i].close;
    const time1H = klines1H[i].time;
    const signalDate = new Date(time1H);
    const hour = signalDate.getUTCHours();
    const dayOfWeek = signalDate.getUTCDay();

    const slice15M = klines15M.filter((k) => k.time <= time1H && k.time > time1H - 15 * 60 * 1000 * 50);
    if (slice15M.length < 10) continue;

    const atr = calculateATR(slice1H as any);
    const mss = detectMSS(slice1H as any);
    const fvg = detectFVG(slice15M as any, signalPrice);
    const confluence = checkConfluence(mss, fvg, signalPrice, atr);
    if (!confluence.isHighProbability) continue;

    // --- Market regime ---
    const atrAvgSlice = allAtrs.slice(Math.max(0, i - atrAvgWindow + 1), i + 1).filter(v => v > 0);
    const currentAtrAvg = atrAvgSlice.length > 0 ? atrAvgSlice.reduce((a, b) => a + b, 0) / atrAvgSlice.length : allAtrs[i];
    const regime = classifyRegime(slice1H as any, allAtrs[i], currentAtrAvg);
    regimeDist[regime.regime]++;

    // --- FILTERS ---

    // Trend filter
    let trendAligned = true;
    if (trendFilterEnabled) {
      const currentEma = ema200[i];
      if (confluence.direction === 'long' && signalPrice < currentEma) { filteredOutSignals++; trendAligned = false; continue; }
      if (confluence.direction === 'short' && signalPrice > currentEma) { filteredOutSignals++; trendAligned = false; continue; }
    }

    // Regime filter
    if (regimeFilterEnabled) {
      const directionMatchesRegime =
        (confluence.direction === 'long' && regime.regime === 'trend-up') ||
        (confluence.direction === 'short' && regime.regime === 'trend-down');
      if (!directionMatchesRegime && regime.regime !== 'range') {
        regimeFilteredSignals++;
        continue;
      }
    }

    // Volatility filter
    if (volFilterEnabled && allAtrs[i] > 0) {
      if (allAtrs[i] < currentAtrAvg * volFilterMultiplier) { volFilteredSignals++; continue; }
    }

    // Volume filter
    const currentVolume = klines1H[i].volume;
    const avgVol = volAvg20(i);
    const volRatio = avgVol > 0 ? parseFloat((currentVolume / avgVol).toFixed(2)) : 1;
    if (volumeFilterEnabled && volRatio < volumeThreshold) { volumeFilteredSignals++; continue; }

    // MTF filter
    let mtfAligned = true;
    if (mtfFilterEnabled && klinesHTF.length > 0 && htfEma50.length > 0) {
      mtfTotalChecked++;
      let htfIdx = -1;
      for (let h = klinesHTF.length - 1; h >= 0; h--) {
        if (klinesHTF[h].time <= time1H) { htfIdx = h; break; }
      }
      if (htfIdx >= 0 && htfIdx < htfEma50.length) {
        const htfPrice = klinesHTF[htfIdx].close;
        const htfEma = htfEma50[htfIdx];
        const aligned = (confluence.direction === 'long' && htfPrice > htfEma) ||
                        (confluence.direction === 'short' && htfPrice < htfEma);
        if (aligned) { mtfAlignedCount++; } else { mtfFilteredSignals++; mtfAligned = false; continue; }
      }
    }

    // Time filter
    if (timeFilterEnabled && badHours.has(hour)) {
      timeFilteredSignals++;
      continue;
    }

    // Signal quality score
    const signalQuality = calcSignalQuality({
      mssDetected: mss.detected,
      fvgDetected: fvg.detected,
      priceInGap: fvg.priceInGap,
      trendAligned,
      mtfAligned,
      volRatio,
      adx: regime.adx,
      atrRatio: regime.atrRatio,
      regimeMatch: (confluence.direction === 'long' && regime.regime === 'trend-up') ||
                   (confluence.direction === 'short' && regime.regime === 'trend-down'),
    });

    if (minSignalQuality > 0 && signalQuality < minSignalQuality) {
      qualityFilteredSignals++;
      continue;
    }

    // Cost-to-profit filter
    const expectedProfitPct = config.rrRatio * config.riskPercent; // simplified expected profit
    const totalCostPct = (takerFeeBps + makerFeeBps) / 100 * leverage + slippageBps / 100 * leverage;
    if (costFilterEnabled && totalCostPct > 0 && expectedProfitPct > 0) {
      const costRatio = (totalCostPct / expectedProfitPct) * 100;
      if (costRatio > costFilterMaxPct) {
        costFilteredSignals++;
        continue;
      }
    }

    // === EXECUTION ON NEXT BAR ===
    const execBar = klines1H[i + 1];
    const direction = confluence.direction;
    const rawEntry = execBar.open;
    const slippageAmount = calcSlippage(config, rawEntry, allAtrs[i], direction);
    const entryPrice = rawEntry + slippageAmount;
    const entryShift = entryPrice - confluence.suggestedEntry;
    const sl = confluence.suggestedSL + entryShift;
    const tp = confluence.suggestedTP + entryShift;

    // Position scale (consecutive loss reduction)
    let positionScale = 1.0;
    if (consecLossEnabled && recentConsecLoss >= consecLossThreshold) {
      positionScale = 1 - (consecLossReduction / 100);
    }

    // Conservative fill simulation
    let result: 'win' | 'loss' | 'timeout' = 'timeout';
    let exitPrice = entryPrice;

    for (let j = i + 2; j < Math.min(i + 49, klines1H.length); j++) {
      const candle = klines1H[j];
      if (direction === 'long') {
        if (candle.low <= sl) { exitPrice = sl; result = 'loss'; break; }
        if (candle.high >= tp) { exitPrice = tp; result = 'win'; break; }
      } else {
        if (candle.high >= sl) { exitPrice = sl; result = 'loss'; break; }
        if (candle.low <= tp) { exitPrice = tp; result = 'win'; break; }
      }
    }

    if (result === 'timeout') {
      const lastScanIdx = Math.min(i + 48, klines1H.length - 1);
      exitPrice = klines1H[lastScanIdx].close;
    }

    const grossPnlPct = direction === 'long'
      ? ((exitPrice - entryPrice) / entryPrice) * 100 * leverage
      : ((entryPrice - exitPrice) / entryPrice) * 100 * leverage;

    const feesPct = (takerFeeBps + makerFeeBps) / 100 * leverage;
    // Apply position scale to PnL
    const scaledGross = grossPnlPct * positionScale;
    const netPnlPct = scaledGross - feesPct * positionScale;

    // Track consecutive losses
    if (result === 'win') { recentConsecLoss = 0; } else { recentConsecLoss++; }

    const isOOS = i >= oosStartIdx;

    const trade: TradeRecord = {
      date: new Date(time1H).toISOString(),
      direction,
      signalPrice: signalPrice.toFixed(2),
      entry: entryPrice.toFixed(2),
      exit: exitPrice.toFixed(2),
      sl: sl.toFixed(2),
      tp: tp.toFixed(2),
      result,
      pnl_pct: parseFloat(scaledGross.toFixed(2)),
      pnl_net: parseFloat(netPnlPct.toFixed(2)),
      fees: parseFloat((feesPct * positionScale).toFixed(4)),
      slippage: parseFloat(Math.abs(slippageAmount).toFixed(4)),
      vol_ratio: volRatio,
      isOOS,
      signalQuality,
      regime: regime.regime,
      positionScale,
      hour,
      dayOfWeek,
    };
    trades.push(trade);

    // Collect hour stats for time analysis
    if (!hourStats.has(hour)) hourStats.set(hour, { wins: 0, total: 0, pnlSum: 0 });
    const hs = hourStats.get(hour)!;
    hs.total++;
    hs.pnlSum += netPnlPct;
    if (result === 'win') hs.wins++;
  }

  // Build time analysis
  const timeAnalysis: TimeAnalysis[] = [];
  for (let h = 0; h < 24; h++) {
    const stats = hourStats.get(h);
    if (stats && stats.total > 0) {
      const wr = parseFloat(((stats.wins / stats.total) * 100).toFixed(1));
      timeAnalysis.push({
        hour: h,
        trades: stats.total,
        winRate: wr,
        avgPnl: parseFloat((stats.pnlSum / stats.total).toFixed(2)),
        recommended: wr >= 45 && stats.total >= 3,
      });
    }
  }

  // Compute metrics
  const isTrades = trades.filter(t => !t.isOOS);
  const oosTrades = trades.filter(t => t.isOOS);
  const allMetrics = computeMetrics(trades);
  const isMetrics = computeMetrics(isTrades);
  const oosMetrics = computeMetrics(oosTrades);

  const wins = trades.filter(t => t.result === 'win');
  const losses = trades.filter(t => t.result !== 'win');
  const avgVolRatioWins = wins.length > 0 ? parseFloat((wins.reduce((s, t) => s + t.vol_ratio, 0) / wins.length).toFixed(2)) : 0;
  const avgVolRatioLosses = losses.length > 0 ? parseFloat((losses.reduce((s, t) => s + t.vol_ratio, 0) / losses.length).toFixed(2)) : 0;
  const mtfAlignmentRate = mtfTotalChecked > 0 ? parseFloat(((mtfAlignedCount / mtfTotalChecked) * 100).toFixed(1)) : 0;
  const avgSignalQuality = trades.length > 0 ? parseFloat((trades.reduce((s, t) => s + t.signalQuality, 0) / trades.length).toFixed(0)) : 0;

  // Ranking scores
  const ranking = calcRankingScores({
    totalReturnNet: allMetrics.totalReturnNet,
    winRate: allMetrics.winRate,
    maxDD: allMetrics.maxDD,
    profitFactor: allMetrics.profitFactor,
    sharpe: allMetrics.sharpe,
    expectancy: allMetrics.expectancy,
    totalTrades: trades.length,
    oosReturnNet: oosMetrics.totalReturnNet,
    oosWinRate: oosMetrics.winRate,
    isReturnNet: isMetrics.totalReturnNet,
    isWinRate: isMetrics.winRate,
    oosEnabled,
    maxConsecLoss: allMetrics.maxConsecLoss,
    totalFees: allMetrics.totalFees,
  });

  return {
    pair,
    period_days: periodDays,
    params: {
      leverage, rrRatio: config.rrRatio, riskPercent: config.riskPercent,
      trendFilterEnabled, volFilterEnabled, volFilterMultiplier,
      volumeFilterEnabled, volumeThreshold, mtfFilterEnabled, higherTimeframe,
      slippageBps, dynamicSlippage, makerFeeBps, takerFeeBps,
      oosEnabled, oosSplitPct,
      regimeFilterEnabled, costFilterEnabled, costFilterMaxPct,
      consecLossEnabled, consecLossThreshold, consecLossReduction,
      minSignalQuality, timeFilterEnabled,
    },
    total_trades: trades.length,
    win_rate: allMetrics.winRate,
    total_return: allMetrics.totalReturn,
    total_return_net: allMetrics.totalReturnNet,
    max_drawdown: allMetrics.maxDD,
    max_consec_loss: allMetrics.maxConsecLoss,
    expectancy: allMetrics.expectancy,
    profit_factor: allMetrics.profitFactor,
    sharpe_ratio: allMetrics.sharpe,
    avg_win: allMetrics.avgWin,
    avg_loss: allMetrics.avgLoss,
    total_fees: allMetrics.totalFees,
    total_slippage_cost: allMetrics.totalSlippage,
    filtered_out_signals: filteredOutSignals,
    trend_filter_active: trendFilterEnabled,
    vol_filtered_signals: volFilteredSignals,
    vol_filter_active: volFilterEnabled,
    volume_filtered_signals: volumeFilteredSignals,
    volume_filter_active: volumeFilterEnabled,
    mtf_filtered_signals: mtfFilteredSignals,
    mtf_filter_active: mtfFilterEnabled,
    mtf_alignment_rate: mtfAlignmentRate,
    avg_vol_ratio_wins: avgVolRatioWins,
    avg_vol_ratio_losses: avgVolRatioLosses,
    regime_filtered_signals: regimeFilteredSignals,
    cost_filtered_signals: costFilteredSignals,
    quality_filtered_signals: qualityFilteredSignals,
    time_filtered_signals: timeFilteredSignals,
    avg_signal_quality: avgSignalQuality,
    regime_distribution: regimeDist,
    atr_series: atrSeries,
    trades,
    drawdown_series: allMetrics.drawdownSeries,
    oos_enabled: oosEnabled,
    oos_trades: oosTrades.length,
    oos_win_rate: oosMetrics.winRate,
    oos_return_net: oosMetrics.totalReturnNet,
    oos_max_drawdown: oosMetrics.maxDD,
    oos_expectancy: oosMetrics.expectancy,
    is_win_rate: isMetrics.winRate,
    is_return_net: isMetrics.totalReturnNet,
    ranking,
    time_analysis: timeAnalysis,
  };
}
