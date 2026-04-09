import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { CoinList } from '@/components/trading/CoinList';
import { TradingChart } from '@/components/trading/TradingChart';
import { OrderPanel } from '@/components/trading/OrderPanel';
import { AISidebar } from '@/components/trading/AISidebar';
import { AuthModal } from '@/components/trading/AuthModal';
import { TopBar } from '@/components/trading/TopBar';
import { cn } from '@/lib/utils';

const Index = () => {
  const { user } = useAuth();
  const isGuest = !user;
  const [selectedCoin, setSelectedCoin] = useState('BTC');
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopBar onLoginClick={() => setAuthOpen(true)} />

      {/* Coin strip */}
      <div className="border-b border-border bg-card">
        <CoinList selectedCoin={selectedCoin} onSelectCoin={setSelectedCoin} />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Chart */}
        <div className="flex-1 min-h-[300px] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-border">
          <TradingChart symbol={selectedCoin} />
        </div>

        {/* Right panel: Order + AI */}
        <div className="flex flex-col sm:flex-row lg:flex-col lg:w-[340px] overflow-y-auto border-border">
          {/* Order Panel */}
          <div className={cn(
            'flex-1 border-b sm:border-b-0 sm:border-r lg:border-b lg:border-r-0 border-border',
            isGuest && 'blur-locked'
          )}>
            <OrderPanel symbol={selectedCoin} />
          </div>

          {/* AI Sidebar */}
          <div className="flex-1 min-h-[200px]">
            <AISidebar symbol={selectedCoin} isGuest={isGuest} />
          </div>
        </div>
      </div>

      {/* Guest overlay prompt */}
      {isGuest && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <button
            onClick={() => setAuthOpen(true)}
            className="bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-medium shadow-lg glow-blue hover:bg-primary/90 transition-all"
          >
            🔓 로그인하여 모든 기능 잠금 해제
          </button>
        </div>
      )}

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
};

export default Index;
