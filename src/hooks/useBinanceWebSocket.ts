import { useEffect, useRef, useState, useCallback } from 'react';

interface TickerData {
  price: number;
  timestamp: number;
}

interface SafetyCheck {
  side: 'long' | 'short';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}

export function useBinanceWebSocket(symbol: string) {
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const safetyRef = useRef<SafetyCheck | null>(null);
  const onSafetyTriggerRef = useRef<((type: 'sl' | 'tp', price: number) => void) | null>(null);

  useEffect(() => {
    const pair = `${symbol.toLowerCase()}usdt`;
    const url = `wss://stream.binance.com:9443/ws/${pair}@ticker`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.c);
        const timestamp = Date.now();
        setTicker({ price, timestamp });

        // Safety check
        const s = safetyRef.current;
        if (s && onSafetyTriggerRef.current) {
          if (s.side === 'long') {
            if (price <= s.stopLoss) onSafetyTriggerRef.current('sl', price);
            if (price >= s.takeProfit) onSafetyTriggerRef.current('tp', price);
          } else {
            if (price >= s.stopLoss) onSafetyTriggerRef.current('sl', price);
            if (price <= s.takeProfit) onSafetyTriggerRef.current('tp', price);
          }
        }
      } catch {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [symbol]);

  const setSafetyCheck = useCallback((check: SafetyCheck | null) => {
    safetyRef.current = check;
  }, []);

  const onSafetyTrigger = useCallback((cb: (type: 'sl' | 'tp', price: number) => void) => {
    onSafetyTriggerRef.current = cb;
  }, []);

  return { ticker, connected, setSafetyCheck, onSafetyTrigger };
}
