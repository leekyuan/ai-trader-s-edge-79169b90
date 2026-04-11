import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { StatusDot } from './BotControlPanel';
import { useBotStore } from '@/stores/useBotStore';
import { LogIn, LogOut, Zap, FlaskConical, BookOpen } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TopBarProps {
  onLoginClick: () => void;
}

export function TopBar({ onLoginClick }: TopBarProps) {
  const { user, signOut } = useAuth();
  const { botStatus } = useBotStore();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-base font-bold tracking-tight">
            CryptoEdge <span className="text-primary">AI</span>
          </h1>
        </div>

        {/* Nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {[
            { path: '/', label: '터미널' },
            { path: '/backtest', label: '백테스트', icon: FlaskConical },
            { path: '/journal', label: '저널', icon: BookOpen },
          ].map(({ path, label, icon: Icon }) => (
            <Button
              key={path}
              variant="ghost"
              size="sm"
              className={cn('text-xs gap-1.5', location.pathname === path && 'bg-accent text-foreground')}
              onClick={() => navigate(path)}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {label}
            </Button>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Bot status indicator */}
        {user && <StatusDot status={botStatus} />}

        {user ? (
          <>
            <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-xs">
              <LogOut className="h-3.5 w-3.5" /> 로그아웃
            </Button>
          </>
        ) : (
          <Button variant="default" size="sm" onClick={onLoginClick} className="gap-1.5 text-xs">
            <LogIn className="h-3.5 w-3.5" /> 로그인
          </Button>
        )}
      </div>
    </header>
  );
}
