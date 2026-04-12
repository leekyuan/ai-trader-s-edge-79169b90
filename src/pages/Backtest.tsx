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
import { AuthModal } from '@/components/trading/AuthModal';
import { TopBar } from '@/components/trading/TopBar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Area, ComposedChart } from 'recharts';
import { ArrowLeft, Play, Zap, Filter, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [trendFilter, setTrendFilter] = useState(true);
  const [volFilter, setVolFilter] = useState(false);
  const [volMultiplier, setVolMultiplier] = useState([1.0]);

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
    backtest.mutate({ pair, periodDays: period, leverage: leverage[0], rrRatio: rrRatio[0], riskPercent: riskPercent[0], trendFilterEnabled: trendFilter, volFilterEnabled: volFilter, volFilterMultiplier: volMultiplier[0] });
  };

  const applyToBot = () => {
    setActivePairs([pair]);
    toast.success('봇 설정에 파라미터가 적용되었습니다');
    navigate('/');
  };

  const result = backtest.data;

  // Build cumulative return for chart
  const cumulativeData = result?.trades?.reduce((acc: any[], t: any, i: number) => {
    const prev = i > 0 ? acc[i - 1].cumulative : 0;
    acc.push({ date: t.date.split('T')[0], cumulative: parseFloat((prev + t.pnl_pct).toFixed(2)) });
    return acc;
  }, []) || [];

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopBar onLoginClick={() => setAuthOpen(true)} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold">백테스트 엔진</h2>
          </div>

          {/* Input Form */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">페어 선택</Label>
              <div className="flex flex-wrap gap-1.5">
                {COINS.map(c => (
                  <Badge key={c} variant={pair === c ? 'default' : 'outline'} className={cn('cursor-pointer text-[10px]', pair === c && 'bg-primary text-primary-foreground')} onClick={() => setPair(c)}>
                    {c}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">기간</Label>
              <div className="flex gap-2">
                {[7, 30, 90].map(d => (
                  <Button key={d} size="sm" variant={period === d ? 'default' : 'outline'} className="text-xs" onClick={() => setPeriod(d)}>
                    최근 {d}일
                  </Button>
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

            {/* Trend Filter Toggle */}
            <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-primary" />
                <Label className="text-[11px] font-medium">Trend Filter (200 EMA)</Label>
              </div>
              <Switch checked={trendFilter} onCheckedChange={setTrendFilter} />
            </div>

            {/* Volatility Filter Toggle */}
            <div className="space-y-2 bg-muted/50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-orange-400" />
                  <Label className="text-[11px] font-medium">Avoid Low Volatility (ATR Filter)</Label>
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

            <Button className="w-full" onClick={run} disabled={backtest.isPending}>
              {backtest.isPending ? (
                <div className="flex items-center gap-2"><Skeleton className="h-4 w-4 rounded-full" /> 분석 중...</div>
              ) : (
                <><Play className="h-3.5 w-3.5 mr-1.5" /> 백테스트 실행</>
              )}
            </Button>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                  { label: '총 거래수', value: result.total_trades.toString() },
                  { label: '승률', value: `${result.win_rate}%`, color: result.win_rate >= 50 ? 'price-up' : 'price-down' },
                  { label: '총 수익률', value: `${result.total_return >= 0 ? '+' : ''}${result.total_return}%`, color: result.total_return >= 0 ? 'price-up' : 'price-down' },
                  { label: '최대 연속 손실', value: result.max_consec_loss?.toString() || '0' },
                  ...(result.trend_filter_active ? [{ label: 'EMA 필터링', value: result.filtered_out_signals?.toString() || '0', color: 'text-amber-400' }] : []),
                  ...(result.vol_filter_active ? [{ label: '변동성 필터링', value: result.vol_filtered_signals?.toString() || '0', color: 'text-orange-400' }] : []),
                ].map((kpi, i) => (
                  <div key={i} className="bg-card border border-border rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                    <p className={cn('text-lg font-bold font-mono', kpi.color)}>{kpi.value}</p>
                  </div>
                ))}
                </div>

              {/* ATR Volatility Chart */}
              {result.vol_filter_active && result.atr_series && result.atr_series.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3">ATR 변동성 레벨</h4>
                  <ResponsiveContainer width="100%" height={150}>
                    <ComposedChart data={result.atr_series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                      <Area type="monotone" dataKey="atr" fill="hsl(25, 95%, 53%, 0.15)" stroke="hsl(25, 95%, 53%)" strokeWidth={1.5} />
                      <Line type="monotone" dataKey="atrAvg" stroke="hsl(0, 80%, 60%)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="Threshold" />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="text-[9px] text-muted-foreground mt-1">주황: ATR(14) / 빨강 점선: 임계값 (20MA × {volMultiplier[0].toFixed(1)}x)</p>
                </div>
              )}

              {/* Cumulative Chart */}
              {cumulativeData.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3">누적 수익 커브</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={cumulativeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="cumulative" stroke={result.trend_filter_active ? 'hsl(150, 80%, 50%)' : 'hsl(var(--primary))'} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Trades Table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                  <h4 className="text-xs font-semibold">거래 내역</h4>
                  <span className="text-[10px] text-muted-foreground">{result.trades.length}건</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">날짜</th>
                        <th className="px-3 py-2 text-left text-muted-foreground font-medium">방향</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">진입</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">청산</th>
                        <th className="px-3 py-2 text-right text-muted-foreground font-medium">PnL%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trades.map((t: any, i: number) => (
                        <tr key={i} className="border-t border-border/50 hover:bg-muted/50">
                          <td className="px-3 py-1.5 font-mono">{t.date.split('T')[0]}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline" className={cn('text-[9px]', t.direction === 'long' ? 'text-bull border-bull/30' : 'text-bear border-bear/30')}>
                              {t.direction.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{t.entry}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{t.exit}</td>
                          <td className={cn('px-3 py-1.5 text-right font-mono font-semibold', t.pnl_pct >= 0 ? 'price-up' : 'price-down')}>
                            {t.pnl_pct >= 0 ? '+' : ''}{t.pnl_pct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Apply to Bot */}
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
