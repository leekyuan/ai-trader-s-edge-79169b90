// ============================================================
// useBinanceStream — Binance WebSocket 실시간 데이터 훅
// ============================================================
import { useEffect, useRef, useCallback } from 'react';
import type { OHLCV } from '../engine/indicators';

export type Kline = OHLCV;

interface BinanceKlineMsg {
  k: {
    t: number; o: string; h: string; l: string; c: string; v: string; x: boolean;
  };
}

type KlineCallback = (candle: OHLCV, isClosed: boolean) => void;
type TickCallback = (price: number) => void;

const WS_BASE = 'wss://stream.binance.com:9443/stream?streams=';

export function useBinanceStream(
  symbols: string[],
  interval: string,
  onKline: KlineCallback,
  onTick: TickCallback
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const streams = symbols.flatMap(s => [
      `${s.toLowerCase()}@kline_${interval}`,
      `${s.toLowerCase()}@aggTrade`,
    ]).join('/');

    const ws = new WebSocket(`${WS_BASE}${streams}`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const stream: string = msg.stream ?? '';
        const data = msg.data;

        if (stream.includes('@kline')) {
          const kline = data as BinanceKlineMsg;
          const k = kline.k;
          const candle: OHLCV = {
            time: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          };
          onKline(candle, k.x);
        } else if (stream.includes('@aggTrade')) {
          onTick(parseFloat(data.p));
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      reconnectRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
  }, [symbols, interval, onKline, onTick]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectRef.current);
    };
  }, [connect]);
}

// ── REST로 초기 캔들 히스토리 로드 ────────────────────────
export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 300
): Promise<OHLCV[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  const data: [number, string, string, string, string, string][] = await res.json();
  return data.map(k => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}
