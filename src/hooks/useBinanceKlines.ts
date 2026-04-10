import { useQuery } from '@tanstack/react-query';

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  const pair = `${symbol}USDT`;
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`
  );
  if (!res.ok) throw new Error('Failed to fetch klines');
  const data = await res.json();
  return data.map((k: any[]) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

export function useBinanceKlines(symbol: string, interval: string, limit = 100) {
  return useQuery({
    queryKey: ['klines', symbol, interval, limit],
    queryFn: () => fetchKlines(symbol, interval, limit),
    refetchInterval: interval === '1h' ? 60_000 : 30_000,
    staleTime: 15_000,
  });
}
