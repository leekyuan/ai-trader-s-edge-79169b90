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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuthModal } from '@/components/trading/AuthModal';
import { TopBar } from '@/components/trading/TopBar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, ComposedChart, ReferenceLine } from 'recharts';
import { ArrowLeft, Play, Zap, Filter, Activity, BarChart3, Layers, Shield, TrendingDown, FlaskConical } from 'lucide-react';
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

  // Split IS/OOS boundary for chart
  const oosBoundaryIdx = cumulativeData.findIndex((d: any) => d.isOOS);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopBar onLoginClick={() => setAuthOpen(true)} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold">백테스트 엔진 <Badge variant="outline" className="ml-2 text-[9px]">Production-Grade</Badge></h2>
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

            {/* Filters */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">필터 설정</p>

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
                    <Label className="text-[11px] font-medium">Require Volume Confirmation</Label>
                  </div>
                  <Switch checked={volumeFilter} onCheckedChange={setVolumeFilter} />
                </div>
                {volumeFilter && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">볼륨 임계 배수: {volumeThreshold[0].toFixed(1)}x</Label>
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
                    <Label className="text-[10px] text-muted-foreground mb-1 block">상위 타임프레임 (50 EMA)</Label>
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

            {/* Execution Realism */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1">
                <Shield className="h-3 w-3" /> 실전 체결 모델
              </p>

              <div className="grid grid-cols-2 gap-3 bg-muted/50 rounded-lg px-3 py-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">슬리피지: {slippageBps[0]} bps ({(slippageBps[0] / 100).toFixed(2)}%)</Label>
                  <Slider value={slippageBps} onValueChange={setSlippageBps} min={0} max={20} step={1} className="mt-1" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-medium">동적 슬리피지 (ATR 기반)</Label>
                  <Switch checked={dynamicSlippage} onCheckedChange={setDynamicSlippage} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-muted/50 rounded-lg px-3 py-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Maker 수수료: {makerFee[0]} bps</Label>
                  <Slider value={makerFee} onValueChange={setMakerFee} min={0} max={10} step={1} className="mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Taker 수수료: {takerFee[0]} bps</Label>
                  <Slider value={takerFee} onValueChange={setTakerFee} min={0} max={10} step={1} className="mt-1" />
                </div>
              </div>
            </div>

            {/* OOS Validation */}
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
                  <Label className="text-[10px] text-muted-foreground">OOS 비율: {oosSplit[0]}% (마지막 {oosSplit[0]}% 데이터)</Label>
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
              {/* Primary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: '총 거래수', value: r.total_trades.toString() },
                  { label: '승률', value: `${r.win_rate}%`, color: r.win_rate >= 50 ? 'text-emerald-400' : 'text-red-400' },
                  { label: '순수익률 (수수료 후)', value: `${r.total_return_net >= 0 ? '+' : ''}${r.total_return_net}%`, color: r.total_return_net >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: '최대 낙폭 (MDD)', value: `${r.max_drawdown}%`, color: 'text-red-400' },
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
                  { label: '기대값/거래', value: `${r.expectancy >= 0 ? '+' : ''}${r.expectancy}%`, color: r.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Profit Factor', value: r.profit_factor.toString(), color: r.profit_factor >= 1.5 ? 'text-emerald-400' : r.profit_factor >= 1 ? 'text-amber-400' : 'text-red-400' },
                  { label: 'Sharpe Ratio', value: r.sharpe_ratio.toString(), color: r.sharpe_ratio >= 1 ? 'text-emerald-400' : 'text-amber-400' },
                  { label: '평균 승리', value: `+${r.avg_win}%`, color: 'text-emerald-400' },
                  { label: '평균 손실', value: `-${r.avg_loss}%`, color: 'text-red-400' },
                  { label: '최대 연속 손실', value: r.max_consec_loss.toString() },
                ].map((kpi, i) => (
                  <div key={i} className="bg-muted/50 border border-border rounded-lg p-2 text-center">
                    <p className="text-[9px] text-muted-foreground">{kpi.label}</p>
                    <p className={cn('text-sm font-bold font-mono', kpi.color)}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Execution Cost Summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card border border-border rounded-lg p-2 text-center">
                  <p className="text-[9px] text-muted-foreground">총 수수료 비용</p>
                  <p className="text-sm font-bold font-mono text-amber-400">{r.total_fees}%</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-2 text-center">
                  <p className="text-[9px] text-muted-foreground">그로스 → 넷 차이</p>
                  <p className="text-sm font-bold font-mono text-amber-400">{(r.total_return - r.total_return_net).toFixed(2)}%</p>
                </div>
              </div>

              {/* OOS Comparison */}
              {r.oos_enabled && r.oos_trades > 0 && (
                <div className="bg-card border-2 border-emerald-500/30 rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
                    In-Sample vs Out-of-Sample 비교
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
                    <p className="text-[10px] text-red-400 mt-2 text-center">⚠️ IS/OOS 승률 차이가 15%p 이상: 과최적화 의심</p>
                  )}
                </div>
              )}

              {/* Filter Stats */}
              {(r.trend_filter_active || r.vol_filter_active || r.volume_filter_active || r.mtf_filter_active) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {r.trend_filter_active && (
                    <div className="bg-muted/50 border border-border rounded-lg p-2 text-center">
                      <p className="text-[9px] text-muted-foreground">EMA 필터링</p>
                      <p className="text-sm font-bold font-mono text-amber-400">{r.filtered_out_signals}</p>
                    </div>
                  )}
                  {r.vol_filter_active && (
                    <div className="bg-muted/50 border border-border rounded-lg p-2 text-center">
                      <p className="text-[9px] text-muted-foreground">변동성 필터링</p>
                      <p className="text-sm font-bold font-mono text-orange-400">{r.vol_filtered_signals}</p>
                    </div>
                  )}
                  {r.volume_filter_active && (
                    <div className="bg-muted/50 border border-border rounded-lg p-2 text-center">
                      <p className="text-[9px] text-muted-foreground">볼륨 필터링</p>
                      <p className="text-sm font-bold font-mono text-cyan-400">{r.volume_filtered_signals}</p>
                    </div>
                  )}
                  {r.mtf_filter_active && (
                    <div className="bg-muted/50 border border-border rounded-lg p-2 text-center">
                      <p className="text-[9px] text-muted-foreground">MTF 필터링</p>
                      <p className="text-sm font-bold font-mono text-violet-400">{r.mtf_filtered_signals}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Volume & MTF insight stats */}
              {(r.volume_filter_active || r.mtf_filter_active) && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {r.volume_filter_active && (
                    <>
                      <div className="bg-card border border-border rounded-lg p-2 text-center">
                        <p className="text-[9px] text-muted-foreground">승리 평균 볼륨 비율</p>
                        <p className="text-sm font-bold font-mono text-emerald-400">{r.avg_vol_ratio_wins}x</p>
                      </div>
                      <div className="bg-card border border-border rounded-lg p-2 text-center">
                        <p className="text-[9px] text-muted-foreground">패배 평균 볼륨 비율</p>
                        <p className="text-sm font-bold font-mono text-red-400">{r.avg_vol_ratio_losses}x</p>
                      </div>
                    </>
                  )}
                  {r.mtf_filter_active && (
                    <div className="bg-card border border-border rounded-lg p-2 text-center">
                      <p className="text-[9px] text-muted-foreground">MTF 정렬률</p>
                      <p className="text-sm font-bold font-mono text-violet-400">{r.mtf_alignment_rate}%</p>
                    </div>
                  )}
                </div>
              )}

              {/* Cumulative Equity Curve (Gross vs Net) */}
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
                      <Line type="monotone" dataKey="cumulativeNet" stroke={r.trend_filter_active ? 'hsl(150, 80%, 50%)' : 'hsl(var(--primary))'} strokeWidth={2} dot={false} name="Net" />
                      {oosEnabled && oosBoundaryIdx > 0 && (
                        <ReferenceLine x={cumulativeData[oosBoundaryIdx]?.date} stroke="hsl(150, 80%, 50%)" strokeDasharray="3 3" label={{ value: 'OOS →', fill: 'hsl(150, 80%, 50%)', fontSize: 10 }} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Drawdown Chart */}
              {r.drawdown_series && r.drawdown_series.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3 flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-red-400" /> 낙폭 (Drawdown) 차트
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

              {/* Trades Table */}
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
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">신호가</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">체결가</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">청산</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">Vol×</th>
                        <th className="px-2 py-2 text-right text-muted-foreground font-medium">Net%</th>
                        {oosEnabled && <th className="px-2 py-2 text-center text-muted-foreground font-medium">구간</th>}
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
                          <td className="px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">{t.signalPrice}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[10px]">{t.entry}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[10px]">{t.exit}</td>
                          <td className={cn('px-2 py-1.5 text-right font-mono text-[10px]', t.vol_ratio >= 1.5 ? 'text-cyan-400' : 'text-muted-foreground')}>{t.vol_ratio}x</td>
                          <td className={cn('px-2 py-1.5 text-right font-mono text-[10px] font-semibold', t.pnl_net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {t.pnl_net >= 0 ? '+' : ''}{t.pnl_net}%
                          </td>
                          {oosEnabled && (
                            <td className="px-2 py-1.5 text-center">
                              <Badge variant="outline" className={cn('text-[8px]', t.isOOS ? 'text-emerald-400 border-emerald-500/30' : 'text-muted-foreground')}>
                                {t.isOOS ? 'OOS' : 'IS'}
                              </Badge>
                            </td>
                          )}
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
