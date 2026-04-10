import { Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ConfluenceResult } from '@/lib/indicators';
import type { MSSResult, FVGResult } from '@/lib/indicators';

interface SignalBannerProps {
  confluence: ConfluenceResult;
  mss: MSSResult;
  fvg: FVGResult;
  onApplyPreset: () => void;
}

export function SignalBanner({ confluence, mss, fvg, onApplyPreset }: SignalBannerProps) {
  return (
    <div className="space-y-2">
      {/* MSS Indicator */}
      <div className="flex items-center justify-between bg-muted rounded-lg p-2 text-[10px]">
        <span className="text-muted-foreground">MSS (1H)</span>
        {mss.detected ? (
          <span className={mss.direction === 'bullish' ? 'price-up font-semibold' : 'price-down font-semibold'}>
            {mss.direction === 'bullish' ? '▲ 상승 전환' : '▼ 하락 전환'} @ {mss.breakLevel.toFixed(2)}
          </span>
        ) : (
          <span className="text-muted-foreground">감지 안 됨</span>
        )}
      </div>

      {/* FVG Indicator */}
      <div className="flex items-center justify-between bg-muted rounded-lg p-2 text-[10px]">
        <span className="text-muted-foreground">FVG (15M)</span>
        {fvg.detected ? (
          <span className={fvg.direction === 'bullish' ? 'price-up font-semibold' : 'price-down font-semibold'}>
            {fvg.direction === 'bullish' ? '▲' : '▼'} {fvg.gapLow.toFixed(2)} - {fvg.gapHigh.toFixed(2)}
            {fvg.priceInGap && ' ★ 진입 구간'}
          </span>
        ) : (
          <span className="text-muted-foreground">감지 안 됨</span>
        )}
      </div>

      {/* High Probability Signal */}
      {confluence.isHighProbability && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-primary">High Probability Signal</span>
            {confluence.direction === 'long' ? (
              <TrendingUp className="h-3.5 w-3.5 text-bull" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-bear" />
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
            <div>
              <span className="text-muted-foreground block">진입</span>
              <span>{confluence.suggestedEntry.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">손절</span>
              <span className="price-down">{confluence.suggestedSL.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">익절</span>
              <span className="price-up">{confluence.suggestedTP.toFixed(2)}</span>
            </div>
          </div>
          <Button size="sm" className="w-full h-7 text-[10px]" onClick={onApplyPreset}>
            주문서에 적용
          </Button>
        </div>
      )}
    </div>
  );
}
