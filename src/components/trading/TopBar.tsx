import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { LogIn, LogOut, Zap } from 'lucide-react';

interface TopBarProps {
  onLoginClick: () => void;
}

export function TopBar({ onLoginClick }: TopBarProps) {
  const { user, signOut } = useAuth();

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" />
        <h1 className="text-base font-bold tracking-tight">
          CryptoEdge <span className="text-primary">AI</span>
        </h1>
      </div>
      <div className="flex items-center gap-2">
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
