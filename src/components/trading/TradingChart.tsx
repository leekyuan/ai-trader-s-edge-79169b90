import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TradingChartProps {
  symbol: string;
}

interface ChartPoint {
  time: string;
  price: number;
}

export function TradingChart({ symbol }: TradingChartProps) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChart = async () => {
      setLoading(true);
      const mapping: Record<string, string> = {
        BTC: 'bitcoin', SOL: 'solana', ETH: 'ethereum', BNB: 'binancecoin',
        XRP: 'ripple', TRX: 'tron', DOGE: 'dogecoin', HYPE: 'hyperliquid',
        ADA: 'cardano', PAXG: 'pax-gold', XAG: 'silver',
      };
      const id = mapping[symbol] || 'bitcoin';
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=7`
        );
        const json = await res.json();
        if (json.prices) {
          const points: ChartPoint[] = json.prices.map(([ts, price]: [number, number]) => ({
            time: new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
            price,
          }));
          // Sample ~50 points
          const step = Math.max(1, Math.floor(points.length / 50));
          setData(points.filter((_, i) => i % step === 0));
        }
      } catch {
        // Generate mock data
        const base = symbol === 'BTC' ? 95000 : symbol === 'ETH' ? 3500 : 100;
        setData(Array.from({ length: 50 }, (_, i) => ({
          time: `Day ${i + 1}`,
          price: base + (Math.random() - 0.5) * base * 0.05,
        })));
      }
      setLoading(false);
    };
    fetchChart();
  }, [symbol]);

  const isUp = data.length >= 2 && data[data.length - 1].price >= data[0].price;
  const color = isUp ? 'hsl(142, 71%, 45%)' : 'hsl(0, 72%, 51%)';

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <h2 className="text-lg font-semibold">{symbol}/USDT</h2>
        <span className="text-xs text-muted-foreground">7D Chart</span>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading chart...
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'hsl(215, 15%, 55%)' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(2)} />
              <Tooltip
                contentStyle={{ background: 'hsl(220, 18%, 12%)', border: '1px solid hsl(220, 14%, 16%)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'hsl(215, 15%, 55%)' }}
                formatter={(val: number) => [`$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Price']}
              />
              <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#chartGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
