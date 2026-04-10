import { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Settings, Save } from 'lucide-react';
import { useUserSettings } from '@/hooks/useUserSettings';

interface StrategyPanelProps {
  entryPrice: number;
  atr: number;
  onSLTPChange: (sl: number, tp: number) => void;
}

export function StrategyPanel({ entryPrice, atr, onSLTPChange }: StrategyPanelProps) {
  const { settings, saveSettings, isSaving } = useUserSettings();
  const [strategyType, setStrategyType] = useState(settings.strategy_type);
  const [rrRatio, setRrRatio] = useState([settings.rr_ratio]);
  const [atrSlMul, setAtrSlMul] = useState([settings.atr_sl_multiplier]);
  const [atrTpMul, setAtrTpMul] = useState([settings.atr_tp_multiplier]);
  const [breakevenEnabled, setBreakevenEnabled] = useState(settings.breakeven_enabled);
  const [breakevenPct, setBreakevenPct] = useState([settings.breakeven_trigger_pct]);
  const [fastapiUrl, setFastapiUrl] = useState(settings.fastapi_url);

  // Sync from loaded settings
  useEffect(() => {
    setStrategyType(settings.strategy_type);
    setRrRatio([settings.rr_ratio]);
    setAtrSlMul([settings.atr_sl_multiplier]);
    setAtrTpMul([settings.atr_tp_multiplier]);
    setBreakevenEnabled(settings.breakeven_enabled);
    setBreakevenPct([settings.breakeven_trigger_pct]);
    setFastapiUrl(settings.fastapi_url);
  }, [settings]);

  // Auto-calculate SL/TP when strategy or params change
  useEffect(() => {
    if (!entryPrice) return;

    if (strategyType === 'fixed_rr') {
      // Fixed R:R — SL is a fixed distance, TP = SL distance * ratio
      // Use ATR as default SL distance if available, otherwise 1% of entry
      const slDist = atr > 0 ? atr : entryPrice * 0.01;
      const sl = entryPrice - slDist;
      const tp = entryPrice + slDist * rrRatio[0];
      onSLTPChange(sl, tp);
    } else {
      // ATR-based
      if (atr > 0) {
        const sl = entryPrice - atrSlMul[0] * atr;
        const tp = entryPrice + atrTpMul[0] * atr;
        onSLTPChange(sl, tp);
      }
    }
  }, [strategyType, entryPrice, atr, rrRatio, atrSlMul, atrTpMul, onSLTPChange]);

  const handleSave = () => {
    saveSettings({
      strategy_type: strategyType,
      rr_ratio: rrRatio[0],
      atr_sl_multiplier: atrSlMul[0],
      atr_tp_multiplier: atrTpMul[0],
      breakeven_enabled: breakevenEnabled,
      breakeven_trigger_pct: breakevenPct[0],
      fastapi_url: fastapiUrl,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Settings className="h-3.5 w-3.5 text-primary" />
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">전략 설정</h4>
        </div>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={handleSave} disabled={isSaving}>
          <Save className="h-3 w-3 mr-1" />
          저장
        </Button>
      </div>

      <Tabs value={strategyType} onValueChange={setStrategyType}>
        <TabsList className="w-full h-7">
          <TabsTrigger value="fixed_rr" className="text-[10px] flex-1">Fixed R:R</TabsTrigger>
          <TabsTrigger value="atr_based" className="text-[10px] flex-1">ATR-based</TabsTrigger>
        </TabsList>

        <TabsContent value="fixed_rr" className="mt-2 space-y-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">R:R 비율: 1:{rrRatio[0].toFixed(1)}</Label>
            <Slider value={rrRatio} onValueChange={setRrRatio} min={1} max={5} step={0.1} className="mt-1" />
          </div>
        </TabsContent>

        <TabsContent value="atr_based" className="mt-2 space-y-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">SL: {atrSlMul[0]}× ATR</Label>
            <Slider value={atrSlMul} onValueChange={setAtrSlMul} min={0.5} max={5} step={0.5} className="mt-1" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">TP: {atrTpMul[0]}× ATR</Label>
            <Slider value={atrTpMul} onValueChange={setAtrTpMul} min={1} max={10} step={0.5} className="mt-1" />
          </div>
          <div className="bg-muted rounded p-2 text-[10px] font-mono text-muted-foreground">
            ATR(14): {atr > 0 ? atr.toFixed(2) : '로딩 중...'}
          </div>
        </TabsContent>
      </Tabs>

      {/* Breakeven Stop */}
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-muted-foreground">Breakeven Stop</Label>
        <Switch checked={breakevenEnabled} onCheckedChange={setBreakevenEnabled} />
      </div>
      {breakevenEnabled && (
        <div>
          <Label className="text-[10px] text-muted-foreground">트리거: +{breakevenPct[0].toFixed(1)}% 시 활성화</Label>
          <Slider value={breakevenPct} onValueChange={setBreakevenPct} min={0.5} max={5} step={0.1} className="mt-1" />
        </div>
      )}

      {/* FastAPI URL */}
      <div>
        <Label className="text-[10px] text-muted-foreground">FastAPI 엔드포인트 URL</Label>
        <Input
          value={fastapiUrl}
          onChange={(e) => setFastapiUrl(e.target.value)}
          placeholder="https://your-server.com"
          className="h-7 text-[10px] font-mono mt-0.5"
        />
      </div>
    </div>
  );
}
