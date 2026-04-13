import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRunBacktest } from '@/hooks/useBacktest';
import { useBotStore } from '@/stores/useBotStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuthModal } from '@/components/trading/AuthModal';
import { TopBar } from '@/components/trading/TopBar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, ComposedChart, ReferenceLine, BarChart, Bar } from 'recharts';
import { ArrowLeft, Play, Zap, Filter, Activity, BarChart3, Layers, Shield, TrendingDown, FlaskConical, Brain, Clock, AlertTriangle, Target, Gauge } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BacktestConfig } from '@/lib/backtestEngine';

const COINS = ['BTC', 'SOL', 'ETH', 'BNB', 'XRP', 'TRX', 'DOGE', 'HYPE', 'ADA', 'PAXG'];

export default function Backtest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [pair, setPair] = useState('BTC');
  const [period, setPeriod] = useState(30);
  const [leverage, setLeverage] = useState([5]);
  const [rrRatio, setRrRatio] = useState([2]);
  const [riskPercent, setRiskPercent] = useState([1]);
  // Filters
  const [trendFilter, setTrendFilter] = useState(true);
  const [volFilter, setVolFilter] = useState(false);
  const [volMultiplier, setVolMultiplier] = useState([1.0]);
  const [volumeFilter, setVolumeFilter] = useState(false);
  const [volumeThreshold, setVolumeThreshold] = useState([1.5]);
  const [mtfFilter, setMtfFilter] = useState(false);
  const [higherTF, setHigherTF] = useState('4h');
  // Advanced filters
  const [regimeFilter, setRegimeFilter] = useState(false);
  const [costFilter, setCostFilter] = useState(false);
  const [costFilterMax, setCostFilterMax] = useState([30]);
  const [consecLoss, setConsecLoss] = useState(false);
  const [consecLossThreshold, setConsecLossThreshold] = useState([3]);
  const [consecLossReduction, setConsecLossReduction] = useState([50]);
  const [minQuality, setMinQuality] = useState([0]);
  const [timeFilter, setTimeFilter] = useState(false);
  // Execution realism
  const [slippageBps, setSlippageBps] = useState([5]);
  const [dynamicSlippage, setDynamicSlippage] = useState(true);
  const [makerFee, setMakerFee] = useState([2]);
  const [takerFee, setTakerFee] = useState([5]);
  // OOS
  const [oosEnabled, setOosEnabled] = useState(false);
  const [oosSplit, setOosSplit] = useState([30]);

  const backtest = useRunBacktest();
  const { setActivePairs } = useBotStore();

  if (!user) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <TopBar onLoginClick={() => setAuthOpen(true)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">백테스트를 사용하려면 로그인이 필요합니다.</p>
            <Button onClick={() => setAuthOpen(true)}>로그인</Button>
          </div>
        </div>
        <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      </div>
    );
  }

  const run = () => {
    const config: BacktestConfig = {
      pair, periodDays: period, leverage: leverage[0], rrRatio: rrRatio[0], riskPercent: riskPercent[0],
      trendFilterEnabled: trendFilter, volFilterEnabled: volFilter, volFilterMultiplier: volMultiplier[0],
      volumeFilterEnabled: volumeFilter, volumeThreshold: volumeThreshold[0],
      mtfFilterEnabled: mtfFilter, higherTimeframe: higherTF,
      slippageBps: slippageBps[0], dynamicSlippage, makerFeeBps: makerFee[0], takerFeeBps: takerFee[0],
      oosEnabled, oosSplitPct: oosSplit[0],
      regimeFilterEnabled: regimeFilter,
      costFilterEnabled: costFilter,
      costFilterMaxPct: costFilterMax[0],
      consecLossEnabled: consecLoss,
      consecLossThreshold: consecLossThreshold[0],
      consecLossReduction: consecLossReduction[0],
      minSignalQuality: minQuality[0],
      timeFilterEnabled: timeFilter,
    };
    backtest.mutate(config);
  };

  const applyToBot = () => {
    setActivePairs([pair]);
    toast.success('봇 설정에 파라미터가 적용되었습니다');
    navigate('/');
  };

  const r = backtest.data;

  const cumulativeData = r?.trades?.reduce((acc: any[], t: any, i: number) => {
    const prev = i > 0 ? acc[i - 1].cumulative : 0;
    const prevNet = i > 0 ? acc[i - 1].cumulativeNet : 0;
    acc.push({
      date: t.date.split('T')[0],
      cumulative: parseFloat((prev + t.pnl_pct).toFixed(2)),
      cumulativeNet: parseFloat((prevNet + t.pnl_net).toFixed(2)),
      isOOS: t.isOOS,
    });
    return acc;
  }, []) || [];

  const oosBoundaryIdx = cumulativeData.findIndex((d: any) => d.isOOS);

  const regimeColors: Record<string, string> = {
    'trend-up': 'text-emerald-400',
    'trend-down': 'text-red-400',
    'range': 'text-amber-400',
    'high-vol': 'text-orange-400',
    'low-vol': 'text-blue-400',
  };

  const regimeLabels: Record<string, string> = {
    'trend-up': '상승추세',
    'trend-down': '하락추세',
    'range': '횡보',
    'high-vol': '고변동',
    'low-vol': '저변동',
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopBar onLoginClick={() => setAuthOpen(true)} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold">백테스트 엔진 <Badge variant="outline" className="ml-2 text-[9px]">Production-Grade v2</Badge></h2>
          </div>

          {/* Input Form */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">페어 선택</Label>
              <div className="flex flex-wrap gap-1.5">
                {COINS.map(c => (
                  <Badge key={c} variant={pair === c ? 'default' : 'outline'} className={cn('cursor-pointer text-[10px]', pair === c && 'bg-primary text-primary-foreground')} onClick={() => setPair(c)}>{c}</Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">기간</Label>
              <div className="flex gap-2">
                {[7, 30, 90].map(d => (
                  <Button key={d} size="sm" variant={period === d ? 'default' : 'outline'} className="text-xs" onClick={() => setPeriod(d)}>최근 {d}일</Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-[10px] text-muted-foreground">레버리지: {leverage[0]}x</Label>
                <Slider value={leverage} onValueChange={setLeverage} min={1} max={50} step={1} className="mt-1" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">RR: 1:{rrRatio[0]}</Label>
                <Slider value={rrRatio} onValueChange={setRrRatio} min={1} max={5} step={0.5} className="mt-1" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">리스크: {riskPercent[0]}%</Label>
                <Slider value={riskPercent} onValueChange={setRiskPercent} min={0.5} max={5} step={0.5} className="mt-1" />
              </div>
            </div>

            {/* Basic Filters */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">기본 필터</p>

              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-primary" />
                  <Label className="text-[11px] font-medium">Trend Filter (200 EMA)</Label>
                </div>
                <Switch checked={trendFilter} onCheckedChange={setTrendFilter} />
              </div>

              <div className="space-y-2 bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-orange-400" />
                    <Label className="text-[11px] font-medium">Avoid Low Volatility (ATR)</Label>
                  </div>
                  <Switch checked={volFilter} onCheckedChange={setVolFilter} />
                </div>
                {volFilter && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">ATR 임계 배수: {volMultiplier[0].toFixed(1)}x</Label>
                    <Slider value={volMultiplier} onValueChange={setVolMultiplier} min={0.5} max={2.0} step={0.1} className="mt-1" />
                  </div>
                )}
              </div>

              <div className="space-y-2 bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
                    <Label className="text-[11px] font-medium">Volume Confirmation</Label>
                  </div>
                  <Switch checked={volumeFilter} onCheckedChange={setVolumeFilter} />
                </div>
                {volumeFilter && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">볼륨 임계: {volumeThreshold[0].toFixed(1)}x</Label>
                    <Slider value={volumeThreshold} onValueChange={setVolumeThreshold} min={1.0} max={3.0} step={0.1} className="mt-1" />
                  </div>
                )}
              </div>

              <div className="space-y-2 bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-violet-400" />
                    <Label className="text-[11px] font-medium">Multi-Timeframe Filter</Label>
                  </div>
                  <Switch checked={mtfFilter} onCheckedChange={setMtfFilter} />
                </div>
                {mtfFilter && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">상위 TF (50 EMA)</Label>
                    <Select value={higherTF} onValueChange={setHigherTF}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4h">4H</SelectItem>
                        <SelectItem value="1d">1D</SelectItem>
                        <SelectItem value="1w">1W</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Filters */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1">
                <Brain className="h-3 w-3" /> 전략 성능 개선 필터
              </p>

              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5 text-emerald-400" />
                  <Label className="text-[11px] font-medium">시장 국면 분류기</Label>
                </div>
                <Switch checked={regimeFilter} onCheckedChange={setRegimeFilter} />
              </div>

              <div className="space-y-2 bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-yellow-400" />
                    <Label className="text-[11px] font-medium">신호 품질 점수 필터</Label>
                  </div>
                  <Switch checked={minQuality[0] > 0} onCheckedChange={(v) => setMinQuality(v ? [40] : [0])} />
                </div>
                {minQuality[0] > 0 && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">최소 점수: {minQuality[0]}점</Label>
                    <Slider value={minQuality} onValueChange={setMinQuality} min={10} max={80} step={5} className="mt-1" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                  <Label className="text-[11px] font-medium">비용 대비 수익 필터</Label>
                </div>
                <Switch checked={costFilter} onCheckedChange={setCostFilter} />
              </div>
              {costFilter && (
                <div className="bg-muted/50 rounded-lg px-3 py-2">
                  <Label className="text-[10px] text-muted-foreground">최대 비용 비율: {costFilterMax[0]}%</Label>
                  <Slider value={costFilterMax} onValueChange={setCostFilterMax} min={10} max={80} step={5} className="mt-1" />
                </div>
              )}

              <div className="space-y-2 bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-3.5 w-3.5 text-orange-400" />
                    <Label className="text-[11px] font-medium">연속 손실 포지션 축소</Label>
                  </div>
                  <Switch checked={consecLoss} onCheckedChange={setConsecLoss} />
                </div>
                {consecLoss && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">{consecLossThreshold[0]}연패 후</Label>
                      <Slider value={consecLossThreshold} onValueChange={setConsecLossThreshold} min={2} max={6} step={1} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">{consecLossReduction[0]}% 축소</Label>
                      <Slider value={consecLossReduction} onValueChange={setConsecLossReduction} min={20} max={80} step={10} className="mt-1" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-blue-400" />
                  <Label className="text-[11px] font-medium">시간대 자동 필터</Label>
                </div>
                <Switch checked={timeFilter} onCheckedChange={setTimeFilter} />
              </div>
            </div>

            {/* Execution Realism */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1">
                <Shield className="h-3 w-3" /> 실전 체결 모델
              </p>
              <div className="grid grid-cols-2 gap-3 bg-muted/50 rounded-lg px-3 py-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">슬리피지: {slippageBps[0]} bps</Label>
                  <Slider value={slippageBps} onValueChange={setSlippageBps} min={0} max={20} step={1} className="mt-1" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-medium">동적 슬리피지</Label>
                  <Switch checked={dynamicSlippage} onCheckedChange={setDynamicSlippage} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 bg-muted/50 rounded-lg px-3 py-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Maker: {makerFee[0]} bps</Label>
                  <Slider value={makerFee} onValueChange={setMakerFee} min={0} max={10} step={1} className="mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Taker: {takerFee[0]} bps</Label>
                  <Slider value={takerFee} onValueChange={setTakerFee} min={0} max={10} step={1} className="mt-1" />
                </div>
              </div>
            </div>

            {/* OOS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
                  <Label className="text-[11px] font-medium">Out-of-Sample 검증</Label>
                </div>
                <Switch checked={oosEnabled} onCheckedChange={setOosEnabled} />
              </div>
              {oosEnabled && (
                <div className="bg-muted/50 rounded-lg px-3 py-2">
                  <Label className="text-[10px] text-muted-foreground">OOS 비율: {oosSplit[0]}%</Label>
                  <Slider value={oosSplit} onValueChange={setOosSplit} min={10} max={50} step={5} className="mt-1" />
                </div>
              )}
            </div>

            <Button className="w-full" onClick={run} disabled={backtest.isPending}>
              {backtest.isPending ? (
                <div className="flex items-center gap-2"><Skeleton className="h-4 w-4 rounded-full" /> 분석 중...</div>
              ) : (
                <><Play className="h-3.5 w-3.5 mr-1.5" /> 백테스트 실행</>
              )}
            </Button>
          </div>

          {/* Results */}
          {r && (
            <div className="space-y-4">
              {/* === RANKING TABS === */}
              <div className="bg-card border-2 border-primary/20 rounded-xl p-4">
                <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-primary" /> 전략 종합 평가
                </h4>
                <Tabs defaultValue="return" className="w-full">
                  <TabsList className="w-full grid grid-cols-3 h-8">
                    <TabsTrigger value="return" className="text-[10px]">수익률 중심</TabsTrigger>
                    <TabsTrigger value="stability" className="text-[10px]">안정성 중심</TabsTrigger>
                    <TabsTrigger value="practical" className="text-[10px]">실전 적합도</TabsTrigger>
                  </TabsList>

                  <TabsContent value="return">
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className={cn('text-3xl font-black font-mono', r.ranking.returnScore >= 60 ? 'text-emerald-400' : r.ranking.returnScore >= 40 ? 'text-amber-400' : 'text-red-400')}>{r.ranking.returnScore}</span>
                          <span className="text-xs text-muted-foreground">/ 100</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">수익률, 기대값, Profit Factor, 승률을 종합</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[10px]"><span className="text-muted-foreground">순수익:</span> <span className={cn('font-mono', r.total_return_net >= 0 ? 'text-emerald-400' : 'text-red-400')}>{r.total_return_net}%</span></p>
                        <p className="text-[10px]"><span className="text-muted-foreground">기대값:</span> <span className="font-mono">{r.expectancy}%</span></p>
                        <p className="text-[10px]"><span className="text-muted-foreground">PF:</span> <span className="font-mono">{r.profit_factor}</span></p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="stability">
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className={cn('text-3xl font-black font-mono', r.ranking.stabilityScore >= 60 ? 'text-emerald-400' : r.ranking.stabilityScore >= 40 ? 'text-amber-400' : 'text-red-400')}>{r.ranking.stabilityScore}</span>
                          <span className="text-xs text-muted-foreground">/ 100</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">MDD, Sharpe, 연속손실, OOS 일관성을 종합</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[10px]"><span className="text-muted-foreground">MDD:</span> <span className="font-mono text-red-400">{r.max_drawdown}%</span></p>
                        <p className="text-[10px]"><span className="text-muted-foreground">Sharpe:</span> <span className="font-mono">{r.sharpe_ratio}</span></p>
                        <p className="text-[10px]"><span className="text-muted-foreground">연속손실:</span> <span className="font-mono">{r.max_consec_loss}</span></p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="practical">
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className={cn('text-3xl font-black font-mono', r.ranking.practicalScore >= 60 ? 'text-emerald-400' : r.ranking.practicalScore >= 40 ? 'text-amber-400' : 'text-red-400')}>{r.ranking.practicalScore}</span>
                          <span className="text-xs text-muted-foreground">/ 100</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">OOS 수익, 비용 효율, 거래수, MDD를 종합</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[10px]"><span className="text-muted-foreground">OOS수익:</span> <span className="font-mono">{r.oos_return_net}%</span></p>
                        <p className="text-[10px]"><span className="text-muted-foreground">수수료:</span> <span className="font-mono text-amber-400">{r.total_fees}%</span></p>
                        <p className="text-[10px]"><span className="text-muted-foreground">거래수:</span> <span className="font-mono">{r.total_trades}</span></p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Primary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: '총 거래수', value: r.total_trades.toString() },
                  { label: '승률', value: `${r.win_rate}%`, color: r.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400' },
                  { label: '순수익률', value: `${r.total_return_net >= 0 ? '+' : ''}${r.total_return_net}%`, color: r.total_return_net >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'MDD', value: `${r.max_drawdown}%`, color: 'text-red-400' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-card border border-border rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                    <p className={cn('text-lg font-bold font-mono', kpi.color)}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Advanced Metrics */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { label: '기대값', value: `${r.expectancy >= 0 ? '+' : ''}${r.expectancy}%`, color: r.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'PF', value: r.profit_factor.toString(), color: r.profit_factor >= 1.5 ? 'text-emerald-400' : r.profit_factor >= 1 ? 'text-amber-400' : 'text-red-400' },
                  { label: 'Sharpe', value: r.sharpe_ratio.toString(), color: r.sharpe_ratio >= 1 ? 'text-emerald-400' : 'text-amber-400' },
                  { label: '평균 승', value: `+${r.avg_win}%`, color: 'text-emerald-400' },
                  { label: '평균 패', value: `-${r.avg_loss}%`, color: 'text-red-400' },
                  { label: '신호 품질', value: `${r.avg_signal_quality}점`, color: r.avg_signal_quality >= 50 ? 'text-emerald-400' : 'text-amber-400' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-muted/50 border border-border rounded-lg p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">{kpi.label}</p>
                    <p className={cn('text-sm font-bold font-mono', kpi.color)}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Regime Distribution */}
              {r.regime_distribution && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5 text-emerald-400" /> 시장 국면 분포
                  </h4>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(r.regime_distribution).map(([regime, count]) => (
                      <div key={regime} className="text-center">
                        <p className={cn('text-sm font-bold font-mono', regimeColors[regime])}>{count as number}</p>
                        <p className="text-[9px] text-muted-foreground">{regimeLabels[regime] || regime}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* OOS Comparison */}
              {r.oos_enabled && r.oos_trades > 0 && (
                <div className="bg-card border-2 border-emerald-500/30 rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-emerald-400" /> IS vs OOS 비교
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground">IS 승률</p>
                      <p className="text-sm font-bold font-mono">{r.is_win_rate}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground">OOS 승률</p>
                      <p className={cn('text-sm font-bold font-mono', Math.abs(r.oos_win_rate - r.is_win_rate) < 10 ? 'text-emerald-400' : 'text-red-400')}>{r.oos_win_rate}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground">IS 순수익</p>
                      <p className="text-sm font-bold font-mono">{r.is_return_net}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted-foreground">OOS 순수익</p>
                      <p className={cn('text-sm font-bold font-mono', r.oos_return_net >= 0 ? 'text-emerald-400' : 'text-red-400')}>{r.oos_return_net}%</p>
                    </div>
                  </div>
                  {Math.abs(r.oos_win_rate - r.is_win_rate) >= 15 && (
                    <p className="text-[10px] text-red-400 mt-2 text-center">⚠️ IS/OOS 승률 차이 15%p 이상: 과최적화 의심</p>
                  )}
                </div>
              )}

              {/* Filter Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  r.trend_filter_active && { label: 'EMA 필터', value: r.filtered_out_signals, color: 'text-amber-400' },
                  r.vol_filter_active && { label: '변동성 필터', value: r.vol_filtered_signals, color: 'text-orange-400' },
                  r.volume_filter_active && { label: '볼륨 필터', value: r.volume_filtered_signals, color: 'text-cyan-400' },
                  r.mtf_filter_active && { label: 'MTF 필터', value: r.mtf_filtered_signals, color: 'text-violet-400' },
                  r.regime_filtered_signals > 0 && { label: '국면 필터', value: r.regime_filtered_signals, color: 'text-emerald-400' },
                  r.cost_filtered_signals > 0 && { label: '비용 필터', value: r.cost_filtered_signals, color: 'text-red-400' },
                  r.quality_filtered_signals > 0 && { label: '품질 필터', value: r.quality_filtered_signals, color: 'text-yellow-400' },
                  r.time_filtered_signals > 0 && { label: '시간대 필터', value: r.time_filtered_signals, color: 'text-blue-400' },
                ].filter(Boolean).map((item: any, i) => (
                  <div key={i} className="bg-muted/50 border border-border rounded-lg p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">{item.label}</p>
                    <p className={cn('text-sm font-bold font-mono', item.color)}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Time Analysis Chart */}
              {r.time_analysis && r.time_analysis.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-blue-400" /> 시간대별 성과 분석 (UTC)
                  </h4>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={r.time_analysis}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} label={{ value: '시(UTC)', position: 'insideBottomRight', offset: -5, fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                        formatter={(value: any, name: string) => {
                          if (name === 'avgPnl') return [`${value}%`, '평균 PnL'];
                          if (name === 'winRate') return [`${value}%`, '승률'];
                          return [value, name];
                        }}
                      />
                      <Bar dataKey="avgPnl" name="avgPnl" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Equity Curve */}
              {cumulativeData.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3">누적 수익 커브 (Gross vs Net)</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={cumulativeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="cumulative" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="4 2" dot={false} name="Gross" />
                      <Line type="monotone" dataKey="cumulativeNet" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Net" />
                      {oosEnabled && oosBoundaryIdx > 0 && (
                        <ReferenceLine x={cumulativeData[oosBoundaryIdx]?.date} stroke="hsl(150, 80%, 50%)" strokeDasharray="3 3" label={{ value: 'OOS →', fill: 'hsl(150, 80%, 50%)', fontSize: 10 }} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Drawdown */}
              {r.drawdown_series && r.drawdown_series.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-red-400" /> 낙폭 차트
                  </h4>
                  <ResponsiveContainer width="100%" height={150}>
                    <ComposedChart data={r.drawdown_series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                      <Area type="monotone" dataKey="drawdown" fill="hsl(0, 80%, 50%, 0.15)" stroke="hsl(0, 80%, 60%)" strokeWidth={1.5} />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ATR Chart */}
              {r.vol_filter_active && r.atr_series && r.atr_series.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3">ATR 변동성 레벨</h4>
                  <ResponsiveContainer width="100%" height={150}>
                    <ComposedChart data={r.atr_series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                      <Area type="monotone" dataKey="atr" fill="hsl(25, 95%, 53%, 0.15)" stroke="hsl(25, 95%, 53%)" strokeWidth={1.5} />
                      <Line type="monotone" dataKey="atrAvg" stroke="hsl(0, 80%, 60%)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Threshold" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Trade Table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                  <h4 className="text-xs font-semibold">거래 내역</h4>
                  <span className="text-[10px] text-muted-foreground">{r.trades.length}건</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left text-muted-foreground font-medium">날짜</th>
                        <th className="px-2 py-2 text-left text-muted-foreground font-medium">방향</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">체결</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">Vol×</th>
                        <th className="px-2 py-2 text-center text-muted-foreground font-medium">국면</th>
                        <th className="px-2 py-2 text-center text-muted-foreground font-medium">품질</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">Scale</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">Net%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.trades.map((t: any, i: number) => (
                        <tr key={i} className={cn('border-t border-border/50 hover:bg-muted/50', t.isOOS && 'bg-emerald-500/5')}>
                          <td className="px-2 py-1.5 font-mono text-[10px]">{t.date.split('T')[0]}</td>
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className={cn('text-[9px]', t.direction === 'long' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30')}>
                              {t.direction.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-[10px]">{t.entry}</td>
                          <td className={cn('px-2 py-1.5 text-right font-mono text-[10px]', t.vol_ratio >= 1.5 ? 'text-cyan-400' : 'text-muted-foreground')}>{t.vol_ratio}x</td>
                          <td className="px-2 py-1.5 text-center">
                            <Badge variant="outline" className={cn('text-[8px]', regimeColors[t.regime])}>{regimeLabels[t.regime]?.slice(0, 2) || t.regime}</Badge>
                          </td>
                          <td className={cn('px-2 py-1.5 text-center font-mono text-[10px]', t.signalQuality >= 60 ? 'text-emerald-400' : t.signalQuality >= 40 ? 'text-amber-400' : 'text-muted-foreground')}>{t.signalQuality}</td>
                          <td className={cn('px-2 py-1.5 text-right font-mono text-[10px]', t.positionScale < 1 ? 'text-orange-400' : 'text-muted-foreground')}>{t.positionScale < 1 ? `${(t.positionScale * 100).toFixed(0)}%` : '100%'}</td>
                          <td className={cn('px-2 py-1.5 text-right font-mono text-[10px] font-semibold', t.pnl_net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {t.pnl_net >= 0 ? '+' : ''}{t.pnl_net}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Button className="w-full" variant="outline" onClick={applyToBot}>
                <Zap className="h-3.5 w-3.5 mr-1.5" /> 이 전략 봇에 적용
              </Button>
            </div>
          )}
        </div>
      </div>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
