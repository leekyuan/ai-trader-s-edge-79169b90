import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface UserSettings {
  strategy_type: string;
  rr_ratio: number;
  atr_sl_multiplier: number;
  atr_tp_multiplier: number;
  breakeven_enabled: boolean;
  breakeven_trigger_pct: number;
  fastapi_url: string;
}

const DEFAULTS: UserSettings = {
  strategy_type: 'fixed_rr',
  rr_ratio: 2.0,
  atr_sl_multiplier: 2.0,
  atr_tp_multiplier: 4.0,
  breakeven_enabled: false,
  breakeven_trigger_pct: 1.0,
  fastapi_url: '',
};

export function useUserSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['user_settings', user?.id],
    queryFn: async () => {
      if (!user) return DEFAULTS;
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULTS;
      return {
        strategy_type: data.strategy_type,
        rr_ratio: Number(data.rr_ratio),
        atr_sl_multiplier: Number(data.atr_sl_multiplier),
        atr_tp_multiplier: Number(data.atr_tp_multiplier),
        breakeven_enabled: data.breakeven_enabled,
        breakeven_trigger_pct: Number(data.breakeven_trigger_pct),
        fastapi_url: data.fastapi_url || '',
      } as UserSettings;
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (settings: Partial<UserSettings>) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, ...settings } as any, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_settings', user?.id] }),
  });

  return {
    settings: query.data ?? DEFAULTS,
    isLoading: query.isLoading,
    saveSettings: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
