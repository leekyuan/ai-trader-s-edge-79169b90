import { create } from 'zustand';

export type BotStatus = 'idle' | 'scanning' | 'in_position' | 'paused';

interface BotState {
  botStatus: BotStatus;
  activePairs: string[];
  dailyLossLimit: number;
  dailyPnL: number;
  trailingStopEnabled: boolean;
  trailingStopDistance: number;
  partialTpEnabled: boolean;
  partialTpRatio: number; // % to close at TP1
  setBotStatus: (s: BotStatus) => void;
  setActivePairs: (p: string[]) => void;
  setDailyLossLimit: (v: number) => void;
  setDailyPnL: (v: number) => void;
  setTrailingStopEnabled: (v: boolean) => void;
  setTrailingStopDistance: (v: number) => void;
  setPartialTpEnabled: (v: boolean) => void;
  setPartialTpRatio: (v: number) => void;
}

export const useBotStore = create<BotState>((set) => ({
  botStatus: 'idle',
  activePairs: ['BTC', 'ETH'],
  dailyLossLimit: 3,
  dailyPnL: 0,
  trailingStopEnabled: false,
  trailingStopDistance: 1,
  partialTpEnabled: false,
  partialTpRatio: 50,
  setBotStatus: (s) => set({ botStatus: s }),
  setActivePairs: (p) => set({ activePairs: p }),
  setDailyLossLimit: (v) => set({ dailyLossLimit: v }),
  setDailyPnL: (v) => set({ dailyPnL: v }),
  setTrailingStopEnabled: (v) => set({ trailingStopEnabled: v }),
  setTrailingStopDistance: (v) => set({ trailingStopDistance: v }),
  setPartialTpEnabled: (v) => set({ partialTpEnabled: v }),
  setPartialTpRatio: (v) => set({ partialTpRatio: v }),
}));
