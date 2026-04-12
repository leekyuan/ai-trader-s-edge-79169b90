import type { Kline } from '@/hooks/useBinanceKlines';

/** EMA (Exponential Moving Average) */
export function calculateEMA(klines: Kline[], period = 200): number[] {
  if (klines.length === 0) return [];
  const k = 2 / (period + 1);
  const emas: number[] = [klines[0].close];
  for (let i = 1; i < klines.length; i++) {
    emas.push(klines[i].close * k + emas[i - 1] * (1 - k));
  }
  return emas;
}

/** ATR (Average True Range) */
export function calculateATR(klines: Kline[], period = 14): number {
  if (klines.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    const prev = klines[i - 1];
    const curr = klines[i];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trs.push(tr);
  }
  // Simple moving average of last `period` TRs
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/** MSS (Market Structure Shift) on 1H candles
 *  Detects a bullish MSS (break of previous swing high) or bearish MSS (break of previous swing low).
 */
export interface MSSResult {
  detected: boolean;
  direction: 'bullish' | 'bearish' | null;
  breakLevel: number;
}

export function detectMSS(klines1H: Kline[]): MSSResult {
  if (klines1H.length < 10) return { detected: false, direction: null, breakLevel: 0 };

  // Find recent swing high and swing low (lookback 5 candles for pivots)
  const recent = klines1H.slice(-20);
  let swingHigh = -Infinity;
  let swingLow = Infinity;

  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];
    if (c.high > recent[i - 1].high && c.high > recent[i - 2].high &&
        c.high > recent[i + 1].high && c.high > recent[i + 2].high) {
      swingHigh = c.high;
    }
    if (c.low < recent[i - 1].low && c.low < recent[i - 2].low &&
        c.low < recent[i + 1].low && c.low < recent[i + 2].low) {
      swingLow = c.low;
    }
  }

  const lastCandle = recent[recent.length - 1];

  if (swingHigh !== -Infinity && lastCandle.close > swingHigh) {
    return { detected: true, direction: 'bullish', breakLevel: swingHigh };
  }
  if (swingLow !== Infinity && lastCandle.close < swingLow) {
    return { detected: true, direction: 'bearish', breakLevel: swingLow };
  }

  return { detected: false, direction: null, breakLevel: 0 };
}

/** FVG (Fair Value Gap) on 15M candles
 *  A bullish FVG exists when candle[i-2].high < candle[i].low (gap up).
 *  A bearish FVG exists when candle[i-2].low > candle[i].high (gap down).
 */
export interface FVGResult {
  detected: boolean;
  direction: 'bullish' | 'bearish' | null;
  gapHigh: number;
  gapLow: number;
  priceInGap: boolean;
}

export function detectFVG(klines15M: Kline[], currentPrice: number): FVGResult {
  if (klines15M.length < 10) return { detected: false, direction: null, gapHigh: 0, gapLow: 0, priceInGap: false };

  // Search from most recent backwards for the nearest FVG
  for (let i = klines15M.length - 1; i >= 2; i--) {
    const c0 = klines15M[i - 2]; // first candle
    const c2 = klines15M[i];     // third candle

    // Bullish FVG: gap between c0.high and c2.low
    if (c2.low > c0.high) {
      const gapLow = c0.high;
      const gapHigh = c2.low;
      const priceInGap = currentPrice >= gapLow && currentPrice <= gapHigh;
      return { detected: true, direction: 'bullish', gapHigh, gapLow, priceInGap };
    }

    // Bearish FVG: gap between c2.high and c0.low
    if (c2.high < c0.low) {
      const gapHigh = c0.low;
      const gapLow = c2.high;
      const priceInGap = currentPrice >= gapLow && currentPrice <= gapHigh;
      return { detected: true, direction: 'bearish', gapHigh, gapLow, priceInGap };
    }
  }

  return { detected: false, direction: null, gapHigh: 0, gapLow: 0, priceInGap: false };
}

/** Confluence: MSS + FVG agree on direction and price is in FVG zone */
export interface ConfluenceResult {
  isHighProbability: boolean;
  direction: 'long' | 'short' | null;
  suggestedEntry: number;
  suggestedSL: number;
  suggestedTP: number;
}

export function checkConfluence(
  mss: MSSResult,
  fvg: FVGResult,
  currentPrice: number,
  atr: number
): ConfluenceResult {
  const none: ConfluenceResult = { isHighProbability: false, direction: null, suggestedEntry: 0, suggestedSL: 0, suggestedTP: 0 };

  if (!mss.detected || !fvg.detected || !fvg.priceInGap) return none;

  // Both must agree on direction
  if (mss.direction === 'bullish' && fvg.direction === 'bullish') {
    return {
      isHighProbability: true,
      direction: 'long',
      suggestedEntry: currentPrice,
      suggestedSL: currentPrice - 2 * atr,
      suggestedTP: currentPrice + 4 * atr,
    };
  }

  if (mss.direction === 'bearish' && fvg.direction === 'bearish') {
    return {
      isHighProbability: true,
      direction: 'short',
      suggestedEntry: currentPrice,
      suggestedSL: currentPrice + 2 * atr,
      suggestedTP: currentPrice - 4 * atr,
    };
  }

  return none;
}
