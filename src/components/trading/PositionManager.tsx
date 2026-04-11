import { useBotStore } from '@/stores/useBotStore';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Shield, TrendingUp, Scissors } from 'lucide-react';

interface PositionManagerProps {
  positions?: Array<{
    pair: string;
    direction: 'long' | 'short';
    entryPrice: number;
    currentPrice: number;
    sl: number;
    pnlPct: number;
  }>;
}

export function PositionManager({ positions = [] }: PositionManagerProps) {
  const {
    trailingStopEnabled, trailingStopDistance,
    partialTpEnabled, partialTpRatio,
    setTrailingStopEnabled, setTrailingStopDistance,
    setPartialTpEnabled, setPartialTpRatio,
  } = useBotStore();

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="position-manager" className="border-border">
        <AccordionTrigger className="px-4 py-2 text-xs font-semibold hover:no-underline">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-primary" />
            포지션 관리
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-3 space-y-4">
          {/* Partial TP */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Scissors className="h-3 w-3 text-muted-foreground" />
                <Label className="text-xs">부분 익절 (TP1/TP2)</Label>
              </div>
              <Switch checked={partialTpEnabled} onCheckedChange={setPartialTpEnabled} />
            </div>
            {partialTpEnabled && (
              <div>
                <Label className="text-[10px] text-muted-foreground">TP1 청산 비율: {partialTpRatio}%</Label>
                <Slider value={[partialTpRatio]} onValueChange={([v]) => setPartialTpRatio(v)} min={25} max={75} step={5} className="mt-1" />
              </div>
            )}
          </div>

          {/* Trailing Stop */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <Label className="text-xs">트레일링 스탑</Label>
              </div>
              <Switch checked={trailingStopEnabled} onCheckedChange={setTrailingStopEnabled} />
            </div>
            {trailingStopEnabled && (
              <div>
                <Label className="text-[10px] text-muted-foreground">트레일 거리: {trailingStopDistance}%</Label>
                <Slider value={[trailingStopDistance]} onValueChange={([v]) => setTrailingStopDistance(v)} min={0.3} max={3} step={0.1} className="mt-1" />
              </div>
            )}
          </div>

          {/* Open Positions */}
          {positions.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">오픈 포지션</Label>
              {positions.map((pos, i) => (
                <div key={i} className="bg-muted rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{pos.pair}</span>
                      <Badge variant="outline" className={cn('text-[9px]', pos.direction === 'long' ? 'text-bull border-bull/30' : 'text-bear border-bear/30')}>
                        {pos.direction.toUpperCase()}
                      </Badge>
                    </div>
                    <span className={cn('font-mono font-semibold', pos.pnlPct >= 0 ? 'price-up' : 'price-down')}>
                      {pos.pnlPct >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>진입: {pos.entryPrice.toFixed(2)}</span>
                    <span>SL: {pos.sl.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {positions.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">오픈 포지션 없음</p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
