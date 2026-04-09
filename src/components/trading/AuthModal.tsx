import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    const { error } = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);

    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      if (mode === 'signup') {
        toast.success('회원가입 완료! 이메일을 확인해주세요.');
      } else {
        toast.success('로그인 성공!');
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'login' ? '로그인' : '회원가입'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs">이메일</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">비밀번호</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="mt-1" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </Button>
        </form>
        <div className="text-center">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
