import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { StrategyPanel } from './StrategyPanel';
import { SignalBanner } from './SignalBanner';
import { useBinanceKlines } from '@/hooks/useBinanceKlines';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useTradeExecute } from '@/hooks/useTradeExecute';
import { calculateATR, detectMSS, detectFVG, checkConfluence } from '@/lib/indicators';
import { toast } from 'sonner';

interface OrderPanelProps {
  symbol: string;
}

export function OrderPanel({ symbol }: OrderPanelProps) {
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [totalCapital, setTotalCapital] = useState('');
  const [riskPercent, setRiskPercent] = useState([1]);
  const [leverage, setLeverage] = useState([1]);
  const [marginMode, setMarginMode] = useState<'isolated' | 'cross'>('isolated');

  const entry = parseFloat(entryPrice) || 0;
  const sl = parseFloat(stopLoss) || 0;
  const tp = parseFloat(takeProfit) || 0;
  const capital = parseFloat(totalCapital) || 0;
  const risk = riskPercent[0];
  const lev = leverage[0];

  // Binance data
  const { data: klines1H } = useBinanceKlines(symbol, '1h', 50);
  const { data: klines15M } = useBinanceKlines(symbol, '15m', 50);
  const { ticker, connected, setSafetyCheck, onSafetyTrigger } = useBinanceWebSocket(symbol);
  const { settings } = useUserSettings();
  const tradeExecute = useTradeExecute(settings.fastapi_url);

  const currentPrice = ticker?.price ?? 0;

  // Auto-fill entry price from WebSocket
  useEffect(() => {
    if (currentPrice > 0 && !entryPrice) {
      setEntryPrice(currentPrice.toString());
    }
  }, [currentPrice, entryPrice]);

  // Indicators
  const atr = useMemo(() => klines1H ? calculateATR(klines1H) : 0, [klines1H]);
  const mss = useMemo(() => klines1H ? detectMSS(klines1H) : { detected: false, direction: null, breakLevel: 0 }, [klines1H]);
  const fvg = useMemo(() => klines15M && currentPrice ? detectFVG(klines15M, currentPrice) : { detected: false, direction: null, gapHigh: 0, gapLow: 0, priceInGap: false }, [klines15M, currentPrice]);
  const confluence = useMemo(() => checkConfluence(mss, fvg, currentPrice, atr), [mss, fvg, currentPrice, atr]);

  // Strategy SL/TP auto-fill
  const handleSLTPChange = useCallback((newSL: number, newTP: number) => {
    setStopLoss(newSL.toFixed(2));
    setTakeProfit(newTP.toFixed(2));
  }, []);

  // Apply confluence preset
  const handleApplyPreset = useCallback(() => {
    if (!confluence.isHighProbability) return;
    setEntryPrice(confluence.suggestedEntry.toFixed(2));
    setStopLoss(confluence.suggestedSL.toFixed(2));
    setTakeProfit(confluence.suggestedTP.toFixed(2));
    setSide(confluence.direction === 'long' ? 'long' : 'short');
    toast.success('High Probability Signal 프리셋이 적용되었습니다');
  }, [confluence]);

  // Safety check — SL/TP hit via WebSocket
  useEffect(() => {
    if (entry && sl && tp) {
      setSafetyCheck({ side, entryPrice: entry, stopLoss: sl, takeProfit: tp });
    } else {
      setSafetyCheck(null);
    }
  }, [side, entry, sl, tp, setSafetyCheck]);

  useEffect(() => {
    onSafetyTrigger((type, price) => {
      toast.warning(`⚠️ ${type === 'sl' ? '손절가' : '익절가'} 도달! (${price.toFixed(2)}) — 종료 요청 전송 중...`);
      // Could auto-close via FastAPI here
    });
  }, [onSafetyTrigger]);

  // Calculations
  const optimalQty = useMemo(() => {
    if (!entry || !sl || !capital || entry === sl) return 0;
    return (capital * (risk / 100)) / Math.abs(entry - sl);
  }, [entry, sl, capital, risk]);

  const rr = useMemo(() => {
    if (!entry || !sl || !tp || entry === sl) return 0;
    return Math.abs(tp - entry) / Math.abs(entry - sl);
  }, [entry, sl, tp]);

  const lowRR = rr > 0 && rr < 1.5;

  const handleSubmit = () => {
    if (!entry || !sl || !tp || !optimalQty) {
      toast.error('모든 필드를 입력해주세요');
      return;
    }
    tradeExecute.mutate({
      symbol,
      side,
      entry_price: entry,
      stop_loss: sl,
      take_profit: tp,
      quantity: optimalQty,
      leverage: lev,
      margin_mode: marginMode,
      strategy_type: settings.strategy_type,
      breakeven_enabled: settings.breakeven_enabled,
      breakeven_trigger_pct: settings.breakeven_trigger_pct,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{symbol} 주문 패널</h3>
        <div className="flex items-center gap-1 text-[10px]">
          {connected ? (
            <><Wifi className="h-3 w-3 text-bull" /><span className="text-bull font-mono">{currentPrice > 0 ? currentPrice.toFixed(2) : '...'}</span></>
          ) : (
            <><WifiOff className="h-3 w-3 text-bear" /><span className="text-muted-foreground">연결 중...</span></>
          )}
        </div>
      </div>

      {/* MSS / FVG / Signal */}
      <SignalBanner confluence={confluence} mss={mss} fvg={fvg} onApplyPreset={handleApplyPreset} />

      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={side === 'long' ? 'default' : 'outline'}
          className={side === 'long' ? 'bg-bull hover:bg-bull/90 text-white' : ''}
          onClick={() => setSide('long')}
          size="sm"
        >
          Long
        </Button>
        <Button
          variant={side === 'short' ? 'default' : 'outline'}
          className={side === 'short' ? 'bg-bear hover:bg-bear/90 text-white' : ''}
          onClick={() => setSide('short')}
          size="sm"
        >
          Short
        </Button>
      </div>

      {/* Margin Mode */}
      <Tabs value={marginMode} onValueChange={(v) => setMarginMode(v as 'isolated' | 'cross')}>
        <TabsList className="w-full h-8">
          <TabsTrigger value="isolated" className="text-xs flex-1">격리</TabsTrigger>
          <TabsTrigger value="cross" className="text-xs flex-1">교차</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Leverage */}
      <div>
        <Label className="text-xs text-muted-foreground">레버리지: {lev}x</Label>
        <Slider value={leverage} onValueChange={setLeverage} min={1} max={100} step={1} className="mt-1" />
      </div>

      {/* Capital & Risk */}
      <div>
        <Label className="text-xs text-muted-foreground">총 자산 (USDT)</Label>
        <Input type="number" placeholder="10000" value={totalCapital} onChange={e => setTotalCapital(e.target.value)} className="h-8 text-xs font-mono mt-1" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">리스크: {risk}%</Label>
        <Slider value={riskPercent} onValueChange={setRiskPercent} min={0.1} max={10} step={0.1} className="mt-1" />
      </div>

      {/* Strategy Panel */}
      <StrategyPanel entryPrice={entry} atr={atr} onSLTPChange={handleSLTPChange} />

      {/* Entry / SL / TP */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">진입가</Label>
          <Input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} className="h-8 text-xs font-mono mt-0.5" />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">손절가</Label>
          <Input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className="h-8 text-xs font-mono mt-0.5" />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">익절가</Label>
          <Input type="number" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} className="h-8 text-xs font-mono mt-0.5" />
        </div>
      </div>

      {/* Computed */}
      <div className="bg-muted rounded-lg p-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">최적 수량</span>
          <span className="font-mono font-semibold">{optimalQty > 0 ? optimalQty.toFixed(4) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">손익비 (RR)</span>
          <span className={`font-mono font-semibold ${lowRR ? 'text-warning' : rr >= 1.5 ? 'price-up' : ''}`}>
            {rr > 0 ? `1:${rr.toFixed(2)}` : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">레버리지</span>
          <span className="font-mono">{lev}x ({marginMode === 'isolated' ? '격리' : '교차'})</span>
        </div>
      </div>

      {lowRR && (
        <div className="flex items-center gap-2 text-warning text-xs bg-warning/10 rounded-lg p-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>저효율 구간: 진입 비권장 (RR &lt; 1.5)</span>
        </div>
      )}

      <Button
        className={side === 'long' ? 'bg-bull hover:bg-bull/90' : 'bg-bear hover:bg-bear/90'}
        size="sm"
        onClick={handleSubmit}
        disabled={tradeExecute.isPending}
      >
        {tradeExecute.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
        {side === 'long' ? '매수' : '매도'} {symbol}
      </Button>
    </div>
  );
}
