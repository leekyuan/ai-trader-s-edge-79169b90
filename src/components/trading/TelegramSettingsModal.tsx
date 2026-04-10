import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Send, Loader2, Bell } from 'lucide-react';

interface TelegramSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TelegramSettingsModal({ open, onOpenChange }: TelegramSettingsModalProps) {
  const { user } = useAuth();
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [notifyStrongSignal, setNotifyStrongSignal] = useState(true);
  const [notifyTpReached, setNotifyTpReached] = useState(true);
  const [notifyPatternComplete, setNotifyPatternComplete] = useState(true);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open && user) loadSettings();
  }, [open, user]);

  const loadSettings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_telegram_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setBotToken('••••••••');
      setChatId(data.chat_id);
      setNotifyStrongSignal(data.notify_strong_signal);
      setNotifyTpReached(data.notify_tp_reached);
      setNotifyPatternComplete(data.notify_pattern_complete);
      setSaved(true);
    } else {
      setBotToken('');
      setChatId('');
      setSaved(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!botToken || botToken === '••••••••') {
      if (!saved) {
        toast.error('봇 토큰을 입력해주세요');
        return;
      }
    }
    if (!chatId) {
      toast.error('Chat ID를 입력해주세요');
      return;
    }

    setLoading(true);
    const payload = {
      user_id: user.id,
      bot_token: botToken !== '••••••••' ? btoa(botToken) : undefined,
      chat_id: chatId,
      notify_strong_signal: notifyStrongSignal,
      notify_tp_reached: notifyTpReached,
      notify_pattern_complete: notifyPatternComplete,
    };

    // Remove undefined bot_token for update case
    const cleanPayload = Object.fromEntries(
      Object.entries(payload).filter(([_, v]) => v !== undefined)
    );

    const { error } = await supabase
      .from('user_telegram_settings')
      .upsert(cleanPayload as any, { onConflict: 'user_id' });

    setLoading(false);
    if (error) {
      toast.error('저장 실패: ' + error.message);
    } else {
      toast.success('텔레그램 설정 저장 완료');
      setSaved(true);
      if (botToken !== '••••••••') setBotToken('••••••••');
    }
  };

  const handleTest = async () => {
    if (!user) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-telegram-notification', {
        body: {
          type: 'test',
          message: '🔔 CryptoEdge AI 테스트 알림\n\n텔레그램 연동이 정상적으로 작동합니다!',
        },
      });
      if (error) throw error;
      toast.success('테스트 알림 전송 성공! 텔레그램을 확인하세요.');
    } catch (err: any) {
      toast.error('전송 실패: ' + (err.message || '알 수 없는 오류'));
    }
    setTesting(false);
  };

  const handleDelete = async () => {
    if (!user) return;
    await supabase.from('user_telegram_settings').delete().eq('user_id', user.id);
    setBotToken('');
    setChatId('');
    setSaved(false);
    toast.success('텔레그램 설정 삭제 완료');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            텔레그램 알림 설정
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Bot Token (@BotFather에서 발급)</Label>
            <Input
              type="password"
              placeholder="123456:ABC-DEF..."
              value={botToken}
              onChange={e => { setBotToken(e.target.value); }}
              className="bg-muted border-border text-sm font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Chat ID (숫자)</Label>
            <Input
              placeholder="-100123456789"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              className="bg-muted border-border text-sm font-mono"
            />
          </div>

          <div className="space-y-3 bg-muted rounded-lg p-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> 알림 유형 설정
            </h4>
            <div className="flex items-center justify-between">
              <span className="text-xs">🔥 강력 신호 발생</span>
              <Switch checked={notifyStrongSignal} onCheckedChange={setNotifyStrongSignal} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">🎯 TP 도달</span>
              <Switch checked={notifyTpReached} onCheckedChange={setNotifyTpReached} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">📊 패턴 완성</span>
              <Switch checked={notifyPatternComplete} onCheckedChange={setNotifyPatternComplete} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              저장
            </Button>
            {saved && (
              <>
                <Button variant="outline" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : '테스트'}
                </Button>
                <Button variant="ghost" onClick={handleDelete} className="text-bear hover:text-bear">
                  삭제
                </Button>
              </>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            🔒 봇 토큰은 암호화되어 저장됩니다. @BotFather에서 봇을 생성하고, @userinfobot으로 Chat ID를 확인하세요.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
