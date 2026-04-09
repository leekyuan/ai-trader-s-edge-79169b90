import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface Coin {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
}

const COINS: Coin[] = [
  { symbol: 'BTC', name: 'Bitcoin', price: 0, change24h: 0 },
  { symbol: 'SOL', name: 'Solana', price: 0, change24h: 0 },
  { symbol: 'ETH', name: 'Ethereum', price: 0, change24h: 0 },
  { symbol: 'BNB', name: 'BNB', price: 0, change24h: 0 },
  { symbol: 'XRP', name: 'Ripple', price: 0, change24h: 0 },
  { symbol: 'TRX', name: 'TRON', price: 0, change24h: 0 },
  { symbol: 'DOGE', name: 'Dogecoin', price: 0, change24h: 0 },
  { symbol: 'HYPE', name: 'Hyperliquid', price: 0, change24h: 0 },
  { symbol: 'ADA', name: 'Cardano', price: 0, change24h: 0 },
  { symbol: 'PAXG', name: 'PAX Gold', price: 0, change24h: 0 },
  { symbol: 'XAG', name: 'Silver', price: 0, change24h: 0 },
];

interface CoinListProps {
  selectedCoin: string;
  onSelectCoin: (symbol: string) => void;
}

export function CoinList({ selectedCoin, onSelectCoin }: CoinListProps) {
  const [coins, setCoins] = useState<Coin[]>(COINS);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = 'bitcoin,solana,ethereum,binancecoin,ripple,tron,dogecoin,hyperliquid,cardano,pax-gold';
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
        );
        const data = await res.json();
        const mapping: Record<string, string> = {
          BTC: 'bitcoin', SOL: 'solana', ETH: 'ethereum', BNB: 'binancecoin',
          XRP: 'ripple', TRX: 'tron', DOGE: 'dogecoin', HYPE: 'hyperliquid',
          ADA: 'cardano', PAXG: 'pax-gold',
        };
        setCoins(prev => prev.map(c => {
          const id = mapping[c.symbol];
          if (id && data[id]) {
            return { ...c, price: data[id].usd || 0, change24h: data[id].usd_24h_change || 0 };
          }
          return c;
        }));
      } catch {
        // silently fail, keep mock data
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex gap-1 overflow-x-auto py-2 px-1 scrollbar-thin">
      {coins.map(coin => (
        <button
          key={coin.symbol}
          onClick={() => onSelectCoin(coin.symbol)}
          className={cn(
            'flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-all',
            'border border-transparent hover:border-border hover:bg-accent',
            selectedCoin === coin.symbol && 'bg-accent border-primary/30 glow-blue'
          )}
        >
          <span className="font-semibold text-foreground">{coin.symbol}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {coin.price > 0 ? `$${coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </span>
          <span className={cn(
            'font-mono text-[10px]',
            coin.change24h >= 0 ? 'price-up' : 'price-down'
          )}>
            {coin.change24h !== 0 ? `${coin.change24h >= 0 ? '+' : ''}${coin.change24h.toFixed(2)}%` : '—'}
          </span>
        </button>
      ))}
    </div>
  );
}
