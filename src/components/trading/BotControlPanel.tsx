import { useState } from 'react';
import { useBotStore, BotStatus } from '@/stores/useBotStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Play, Square, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALL_COINS = ['BTC', 'SOL', 'ETH', 'BNB', 'XRP', 'TRX', 'DOGE', 'HYPE', 'ADA', 'PAXG', 'XAG'];

function StatusDot({ status }: { status: BotStatus }) {
  const colors: Record<BotStatus, string> = {
    idle: 'bg-muted-foreground',
    scanning: 'bg-bull animate-pulse',
    in_position: 'bg-warning',
    paused: 'bg-bear',
  };
  const labels: Record<BotStatus, string> = {
    idle: '대기',
    scanning: '스캐닝',
    in_position: '포지션',
    paused: '일시정지',
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', colors[status])} />
      <span className="text-[10px] font-mono text-muted-foreground">{labels[status]}</span>
    </div>
  );
}

export { StatusDot };

export function BotControlPanel() {
  const {
    botStatus, activePairs, dailyLossLimit, dailyPnL,
    setBotStatus, setActivePairs, setDailyLossLimit,
  } = useBotStore();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const toggleBot = () => {
    if (botStatus === 'idle' || botStatus === 'paused') {
      setConfirmOpen(true);
    } else {
      setBotStatus('idle');
    }
  };

  const confirmStart = () => {
    setBotStatus('scanning');
    setConfirmOpen(false);
  };

  const togglePair = (coin: string) => {
    if (activePairs.includes(coin)) {
      setActivePairs(activePairs.filter(c => c !== coin));
    } else if (activePairs.length < 5) {
      setActivePairs([...activePairs, coin]);
    }
  };

  const isRunning = botStatus === 'scanning' || botStatus === 'in_position';

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">자동매매 봇</h3>
        <StatusDot status={botStatus} />
      </div>

      {/* Active Pairs */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">감시 페어 (최대 5개)</Label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_COINS.map(c => (
            <Badge
              key={c}
              variant={activePairs.includes(c) ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer text-[10px] transition-all',
                activePairs.includes(c) && 'bg-primary text-primary-foreground',
              )}
              onClick={() => togglePair(c)}
            >
              {c}
            </Badge>
          ))}
        </div>
      </div>

      {/* Daily Loss Limit */}
      <div>
        <Label className="text-xs text-muted-foreground">일일 손실 한도: {dailyLossLimit}%</Label>
        <Slider
          value={[dailyLossLimit]}
          onValueChange={([v]) => setDailyLossLimit(v)}
          min={1} max={10} step={0.5}
          className="mt-1"
        />
      </div>

      {/* Daily PnL */}
      <div className="bg-muted rounded-lg p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">당일 PnL</span>
          <span className={cn('font-mono font-semibold', dailyPnL >= 0 ? 'price-up' : 'price-down')}>
            {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toFixed(2)}%
          </span>
        </div>
        {dailyPnL < -dailyLossLimit && (
          <div className="flex items-center gap-1 mt-2 text-bear">
            <AlertTriangle className="h-3 w-3" />
            <span>손실 한도 초과 — 봇 일시정지됨</span>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <Button
        className={cn('w-full', isRunning ? 'bg-bear hover:bg-bear/90' : 'bg-bull hover:bg-bull/90')}
        size="sm"
        onClick={toggleBot}
      >
        {isRunning ? <><Square className="h-3.5 w-3.5 mr-1.5" /> 봇 정지</> : <><Play className="h-3.5 w-3.5 mr-1.5" /> 봇 시작</>}
      </Button>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>봇 시작 확인</DialogTitle>
            <DialogDescription>현재 설정으로 자동매매 봇을 시작합니다.</DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">감시 페어</span><span className="font-mono">{activePairs.join(', ')}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">일일 손실 한도</span><span className="font-mono">{dailyLossLimit}%</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button size="sm" className="bg-bull hover:bg-bull/90" onClick={confirmStart}>시작</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
