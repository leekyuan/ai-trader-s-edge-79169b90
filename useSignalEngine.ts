// ============================================================
// useSignalEngine — 캔들 관리 + 신호 생성 메인 훅
// ============================================================
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  calcIndicators, generateSignal,
  type OHLCV, type Signal, type IndicatorSnapshot
} from '../engine/indicators';
import { useBinanceStream, fetchKlines } from './useBinanceStream';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const INTERVAL = '15m';   // 15분봉 기준 신호
const MAX_CANDLES = 300;
const SIGNAL_COOLDOWN_MS = 15 * 60 * 1000; // 같은 심볼 15분 쿨다운

export interface SymbolState {
  price: number;
  indicators: IndicatorSnapshot | null;
  candles: OHLCV[];
  loading: boolean;
}

export function useSignalEngine() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [symbolStates, setSymbolStates] = useState<Record<string, SymbolState>>(() =>
    Object.fromEntries(SYMBOLS.map(s => [s, { price: 0, indicators: null, candles: [], loading: true }]))
  );

  // 캔들 버퍼 (ref — 렌더 없이 업데이트)
  const candleBuffers = useRef<Record<string, OHLCV[]>>(
    Object.fromEntries(SYMBOLS.map(s => [s, []]))
  );

  // 마지막 신호 시간 (쿨다운)
  const lastSignalTime = useRef<Record<string, number>>(
    Object.fromEntries(SYMBOLS.map(s => [s, 0]))
  );

  // ── 초기 히스토리 로드 ─────────────────────────────────
  useEffect(() => {
    SYMBOLS.forEach(async (sym) => {
      try {
        const klines = await fetchKlines(sym, INTERVAL, MAX_CANDLES);
        candleBuffers.current[sym] = klines;
        const ind = calcIndicators(klines);
        setSymbolStates(prev => ({
          ...prev,
          [sym]: { ...prev[sym], candles: klines, indicators: ind, loading: false },
        }));
      } catch (e) {
        console.error(`Failed to load klines for ${sym}`, e);
        setSymbolStates(prev => ({
          ...prev,
          [sym]: { ...prev[sym], loading: false },
        }));
      }
    });
  }, []);

  // ── 캔들 업데이트 처리 ─────────────────────────────────
  const handleKline = useCallback((candle: OHLCV, isClosed: boolean) => {
    // WebSocket 메시지에서 심볼을 특정할 수 없으므로 가격으로 매칭
    // 실제로는 stream name을 파싱해야 함 → 아래 심볼 파악 로직 사용
    // (useBinanceStream 내부에서 symbol별로 분기하는 버전으로 아래에 별도 구현)
  }, []);

  const handleTick = useCallback((price: number) => {}, []);

  // ── 심볼별 캔들 + 신호 처리 ───────────────────────────
  const processCandle = useCallback((sym: string, candle: OHLCV, isClosed: boolean) => {
    const buf = candleBuffers.current[sym];

    if (isClosed) {
      // 확정 캔들 추가
      buf.push(candle);
      if (buf.length > MAX_CANDLES) buf.shift();
    } else {
      // 현재 진행 중 캔들 업데이트
      if (buf.length > 0) buf[buf.length - 1] = candle;
    }

    if (buf.length < 60) return; // 지표 계산 최소 캔들 수

    const ind = calcIndicators(buf);

    // 가격 및 지표 상태 업데이트
    setSymbolStates(prev => ({
      ...prev,
      [sym]: { ...prev[sym], indicators: ind, price: candle.close, candles: [...buf] },
    }));

    // 확정 캔들 시에만 신호 체크
    if (!isClosed) return;

    const now = Date.now();
    const cooldownOk = now - lastSignalTime.current[sym] > SIGNAL_COOLDOWN_MS;
    if (!cooldownOk) return;

    const signal = generateSignal(sym, buf, ind);
    if (!signal) return;

    lastSignalTime.current[sym] = now;
    setSignals(prev => [signal, ...prev].slice(0, 50)); // 최대 50개 보관
  }, []);

  const processTick = useCallback((sym: string, price: number) => {
    setSymbolStates(prev => ({
      ...prev,
      [sym]: { ...prev[sym], price },
    }));
  }, []);

  return { signals, symbolStates, processCandle, processTick };
}

// ── 심볼별 WebSocket 훅 (개별 연결) ───────────────────────
export function useSymbolStream(
  sym: string,
  processCandle: (s: string, c: OHLCV, closed: boolean) => void,
  processTick: (s: string, p: number) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    const lower = sym.toLowerCase();
    const streams = `${lower}@kline_${INTERVAL}/${lower}@aggTrade`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const stream: string = msg.stream ?? '';
        const data = msg.data;
        if (stream.includes('@kline')) {
          const k = data.k;
          processCandle(sym, {
            time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v,
          }, k.x);
        } else if (stream.includes('@aggTrade')) {
          processTick(sym, +data.p);
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => { reconnectRef.current = setTimeout(connect, 3000); };
    ws.onerror = () => ws.close();
  }, [sym, processCandle, processTick]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); clearTimeout(reconnectRef.current); };
  }, [connect]);
}
