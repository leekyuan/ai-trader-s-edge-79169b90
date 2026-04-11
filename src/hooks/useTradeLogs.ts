import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useTradeLogs(status?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['trade-logs', user?.id, status],
    queryFn: async () => {
      let query = supabase
        .from('trade_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useTradeStats(days: number = 30) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['trade-stats', user?.id, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from('trade_logs')
        .select('*')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      const closed = (data || []).filter(t => t.status === 'closed' || t.status === 'be');
      const wins = closed.filter(t => (t.pnl_pct || 0) > 0);
      const totalPnl = closed.reduce((sum, t) => sum + (t.pnl_pct || 0), 0);
      const avgRR = closed.length > 0
        ? closed.reduce((sum, t) => {
            const rr = t.tp && t.sl && t.entry_price
              ? Math.abs(Number(t.tp) - Number(t.entry_price)) / Math.abs(Number(t.entry_price) - Number(t.sl))
              : 0;
            return sum + rr;
          }, 0) / closed.length
        : 0;

      // MDD calculation
      let peak = 0, mdd = 0, cumulative = 0;
      closed.forEach(t => {
        cumulative += t.pnl_pct || 0;
        if (cumulative > peak) peak = cumulative;
        const dd = peak - cumulative;
        if (dd > mdd) mdd = dd;
      });

      // Daily PnL for chart
      const dailyMap = new Map<string, number>();
      closed.forEach(t => {
        const day = (t.closed_at || t.created_at).split('T')[0];
        dailyMap.set(day, (dailyMap.get(day) || 0) + (t.pnl_pct || 0));
      });
      const dailyPnL = Array.from(dailyMap.entries()).map(([date, pnl]) => ({ date, pnl }));

      // Pair breakdown
      const pairMap = new Map<string, number>();
      closed.forEach(t => {
        pairMap.set(t.pair, (pairMap.get(t.pair) || 0) + (t.pnl_usdt || 0));
      });
      const pairBreakdown = Array.from(pairMap.entries()).map(([pair, pnl]) => ({ pair, pnl }));

      return {
        totalTrades: closed.length,
        winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
        totalPnl,
        mdd,
        avgRR,
        dailyPnL,
        pairBreakdown,
        trades: data || [],
      };
    },
    enabled: !!user,
  });
}
