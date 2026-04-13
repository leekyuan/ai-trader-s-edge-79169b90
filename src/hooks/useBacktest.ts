import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { runBacktest, type BacktestConfig, type BacktestResult } from '@/lib/backtestEngine';

export type { BacktestConfig, BacktestResult };

export function useRunBacktest() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: BacktestConfig): Promise<BacktestResult> => {
      const result = await runBacktest(params);

      if (user) {
        await supabase.from('backtest_results').insert({
          user_id: user.id,
          pair: result.pair,
          period_days: result.period_days,
          params: result.params as any,
          total_trades: result.total_trades,
          win_rate: result.win_rate,
          total_return: result.total_return_net,
          max_drawdown: result.max_drawdown,
          trades: result.trades as any,
        });
      }

      return result;
    },
  });
}

export function useBacktestHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['backtest-history', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('backtest_results').select('*').order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
