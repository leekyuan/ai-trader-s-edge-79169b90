/**
 * Market Regime Classifier
 * Classifies market into: trend-up, trend-down, range, high-vol, low-vol
 * Uses ADX-like directional movement + ATR relative to average
 */

export type MarketRegime = 'trend-up' | 'trend-down' | 'range' | 'high-vol' | 'low-vol';

export interface RegimeResult {
  regime: MarketRegime;
  adx: number;          // 0-100 trend strength
  atrRatio: number;     // current ATR / avg ATR
  trendAllowed: boolean; // whether trend-following strategies should enter
}

interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

/**
 * Simplified ADX calculation (14-period)
 */
function calculateADX(bars: Bar[], period = 14): number {
  if (bars.length < period * 2) return 0;

  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevHigh = bars[i - 1].high;
    const prevLow = bars[i - 1].low;
    const prevClose = bars[i - 1].close;

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  if (tr.length < period) return 0;

  // Smoothed averages (Wilder's smoothing)
  let atrSmooth = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let dmPlusSmooth = dmPlus.slice(0, period).reduce((a, b) => a + b, 0);
  let dmMinusSmooth = dmMinus.slice(0, period).reduce((a, b) => a + b, 0);

  const dx: number[] = [];

  for (let i = period; i < tr.length; i++) {
    atrSmooth = atrSmooth - atrSmooth / period + tr[i];
    dmPlusSmooth = dmPlusSmooth - dmPlusSmooth / period + dmPlus[i];
    dmMinusSmooth = dmMinusSmooth - dmMinusSmooth / period + dmMinus[i];

    const diPlus = atrSmooth > 0 ? (dmPlusSmooth / atrSmooth) * 100 : 0;
    const diMinus = atrSmooth > 0 ? (dmMinusSmooth / atrSmooth) * 100 : 0;
    const diSum = diPlus + diMinus;
    dx.push(diSum > 0 ? (Math.abs(diPlus - diMinus) / diSum) * 100 : 0);
  }

  if (dx.length < period) return dx.length > 0 ? dx[dx.length - 1] : 0;

  // ADX = smoothed average of DX
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }

  return adx;
}

/**
 * Classify the current market regime given recent bars
 */
export function classifyRegime(bars: Bar[], atrCurrent: number, atrAvg: number): RegimeResult {
  const adx = calculateADX(bars);
  const atrRatio = atrAvg > 0 ? atrCurrent / atrAvg : 1;

  // Determine last N bars trend direction via simple slope
  const recent = bars.slice(-20);
  const firstHalf = recent.slice(0, 10);
  const secondHalf = recent.slice(10);
  const avgFirst = firstHalf.reduce((s, b) => s + b.close, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, b) => s + b.close, 0) / secondHalf.length;
  const trendUp = avgSecond > avgFirst;

  let regime: MarketRegime;

  if (atrRatio > 1.8) {
    regime = 'high-vol';
  } else if (atrRatio < 0.5) {
    regime = 'low-vol';
  } else if (adx >= 25) {
    regime = trendUp ? 'trend-up' : 'trend-down';
  } else {
    regime = 'range';
  }

  // Trend-following strategies work in trend regimes
  const trendAllowed = regime === 'trend-up' || regime === 'trend-down';

  return { regime, adx: parseFloat(adx.toFixed(1)), atrRatio: parseFloat(atrRatio.toFixed(2)), trendAllowed };
}

/**
 * Signal Quality Score (0-100)
 * Combines multiple confluence factors
 */
export function calcSignalQuality(params: {
  mssDetected: boolean;
  fvgDetected: boolean;
  priceInGap: boolean;
  trendAligned: boolean;  // price vs 200 EMA
  mtfAligned: boolean;
  volRatio: number;       // volume / avg volume
  adx: number;
  atrRatio: number;
  regimeMatch: boolean;   // strategy matches current regime
}): number {
  let score = 0;

  // Core signal (max 30)
  if (params.mssDetected) score += 15;
  if (params.fvgDetected && params.priceInGap) score += 15;

  // Trend alignment (max 20)
  if (params.trendAligned) score += 10;
  if (params.mtfAligned) score += 10;

  // Volume confirmation (max 15)
  if (params.volRatio >= 1.5) score += 15;
  else if (params.volRatio >= 1.2) score += 8;

  // Trend strength via ADX (max 15)
  if (params.adx >= 30) score += 15;
  else if (params.adx >= 25) score += 10;
  else if (params.adx >= 20) score += 5;

  // Regime match (max 10)
  if (params.regimeMatch) score += 10;

  // Volatility sweet spot (max 10) - not too low, not too high
  if (params.atrRatio >= 0.8 && params.atrRatio <= 1.5) score += 10;
  else if (params.atrRatio >= 0.5 && params.atrRatio <= 2.0) score += 5;

  return Math.min(100, score);
}

/**
 * Composite Ranking Scores for strategy evaluation
 */
export interface RankingScores {
  returnScore: number;     // 0-100 return-focused
  stabilityScore: number;  // 0-100 stability-focused
  practicalScore: number;  // 0-100 real-trading fitness
}

export function calcRankingScores(metrics: {
  totalReturnNet: number;
  winRate: number;
  maxDD: number;
  profitFactor: number;
  sharpe: number;
  expectancy: number;
  totalTrades: number;
  oosReturnNet: number;
  oosWinRate: number;
  isReturnNet: number;
  isWinRate: number;
  oosEnabled: boolean;
  maxConsecLoss: number;
  totalFees: number;
}): RankingScores {
  const m = metrics;

  // === Return Score (수익률 중심) ===
  // Weights: return 40%, expectancy 25%, PF 20%, win rate 15%
  const returnNorm = Math.min(Math.max(m.totalReturnNet, -50), 100) / 100; // -50~100 → -0.5~1
  const expectNorm = Math.min(Math.max(m.expectancy, -5), 10) / 10;
  const pfNorm = Math.min(m.profitFactor, 5) / 5;
  const wrNorm = m.winRate / 100;
  const returnScore = Math.max(0, Math.min(100,
    (returnNorm * 40 + expectNorm * 25 + pfNorm * 20 + wrNorm * 15) + 25 // shift to 0-100
  ));

  // === Stability Score (안정성 중심) ===
  // Weights: MDD 30%, Sharpe 25%, max consec loss 20%, OOS consistency 25%
  const mddNorm = 1 - Math.min(m.maxDD, 50) / 50; // lower is better
  const sharpeNorm = Math.min(Math.max(m.sharpe, -1), 3) / 3;
  const consecNorm = 1 - Math.min(m.maxConsecLoss, 10) / 10;
  let oosConsistency = 0.5; // default if OOS not enabled
  if (m.oosEnabled && m.oosWinRate > 0) {
    const wrDiff = Math.abs(m.oosWinRate - m.isWinRate);
    oosConsistency = 1 - Math.min(wrDiff, 30) / 30;
  }
  const stabilityScore = Math.max(0, Math.min(100,
    (mddNorm * 30 + sharpeNorm * 25 + consecNorm * 20 + oosConsistency * 25) * 100
  ));

  // === Practical Score (실전 적합도) ===
  // Combines: net return after costs 25%, OOS performance 25%, trade count sufficiency 15%,
  // MDD 15%, expectancy 10%, fee drag 10%
  const tradeCountNorm = Math.min(m.totalTrades, 50) / 50; // need enough trades
  const feeDragNorm = 1 - Math.min(m.totalFees, 20) / 20;
  let oosReturnNorm = 0.5;
  if (m.oosEnabled) {
    oosReturnNorm = Math.min(Math.max(m.oosReturnNet, -20), 50) / 50 + 0.4;
  }
  const practicalScore = Math.max(0, Math.min(100,
    (returnNorm * 0.25 + oosReturnNorm * 0.25 + tradeCountNorm * 0.15 +
     mddNorm * 0.15 + expectNorm * 0.1 + feeDragNorm * 0.1) * 100
  ));

  return {
    returnScore: parseFloat(returnScore.toFixed(0)),
    stabilityScore: parseFloat(stabilityScore.toFixed(0)),
    practicalScore: parseFloat(practicalScore.toFixed(0)),
  };
}
