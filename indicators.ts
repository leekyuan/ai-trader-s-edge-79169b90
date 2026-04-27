// ============================================================
// INDICATOR ENGINE — 모든 기술적 지표 계산 모듈
// ============================================================
 
export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
 
export interface Signal {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  strength: number; // 1~5
  entry1: number;
  entry2: number;
  tp1: number;
  tp2: number;
  sl1: number;
  sl2: number;
  rrRatio: number;
  reasons: string[];
  indicators: IndicatorSnapshot;
  timestamp: number;
  status: 'ACTIVE' | 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT' | 'EXPIRED';
}
 
export interface IndicatorSnapshot {
  rsi: number;
  ema20: number;
  ema50: number;
  ema200: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbWidth: number;
  atr: number;
  volume: number;
  volumeAvg: number;
  price: number;
}
 
// ── RSI ───────────────────────────────────────────────────
export function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
 
// ── EMA ───────────────────────────────────────────────────
export function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}
 
export function calcEMAArray(closes: number[], period: number): number[] {
  if (closes.length < period) return closes.map(() => closes[closes.length - 1]);
  const k = 2 / (period + 1);
  const result: number[] = new Array(closes.length).fill(0);
  result[period - 1] = closes.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < closes.length; i++) {
    result[i] = closes[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}
 
// ── MACD ──────────────────────────────────────────────────
export function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMAArray(closes, fast);
  const emaSlow = calcEMAArray(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const validMacd = macdLine.slice(slow - 1);
  const signalLine = calcEMAArray(validMacd, signal);
  const lastIdx = signalLine.length - 1;
  const macdVal = validMacd[validMacd.length - 1];
  const sigVal = signalLine[lastIdx];
  return {
    macdLine: macdVal,
    macdSignal: sigVal,
    macdHist: macdVal - sigVal,
  };
}
 
// ── 볼린저 밴드 ────────────────────────────────────────────
export function calcBB(closes: number[], period = 20, mult = 2) {
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return {
    bbUpper: mean + mult * std,
    bbMiddle: mean,
    bbLower: mean - mult * std,
    bbWidth: (mult * 2 * std) / mean,
  };
}
 
// ── ATR ───────────────────────────────────────────────────
export function calcATR(candles: OHLCV[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b) / slice.length;
}
 
// ── 볼륨 분석 ─────────────────────────────────────────────
export function calcVolumeAvg(candles: OHLCV[], period = 20): number {
  const slice = candles.slice(-period);
  return slice.reduce((a, b) => a + b.volume, 0) / slice.length;
}
 
// ── 전체 스냅샷 계산 ───────────────────────────────────────
export function calcIndicators(candles: OHLCV[]): IndicatorSnapshot {
  const closes = candles.map(c => c.close);
  const price = closes[closes.length - 1];
  const { macdLine, macdSignal, macdHist } = calcMACD(closes);
  const { bbUpper, bbMiddle, bbLower, bbWidth } = calcBB(closes);
  return {
    rsi: calcRSI(closes),
    ema20: calcEMA(closes, 20),
    ema50: calcEMA(closes, 50),
    ema200: calcEMA(closes, 200),
    macdLine,
    macdSignal,
    macdHist,
    bbUpper,
    bbMiddle,
    bbLower,
    bbWidth,
    atr: calcATR(candles),
    volume: candles[candles.length - 1].volume,
    volumeAvg: calcVolumeAvg(candles),
    price,
  };
}
 
// ── 신호 엔진 (핵심) ────────────────────────────────────────
export function generateSignal(
  symbol: string,
  candles: OHLCV[],
  ind: IndicatorSnapshot
): Signal | null {
  const { price, rsi, ema20, ema50, ema200, macdHist, macdLine, macdSignal,
    bbUpper, bbLower, bbMiddle, bbWidth, atr, volume, volumeAvg } = ind;
 
  const longReasons: string[] = [];
  const shortReasons: string[] = [];
  let longScore = 0;
  let shortScore = 0;
 
  // ① RSI
  if (rsi < 35) { longReasons.push(`RSI 과매도 (${rsi.toFixed(1)})`); longScore += 2; }
  else if (rsi < 45) { longReasons.push(`RSI 중립↓ (${rsi.toFixed(1)})`); longScore += 1; }
  if (rsi > 65) { shortReasons.push(`RSI 과매수 (${rsi.toFixed(1)})`); shortScore += 2; }
  else if (rsi > 55) { shortReasons.push(`RSI 중립↑ (${rsi.toFixed(1)})`); shortScore += 1; }
 
  // ② EMA 배열
  if (price > ema20 && ema20 > ema50) { longReasons.push('EMA20 > EMA50 상승 배열'); longScore += 1; }
  if (price > ema200) { longReasons.push('200EMA 위 중장기 상승'); longScore += 1; }
  if (price < ema20 && ema20 < ema50) { shortReasons.push('EMA20 < EMA50 하락 배열'); shortScore += 1; }
  if (price < ema200) { shortReasons.push('200EMA 아래 중장기 하락'); shortScore += 1; }
 
  // ③ MACD
  if (macdHist > 0 && macdLine > macdSignal) { longReasons.push('MACD 골든크로스'); longScore += 2; }
  else if (macdHist > 0) { longReasons.push('MACD 히스토그램 양전'); longScore += 1; }
  if (macdHist < 0 && macdLine < macdSignal) { shortReasons.push('MACD 데드크로스'); shortScore += 2; }
  else if (macdHist < 0) { shortReasons.push('MACD 히스토그램 음전'); shortScore += 1; }
 
  // ④ 볼린저 밴드
  if (price <= bbLower * 1.005) { longReasons.push('볼린저 하단 터치 (반등 대기)'); longScore += 2; }
  if (price >= bbUpper * 0.995) { shortReasons.push('볼린저 상단 터치 (되돌림 대기)'); shortScore += 2; }
  if (bbWidth < 0.03) {
    longReasons.push('BB 스퀴즈 → 상방 돌파 대기');
    shortReasons.push('BB 스퀴즈 → 하방 돌파 대기');
  }
 
  // ⑤ 볼륨 확인
  if (volume > volumeAvg * 1.5) {
    longReasons.push('거래량 급증 (평균 1.5x)');
    shortReasons.push('거래량 급증 (평균 1.5x)');
    longScore += 1; shortScore += 1;
  }
 
  // ⑥ EMA50 지지/저항 반등
  const ema50Dist = Math.abs(price - ema50) / ema50;
  if (ema50Dist < 0.003 && price > ema50) { longReasons.push('EMA50 지지 근접 확인'); longScore += 1; }
  if (ema50Dist < 0.003 && price < ema50) { shortReasons.push('EMA50 저항 근접 확인'); shortScore += 1; }
 
  // 신호 발생 임계값: longScore 또는 shortScore ≥ 4
  const MIN_SCORE = 4;
 
  let direction: 'LONG' | 'SHORT' | null = null;
  let score = 0;
  let reasons: string[] = [];
 
  if (longScore >= MIN_SCORE && longScore >= shortScore) {
    direction = 'LONG';
    score = longScore;
    reasons = longReasons;
  } else if (shortScore >= MIN_SCORE && shortScore > longScore) {
    direction = 'SHORT';
    score = shortScore;
    reasons = shortReasons;
  }
 
  if (!direction) return null;
 
  // ── 진입/목표/손절 계산 (ATR 기반) ─────────────────────
  const atrMult1 = 1.0;
  const atrMult2 = 1.8;
  const tpMult1 = 2.0;
  const tpMult2 = 3.5;
 
  let entry1: number, entry2: number, tp1: number, tp2: number, sl1: number, sl2: number;
 
  if (direction === 'LONG') {
    entry1 = price - atr * 0.3;
    entry2 = price - atr * atrMult1;
    sl1 = entry1 - atr * atrMult2;
    sl2 = entry1 - atr * (atrMult2 + 0.5);
    tp1 = entry1 + atr * tpMult1;
    tp2 = entry1 + atr * tpMult2;
  } else {
    entry1 = price + atr * 0.3;
    entry2 = price + atr * atrMult1;
    sl1 = entry1 + atr * atrMult2;
    sl2 = entry1 + atr * (atrMult2 + 0.5);
    tp1 = entry1 - atr * tpMult1;
    tp2 = entry1 - atr * tpMult2;
  }
 
  const risk = Math.abs(entry1 - sl1);
  const reward = Math.abs(tp2 - entry1);
  const rrRatio = risk > 0 ? +(reward / risk).toFixed(2) : 0;
 
  const strength = Math.min(5, Math.floor(score / 2)) as 1 | 2 | 3 | 4 | 5;
 
  return {
    id: `${symbol}-${direction}-${Date.now()}`,
    symbol,
    direction,
    strength,
    entry1: +entry1.toFixed(2),
    entry2: +entry2.toFixed(2),
    tp1: +tp1.toFixed(2),
    tp2: +tp2.toFixed(2),
    sl1: +sl1.toFixed(2),
    sl2: +sl2.toFixed(2),
    rrRatio,
    reasons,
    indicators: ind,
    timestamp: Date.now(),
    status: 'ACTIVE',
  };
}
 
