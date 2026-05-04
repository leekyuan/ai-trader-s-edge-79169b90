import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
);

// ─────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────
const SEED_INITIAL = 10_000;
const POSITION_PCT = 0.10; // 10% of seed
const STOP_LOSS_PCT = 0.01; // 1% of total seed
const RR_RATIO = 2; // TP = 2x SL distance
const DAILY_LOSS_LIMIT_PCT = 0.02; // 2%
const STORAGE_KEY = 'crypto-sim-state-v1';

const STABLECOINS = new Set([
  'tether',
  'usd-coin',
  'dai',
  'binance-usd',
  'true-usd',
  'first-digital-usd',
  'usdd',
  'paypal-usd',
  'frax',
  'liquity-usd',
]);
const STABLE_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDD', 'PYUSD', 'FRAX', 'LUSD',
]);

interface Coin {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number;
  image: string;
}

interface OHLC {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

interface Position {
  id: string;
  coinId: string;
  coinSymbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  size: number; // USD notional
  sl: number;
  tp: number;
  ts: number;
}

interface Trade extends Position {
  exit: number;
  pnl: number;
  pnlPct: number;
  reason: 'SL' | 'TP' | 'Manual';
  closedAt: number;
}

type Verdict = 'Long' | 'Short' | 'Watch';

interface AnalysisResult {
  name: string;
  verdict: Verdict;
  detail: string;
}

// ─────────────────────────────────────────────────
// Indicators / Theory engines
// ─────────────────────────────────────────────────
const sma = (arr: number[], p: number): number => {
  if (arr.length < p) return arr[arr.length - 1] ?? 0;
  const s = arr.slice(-p);
  return s.reduce((a, b) => a + b, 0) / p;
};

const rsi = (closes: number[], period = 14): number => {
  if (closes.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  if (l === 0) return 100;
  const rs = g / l;
  return 100 - 100 / (1 + rs);
};

const stdev = (arr: number[]): number => {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
};

// Glen Neely / Elliott
function analyzeNeely(data: OHLC[]): AnalysisResult {
  if (data.length < 20) return { name: 'Glen Neely', verdict: 'Watch', detail: '데이터 부족' };
  const closes = data.map(d => d.c);
  // Find swings (last 30 bars)
  const recent = closes.slice(-30);
  const swings: { i: number; v: number; type: 'H' | 'L' }[] = [];
  for (let i = 2; i < recent.length - 2; i++) {
    if (recent[i] > recent[i - 1] && recent[i] > recent[i - 2] && recent[i] > recent[i + 1] && recent[i] > recent[i + 2])
      swings.push({ i, v: recent[i], type: 'H' });
    if (recent[i] < recent[i - 1] && recent[i] < recent[i - 2] && recent[i] < recent[i + 1] && recent[i] < recent[i + 2])
      swings.push({ i, v: recent[i], type: 'L' });
  }
  const last = recent[recent.length - 1];
  const first = recent[0];
  const trend = last > first ? 'up' : 'down';
  const waveCount = Math.min(5, swings.length);
  const isImpulse = waveCount >= 3;
  if (isImpulse && trend === 'up')
    return { name: 'Glen Neely', verdict: 'Long', detail: `상승 임펄스 추정 (Wave ${waveCount})` };
  if (isImpulse && trend === 'down')
    return { name: 'Glen Neely', verdict: 'Short', detail: `하락 임펄스 추정 (Wave ${waveCount})` };
  return { name: 'Glen Neely', verdict: 'Watch', detail: `조정 파동 가능성 (Swings ${swings.length})` };
}

// Harmonic patterns
function analyzeHarmonic(data: OHLC[]): AnalysisResult {
  if (data.length < 50) return { name: 'Harmonic', verdict: 'Watch', detail: '데이터 부족' };
  const window = data.slice(-50);
  const highs = window.map(d => d.h);
  const lows = window.map(d => d.l);
  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  const range = hi - lo;
  const price = data[data.length - 1].c;
  const fibs = {
    '38.2': lo + range * 0.382,
    '61.8': lo + range * 0.618,
    '78.6': lo + range * 0.786,
  };
  const patterns = ['Gartley', 'Bat', 'Butterfly', 'Crab'];
  const closestKey = Object.entries(fibs).reduce((a, b) =>
    Math.abs(b[1] - price) < Math.abs(a[1] - price) ? b : a,
  );
  const proximity = Math.abs(closestKey[1] - price) / price;
  if (proximity < 0.015) {
    const pattern = patterns[Math.floor((parseFloat(closestKey[0]) / 100) * patterns.length) % patterns.length];
    const direction = price < (hi + lo) / 2 ? 'Long' : 'Short';
    return {
      name: 'Harmonic',
      verdict: direction as Verdict,
      detail: `${pattern} PRZ 근접 (${closestKey[0]}% Fib)`,
    };
  }
  return { name: 'Harmonic', verdict: 'Watch', detail: `PRZ 이탈 (${(proximity * 100).toFixed(2)}%)` };
}

// ICT
function analyzeICT(data: OHLC[]): AnalysisResult {
  if (data.length < 50) return { name: 'ICT', verdict: 'Watch', detail: '데이터 부족' };
  const closes = data.map(d => d.c);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const prevSma20 = sma(closes.slice(0, -1), 20);
  const prevSma50 = sma(closes.slice(0, -1), 50);
  const last = closes[closes.length - 1];
  const recentHi = Math.max(...closes.slice(-20));
  const recentLo = Math.min(...closes.slice(-20));
  const sweepHi = last >= recentHi * 0.998;
  const sweepLo = last <= recentLo * 1.002;
  const bosUp = sma20 > sma50 && prevSma20 <= prevSma50;
  const bosDown = sma20 < sma50 && prevSma20 >= prevSma50;
  if (bosUp || (sma20 > sma50 && sweepLo))
    return { name: 'ICT', verdict: 'Long', detail: `BOS 상방 + OB 형성 (스윕 ${sweepLo ? '✓' : '–'})` };
  if (bosDown || (sma20 < sma50 && sweepHi))
    return { name: 'ICT', verdict: 'Short', detail: `CHOCH 하방 + FVG (스윕 ${sweepHi ? '✓' : '–'})` };
  return { name: 'ICT', verdict: 'Watch', detail: 'BOS/CHOCH 없음 — 횡보' };
}

// Wyckoff
function analyzeWyckoff(data: OHLC[]): AnalysisResult {
  if (data.length < 30) return { name: 'Wyckoff', verdict: 'Watch', detail: '데이터 부족' };
  const closes = data.map(d => d.c);
  const window = closes.slice(-50);
  const hi = Math.max(...window);
  const lo = Math.min(...window);
  const last = closes[closes.length - 1];
  const pos = (last - lo) / (hi - lo); // 0..1
  const recentVol = stdev(closes.slice(-5));
  const longVol = stdev(closes.slice(-20));
  const volRatio = longVol > 0 ? recentVol / longVol : 1;
  let phase = '', sub = '', verdict: Verdict = 'Watch';
  if (pos < 0.25) {
    phase = 'Accumulation';
    sub = volRatio > 1.3 ? 'Spring' : 'Phase B';
    verdict = 'Long';
  } else if (pos < 0.5) {
    phase = 'Markup';
    sub = 'Early';
    verdict = 'Long';
  } else if (pos < 0.75) {
    phase = 'Distribution';
    sub = volRatio > 1.3 ? 'UTAD' : 'Phase B';
    verdict = 'Short';
  } else {
    phase = 'Markdown';
    sub = 'Early';
    verdict = 'Short';
  }
  return { name: 'Wyckoff', verdict, detail: `${phase} – ${sub} (vol ${volRatio.toFixed(2)}x)` };
}

// ─────────────────────────────────────────────────
// Stablecoin / API helpers
// ─────────────────────────────────────────────────
async function fetchTopCoins(): Promise<Coin[]> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false',
  );
  if (!res.ok) throw new Error('CoinGecko API failed');
  const data = await res.json();
  return data
    .filter((c: any) => !STABLECOINS.has(c.id) && !STABLE_SYMBOLS.has(c.symbol.toUpperCase()))
    .map((c: any) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      market_cap_rank: c.market_cap_rank,
      image: c.image,
    }))
    .sort((a: Coin, b: Coin) => a.market_cap_rank - b.market_cap_rank);
}

async function fetchMarketChart(id: string, tf: '1H' | '4H' | '1D'): Promise<OHLC[]> {
  const days = tf === '1H' ? 1 : tf === '4H' ? 7 : 30;
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
  );
  if (!res.ok) throw new Error('Price fetch failed');
  const data = await res.json();
  const prices: [number, number][] = data.prices;
  const volumes: [number, number][] = data.total_volumes ?? [];
  // Build pseudo OHLC by bucketing
  const bucketMs = tf === '1H' ? 60 * 60 * 1000 : tf === '4H' ? 4 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const map = new Map<number, OHLC>();
  for (let i = 0; i < prices.length; i++) {
    const [t, p] = prices[i];
    const k = Math.floor(t / bucketMs) * bucketMs;
    const v = volumes[i]?.[1];
    const ex = map.get(k);
    if (!ex) map.set(k, { t: k, o: p, h: p, l: p, c: p, v });
    else {
      ex.h = Math.max(ex.h, p);
      ex.l = Math.min(ex.l, p);
      ex.c = p;
      if (v) ex.v = v;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.t - b.t);
}

// ─────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────
interface PersistState {
  seed: number;
  position: Position | null;
  trades: Trade[];
  dailyAnchorDate: string;
  dailyStartSeed: number;
}
const today = () => new Date().toISOString().slice(0, 10);

function loadState(): PersistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as PersistState;
      if (s.dailyAnchorDate !== today()) {
        s.dailyAnchorDate = today();
        s.dailyStartSeed = s.seed;
      }
      return s;
    }
  } catch {}
  return {
    seed: SEED_INITIAL,
    position: null,
    trades: [],
    dailyAnchorDate: today(),
    dailyStartSeed: SEED_INITIAL,
  };
}

// ─────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────
export default function Simulator() {
  const [state, setState] = useState<PersistState>(() => loadState());
  const { seed, position, trades, dailyStartSeed } = state;

  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(true);
  const [coinsError, setCoinsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('bitcoin');

  const [tf, setTf] = useState<'1H' | '4H' | '1D'>('1H');
  const [ohlc, setOhlc] = useState<OHLC[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const persist = useCallback((s: PersistState) => {
    setState(s);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }, []);

  // Load coins
  const loadCoins = useCallback(async () => {
    setCoinsLoading(true);
    setCoinsError(null);
    try {
      const c = await fetchTopCoins();
      setCoins(c);
    } catch (e: any) {
      setCoinsError(e.message);
    } finally {
      setCoinsLoading(false);
    }
  }, []);
  useEffect(() => { loadCoins(); }, [loadCoins]);

  // Load price
  const loadPrice = useCallback(async () => {
    if (!selectedId) return;
    setPriceLoading(true);
    setPriceError(null);
    try {
      const d = await fetchMarketChart(selectedId, tf);
      setOhlc(d);
      setLastUpdated(Date.now());
    } catch (e: any) {
      setPriceError(e.message);
    } finally {
      setPriceLoading(false);
    }
  }, [selectedId, tf]);
  useEffect(() => { loadPrice(); }, [loadPrice]);

  // Auto refresh every 60s
  useEffect(() => {
    const id = setInterval(loadPrice, 60_000);
    return () => clearInterval(id);
  }, [loadPrice]);

  const currentPrice = ohlc[ohlc.length - 1]?.c ?? 0;

  // Daily P&L tracking
  const dailyPnL = seed - dailyStartSeed;
  const dailyPnLPct = dailyStartSeed > 0 ? (dailyPnL / dailyStartSeed) * 100 : 0;
  const dailyLossHit = dailyPnL <= -SEED_INITIAL * DAILY_LOSS_LIMIT_PCT;

  const totalPnL = seed - SEED_INITIAL;
  const wins = trades.filter(t => t.pnl > 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const availableCapital = position ? seed - position.size : seed;

  // Auto SL/TP check every 5s
  useEffect(() => {
    if (!position) return;
    const check = () => {
      if (currentPrice <= 0) return;
      const hitSL = position.direction === 'LONG' ? currentPrice <= position.sl : currentPrice >= position.sl;
      const hitTP = position.direction === 'LONG' ? currentPrice >= position.tp : currentPrice <= position.tp;
      if (hitSL) closePosition('SL');
      else if (hitTP) closePosition('TP');
    };
    check();
    const id = setInterval(check, 5_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, currentPrice]);

  // Analyses
  const analyses: AnalysisResult[] = useMemo(() => {
    if (ohlc.length < 20) return [];
    return [analyzeNeely(ohlc), analyzeHarmonic(ohlc), analyzeICT(ohlc), analyzeWyckoff(ohlc)];
  }, [ohlc]);

  const longCount = analyses.filter(a => a.verdict === 'Long').length;
  const shortCount = analyses.filter(a => a.verdict === 'Short').length;

  const consensus: 'LONG' | 'SHORT' | 'WATCH' =
    longCount >= 3 ? 'LONG' : shortCount >= 3 ? 'SHORT' : 'WATCH';

  // Trade math
  const positionSize = seed * POSITION_PCT;
  const slDollar = seed * STOP_LOSS_PCT;
  const slDistancePct = positionSize > 0 ? slDollar / positionSize : 0;
  const tpDistancePct = slDistancePct * RR_RATIO;

  const computedSL = (dir: 'LONG' | 'SHORT', entry: number) =>
    dir === 'LONG' ? entry * (1 - slDistancePct) : entry * (1 + slDistancePct);
  const computedTP = (dir: 'LONG' | 'SHORT', entry: number) =>
    dir === 'LONG' ? entry * (1 + tpDistancePct) : entry * (1 - tpDistancePct);

  const selectedCoin = coins.find(c => c.id === selectedId);

  const openPosition = (dir: 'LONG' | 'SHORT') => {
    if (position || dailyLossHit || currentPrice <= 0 || !selectedCoin) return;
    const entry = currentPrice;
    const p: Position = {
      id: crypto.randomUUID(),
      coinId: selectedCoin.id,
      coinSymbol: selectedCoin.symbol,
      direction: dir,
      entry,
      size: positionSize,
      sl: computedSL(dir, entry),
      tp: computedTP(dir, entry),
      ts: Date.now(),
    };
    persist({ ...state, position: p });
    toast.success(`${dir} 진입: ${selectedCoin.symbol} @ $${entry.toFixed(4)}`);
  };

  const closePosition = (reason: 'SL' | 'TP' | 'Manual') => {
    if (!position) return;
    const exit = currentPrice;
    const ret = position.direction === 'LONG'
      ? (exit - position.entry) / position.entry
      : (position.entry - exit) / position.entry;
    const pnl = position.size * ret;
    const trade: Trade = {
      ...position,
      exit,
      pnl,
      pnlPct: ret * 100,
      reason,
      closedAt: Date.now(),
    };
    persist({
      ...state,
      seed: state.seed + pnl,
      position: null,
      trades: [trade, ...state.trades],
    });
    toast(reason === 'Manual' ? '수동 청산' : `${reason} 도달`, {
      description: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
    });
  };

  const resetAll = () => {
    if (!confirm('모든 데이터를 초기화하시겠습니까?')) return;
    const fresh: PersistState = {
      seed: SEED_INITIAL, position: null, trades: [],
      dailyAnchorDate: today(), dailyStartSeed: SEED_INITIAL,
    };
    persist(fresh);
  };

  // Live PnL on open position
  const livePnL = position
    ? (position.direction === 'LONG'
        ? (currentPrice - position.entry) / position.entry
        : (position.entry - currentPrice) / position.entry) * position.size
    : 0;
  const livePnLPct = position && position.size > 0 ? (livePnL / position.size) * 100 : 0;

  // Filtered coin list for search
  const filteredCoins = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coins;
    return coins.filter(c =>
      c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q),
    );
  }, [coins, search]);

  // Chart data
  const chartData = useMemo(() => ({
    datasets: [
      {
        label: 'Price',
        data: ohlc.map(d => ({ x: d.t, y: d.c })),
        borderColor: 'hsl(var(--primary))',
        backgroundColor: 'hsla(217, 91%, 60%, 0.15)',
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
      },
      ...(position && position.coinId === selectedId ? [
        {
          label: 'Entry',
          data: ohlc.map(d => ({ x: d.t, y: position.entry })),
          borderColor: 'hsl(48 96% 53%)',
          borderDash: [4, 4],
          pointRadius: 0,
          borderWidth: 1,
        },
        {
          label: 'SL',
          data: ohlc.map(d => ({ x: d.t, y: position.sl })),
          borderColor: 'hsl(0 84% 60%)',
          borderDash: [3, 3],
          pointRadius: 0,
          borderWidth: 1,
        },
        {
          label: 'TP',
          data: ohlc.map(d => ({ x: d.t, y: position.tp })),
          borderColor: 'hsl(142 76% 45%)',
          borderDash: [3, 3],
          pointRadius: 0,
          borderWidth: 1,
        },
      ] : []),
    ],
  }), [ohlc, position, selectedId]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { labels: { color: 'hsl(var(--muted-foreground))' } },
      tooltip: { mode: 'index' as const, intersect: false },
    },
    scales: {
      x: {
        type: 'time' as const,
        ticks: { color: 'hsl(var(--muted-foreground))' },
        grid: { color: 'hsla(0, 0%, 100%, 0.05)' },
      },
      y: {
        ticks: { color: 'hsl(var(--muted-foreground))' },
        grid: { color: 'hsla(0, 0%, 100%, 0.05)' },
      },
    },
  }), []);

  const verdictBadge = (v: Verdict) => {
    const cls =
      v === 'Long' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
      v === 'Short' ? 'bg-red-500/20 text-red-400 border-red-500/40' :
      'bg-amber-500/20 text-amber-400 border-amber-500/40';
    return <Badge variant="outline" className={cls}>{v}</Badge>;
  };

  // Consensus details
  const consEntry = currentPrice;
  const consDir: 'LONG' | 'SHORT' = consensus === 'SHORT' ? 'SHORT' : 'LONG';
  const consSL = computedSL(consDir, consEntry);
  const consTP = computedTP(consDir, consEntry);
  const consMaxLoss = positionSize * slDistancePct;

  const closes = ohlc.map(d => d.c);
  const consRSI = rsi(closes);
  const consSMA20 = sma(closes, 20);

  return (
    <div className="min-h-screen bg-background text-foreground p-3 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Crypto Futures Paper Sim</h1>
          <p className="text-xs text-muted-foreground">10,000 USD 가상 시드 · 1% 손절 · 1:2 R:R · 일일 -2% 한도</p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetAll}>초기화</Button>
      </div>

      {/* Daily loss warning */}
      {dailyLossHit && (
        <Card className="p-3 border-red-500/50 bg-red-500/10">
          <p className="text-sm font-semibold text-red-400">
            ⚠ 일일 손실 한도 (-2%) 도달 — 오늘은 신규 진입이 비활성화됩니다.
          </p>
        </Card>
      )}

      {/* Metrics bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: '총 자산', value: `$${seed.toFixed(2)}` },
          { label: '가용 자본', value: `$${availableCapital.toFixed(2)}` },
          {
            label: '오늘 손익',
            value: `${dailyPnL >= 0 ? '+' : ''}$${dailyPnL.toFixed(2)} (${dailyPnLPct.toFixed(2)}%)`,
            color: dailyPnL >= 0 ? 'text-emerald-400' : 'text-red-400',
          },
          {
            label: '누적 손익',
            value: `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`,
            color: totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400',
          },
          { label: '승률', value: `${winRate.toFixed(1)}% (${wins}/${trades.length})` },
        ].map(m => (
          <Card key={m.label} className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{m.label}</div>
            <div className={`text-sm sm:text-base font-bold mt-1 ${m.color ?? ''}`}>{m.value}</div>
          </Card>
        ))}
      </div>

      {/* Coin selector */}
      <Card className="p-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="코인 검색 (이름 또는 심볼)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          {coinsLoading ? (
            <Skeleton className="h-10 w-full sm:w-64" />
          ) : coinsError ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">{coinsError}</span>
              <Button size="sm" onClick={loadCoins}>재시도</Button>
            </div>
          ) : (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filteredCoins.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    #{c.market_cap_rank} {c.symbol} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-1">
            {(['1H', '4H', '1D'] as const).map(t => (
              <Button
                key={t}
                size="sm"
                variant={tf === t ? 'default' : 'outline'}
                onClick={() => setTf(t)}
              >{t}</Button>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {selectedCoin && (
            <>
              <span className="font-semibold text-foreground">{selectedCoin.name} ({selectedCoin.symbol})</span>
              {' · 현재가 '}
              <span className="font-mono text-foreground">${currentPrice.toFixed(currentPrice < 1 ? 6 : 2)}</span>
              {lastUpdated && ` · 업데이트 ${new Date(lastUpdated).toLocaleTimeString()}`}
            </>
          )}
        </div>
      </Card>

      {/* Chart */}
      <Card className="p-3">
        {priceLoading && ohlc.length === 0 ? (
          <Skeleton className="h-[320px] w-full" />
        ) : priceError ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <p className="text-sm text-red-400">{priceError}</p>
            <Button size="sm" onClick={loadPrice}>재시도</Button>
          </div>
        ) : (
          <div className="h-[320px]">
            <Line data={chartData as any} options={chartOptions as any} />
          </div>
        )}
      </Card>

      {/* 4 Theory Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {analyses.length === 0
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          : analyses.map(a => (
            <Card key={a.name} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">{a.name}</h3>
                {verdictBadge(a.verdict)}
              </div>
              <p className="text-xs text-muted-foreground">{a.detail}</p>
            </Card>
          ))}
      </div>

      {/* Consensus box */}
      <Card className={`p-4 border-2 ${
        consensus === 'LONG' ? 'border-emerald-500/60 bg-emerald-500/5' :
        consensus === 'SHORT' ? 'border-red-500/60 bg-red-500/5' :
        'border-amber-500/40 bg-amber-500/5'
      }`}>
        {consensus === 'WATCH' ? (
          <div>
            <h3 className="font-bold text-amber-400">⏸ Watch — 합의 부족 (Long {longCount} / Short {shortCount})</h3>
            <p className="text-xs text-muted-foreground mt-1">
              RSI {consRSI.toFixed(1)} · SMA20 ${consSMA20.toFixed(2)}
            </p>
          </div>
        ) : (
          <div>
            <h3 className={`font-bold ${consensus === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
              ✅ {consensus === 'LONG' ? 'Long Recommended' : 'Short Recommended'} ({consensus === 'LONG' ? longCount : shortCount}/4)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-2 text-xs">
              <div><div className="text-muted-foreground">진입가</div><div className="font-mono font-semibold">${consEntry.toFixed(4)}</div></div>
              <div><div className="text-muted-foreground">포지션 크기</div><div className="font-mono font-semibold">${positionSize.toFixed(2)}</div></div>
              <div><div className="text-muted-foreground">손절가</div><div className="font-mono font-semibold text-red-400">${consSL.toFixed(4)}</div></div>
              <div><div className="text-muted-foreground">익절가</div><div className="font-mono font-semibold text-emerald-400">${consTP.toFixed(4)}</div></div>
              <div><div className="text-muted-foreground">최대 손실</div><div className="font-mono font-semibold">${consMaxLoss.toFixed(2)}</div></div>
            </div>
          </div>
        )}
      </Card>

      {/* Trading buttons + position card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">주문</h3>
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!!position || dailyLossHit || currentPrice <= 0}
              onClick={() => openPosition('LONG')}
            >
              LONG
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={!!position || dailyLossHit || currentPrice <= 0}
              onClick={() => openPosition('SHORT')}
            >
              SHORT
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            포지션 크기 ${positionSize.toFixed(2)} · 손절 ${slDollar.toFixed(2)} · 익절 ${(slDollar * RR_RATIO).toFixed(2)}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-2">활성 포지션</h3>
          {position ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>{position.coinSymbol} {position.direction}</span>
                <Badge variant="outline" className={position.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>
                  {position.direction}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>진입가: <span className="font-mono">${position.entry.toFixed(4)}</span></div>
                <div>현재가: <span className="font-mono">${currentPrice.toFixed(4)}</span></div>
                <div>SL: <span className="font-mono text-red-400">${position.sl.toFixed(4)}</span></div>
                <div>TP: <span className="font-mono text-emerald-400">${position.tp.toFixed(4)}</span></div>
              </div>
              <div className={`text-base font-bold ${livePnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {livePnL >= 0 ? '+' : ''}${livePnL.toFixed(2)} ({livePnLPct.toFixed(2)}%)
              </div>
              <Button size="sm" variant="outline" onClick={() => closePosition('Manual')}>
                수동 청산
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">포지션 없음</p>
          )}
        </Card>
      </div>

      {/* Trade log */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">거래 로그 ({trades.length})</h3>
        <div className="max-h-[300px] overflow-y-auto">
          {trades.length === 0 ? (
            <p className="text-xs text-muted-foreground">청산된 거래가 없습니다.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left border-b border-border">
                  <th className="py-1">시각</th>
                  <th>코인</th>
                  <th>방향</th>
                  <th>진입→청산</th>
                  <th>P&L</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {trades.map(t => (
                  <tr key={t.id} className="border-b border-border/50">
                    <td className="py-1">{new Date(t.closedAt).toLocaleString()}</td>
                    <td>{t.coinSymbol}</td>
                    <td className={t.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>{t.direction}</td>
                    <td className="font-mono">${t.entry.toFixed(4)} → ${t.exit.toFixed(4)}</td>
                    <td className={`font-mono ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} ({t.pnlPct.toFixed(2)}%)
                    </td>
                    <td>
                      <Badge variant="outline" className={
                        t.reason === 'TP' ? 'text-emerald-400' :
                        t.reason === 'SL' ? 'text-red-400' : ''
                      }>{t.reason}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
