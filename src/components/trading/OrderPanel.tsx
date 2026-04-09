import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle } from 'lucide-react';

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

  const optimalQty = useMemo(() => {
    if (!entry || !sl || !capital || entry === sl) return 0;
    return (capital * (risk / 100)) / Math.abs(entry - sl);
  }, [entry, sl, capital, risk]);

  const rr = useMemo(() => {
    if (!entry || !sl || !tp || entry === sl) return 0;
    return Math.abs(tp - entry) / Math.abs(entry - sl);
  }, [entry, sl, tp]);

  const lowRR = rr > 0 && rr < 1.5;

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold text-foreground">{symbol} 주문 패널</h3>

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

      <Button className={side === 'long' ? 'bg-bull hover:bg-bull/90' : 'bg-bear hover:bg-bear/90'} size="sm">
        {side === 'long' ? '매수' : '매도'} {symbol}
      </Button>
    </div>
  );
}
