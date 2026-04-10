import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

interface TradePayload {
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  quantity: number;
  leverage: number;
  margin_mode: 'isolated' | 'cross';
  strategy_type: string;
  breakeven_enabled: boolean;
  breakeven_trigger_pct: number;
}

export function useTradeExecute(fastapiUrl: string) {
  return useMutation({
    mutationFn: async (payload: TradePayload) => {
      if (!fastapiUrl) throw new Error('FastAPI URL이 설정되지 않았습니다');
      const url = fastapiUrl.replace(/\/+$/, '') + '/trade/execute';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => toast.success('주문이 성공적으로 전송되었습니다'),
    onError: (err: Error) => toast.error(`주문 실패: ${err.message}`),
  });
}
