import { useState } from 'react';
import { Bot, TrendingUp, Shield, Bell, Key, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ExchangeSettingsModal } from './ExchangeSettingsModal';
import { TelegramSettingsModal } from './TelegramSettingsModal';

interface AISidebarProps {
  symbol: string;
  isGuest: boolean;
}

export function AISidebar({ symbol, isGuest }: AISidebarProps) {
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Bot className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">AI Advisor</span>
      </div>

      {/* Analysis */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">기술적 분석</h4>
          <div className="bg-muted rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">추세</span>
              <span className="price-up font-semibold">상승</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RSI (14)</span>
              <span className="font-mono">58.3</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">MACD</span>
              <span className="price-up font-mono">+124.5</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">볼린저</span>
              <span className="font-mono">중간</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI 시그널</h4>
          <div className="bg-bull/10 border border-bull/20 rounded-lg p-3 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-bull" />
              <span className="font-semibold text-bull">매수 시그널</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {symbol} 지지선 반등 확인. 거래량 증가 동반. 목표가 +3.2% 구간 진입 검토.
            </p>
          </div>
        </div>

        {/* Locked sections for guest */}
        <div className={cn(isGuest && 'blur-locked')}>
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">API 설정</h4>
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start text-xs gap-2" onClick={() => setExchangeOpen(true)} disabled={isGuest}>
                <Key className="h-3.5 w-3.5" /> 거래소 API 연결
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start text-xs gap-2" onClick={() => setTelegramOpen(true)} disabled={isGuest}>
                <Send className="h-3.5 w-3.5" /> Telegram 봇 설정
              </Button>
            </div>
          </div>
        </div>

        <div className={cn(isGuest && 'blur-locked')}>
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">알림</h4>
            <div className="bg-muted rounded-lg p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <Bell className="h-3 w-3 text-primary" />
                <span className="text-muted-foreground">강력 신호 발생 시 알림</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-3 w-3 text-warning" />
                <span className="text-muted-foreground">리스크 한도 초과 경고</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isGuest && (
        <div className="p-4 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center">
            🔒 로그인하면 API 연결, 알림 등 모든 기능을 이용할 수 있습니다
          </p>
        </div>
      )}

      <ExchangeSettingsModal open={exchangeOpen} onOpenChange={setExchangeOpen} />
      <TelegramSettingsModal open={telegramOpen} onOpenChange={setTelegramOpen} />
    </div>
  );
}
