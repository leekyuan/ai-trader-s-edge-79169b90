// ============================================================
// useSupabaseSignals — Supabase 저장 + Realtime 구독
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Signal } from '../engine/indicators';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function useSupabaseSignals() {
  const [dbSignals, setDbSignals] = useState<Signal[]>([]);
  const [connected, setConnected] = useState(false);

  // ── 최근 50개 신호 로드 ───────────────────────────────
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('trading_signals')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);
      if (!error && data) {
        setDbSignals(data.map(mapRow));
        setConnected(true);
      }
    }
    load();

    // Realtime 구독
    const channel = supabase
      .channel('trading_signals')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trading_signals',
      }, (payload) => {
        setDbSignals(prev => [mapRow(payload.new), ...prev].slice(0, 50));
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trading_signals',
      }, (payload) => {
        setDbSignals(prev => prev.map(s => s.id === payload.new.id ? mapRow(payload.new) : s));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── 신호 저장 ─────────────────────────────────────────
  const saveSignal = useCallback(async (signal: Signal) => {
    const { error } = await supabase.from('trading_signals').insert({
      id: signal.id,
      symbol: signal.symbol,
      direction: signal.direction,
      strength: signal.strength,
      entry1: signal.entry1,
      entry2: signal.entry2,
      tp1: signal.tp1,
      tp2: signal.tp2,
      sl1: signal.sl1,
      sl2: signal.sl2,
      rr_ratio: signal.rrRatio,
      reasons: signal.reasons,
      indicators: signal.indicators,
      timestamp: signal.timestamp,
      status: signal.status,
    });
    if (error) console.warn('Signal save failed:', error.message);
  }, []);

  // ── 신호 상태 업데이트 ────────────────────────────────
  const updateSignalStatus = useCallback(async (id: string, status: Signal['status']) => {
    await supabase
      .from('trading_signals')
      .update({ status })
      .eq('id', id);
  }, []);

  return { dbSignals, connected, saveSignal, updateSignalStatus };
}

function mapRow(row: Record<string, unknown>): Signal {
  return {
    id: row.id as string,
    symbol: row.symbol as string,
    direction: row.direction as 'LONG' | 'SHORT',
    strength: row.strength as number,
    entry1: row.entry1 as number,
    entry2: row.entry2 as number,
    tp1: row.tp1 as number,
    tp2: row.tp2 as number,
    sl1: row.sl1 as number,
    sl2: row.sl2 as number,
    rrRatio: row.rr_ratio as number,
    reasons: row.reasons as string[],
    indicators: row.indicators as Signal['indicators'],
    timestamp: row.timestamp as number,
    status: row.status as Signal['status'],
  };
}
