import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTradeStats } from '@/hooks/useTradeLogs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AuthModal } from '@/components/trading/AuthModal';
import { TopBar } from '@/components/trading/TopBar';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ArrowLeft, Download, TrendingDown, TrendingUp, Target, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const PIE_COLORS = ['hsl(var(--bull))', 'hsl(var(--primary))', 'hsl(var(--warning))', 'hsl(var(--bear))', 'hsl(var(--accent))'];

export default function Journal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const { data: stats, isLoading } = useTradeStats(30);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);

  if (!user) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <TopBar onLoginClick={() => setAuthOpen(true)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">저널을 사용하려면 로그인이 필요합니다.</p>
            <Button onClick={() => setAuthOpen(true)}>로그인</Button>
          </div>
        </div>
        <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      </div>
    );
  }

  const exportCSV = () => {
    if (!stats?.trades.length) return;
    const headers = ['시간', '페어', '방향', '진입가', '청산가', 'PnL%', 'PnL USDT', '신호'];
    const rows = stats.trades.map((t: any) => [
      t.created_at, t.pair, t.direction, t.entry_price, t.exit_price || '', t.pnl_pct, t.pnl_usdt, t.signal_type,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trading-journal-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Today's PnL
  const today = new Date().toISOString().split('T')[0];
  const todayTrades = stats?.trades.filter((t: any) => (t.closed_at || t.created_at).startsWith(today) && t.status !== 'open') || [];
  const todayPnl = todayTrades.reduce((s: number, t: any) => s + (t.pnl_pct || 0), 0);
  const todayPnlUsdt = todayTrades.reduce((s: number, t: any) => s + (t.pnl_usdt || 0), 0);

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <TopBar onLoginClick={() => setAuthOpen(true)} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold">트레이딩 저널</h2>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground">오늘 PnL</span>
                  </div>
                  <p className={cn('text-lg font-bold font-mono', todayPnl >= 0 ? 'price-up' : 'price-down')}>
                    {todayPnl >= 0 ? '+' : ''}{todayPnl.toFixed(2)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">{todayPnlUsdt >= 0 ? '+' : ''}{todayPnlUsdt.toFixed(2)} USDT</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target className="h-3.5 w-3.5 text-bull" />
                    <span className="text-[10px] text-muted-foreground">이번 주 승률</span>
                  </div>
                  <p className="text-lg font-bold font-mono">{stats?.winRate.toFixed(1)}%</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <BarChart3 className="h-3.5 w-3.5 text-warning" />
                    <span className="text-[10px] text-muted-foreground">평균 RR</span>
                  </div>
                  <p className="text-lg font-bold font-mono">1:{stats?.avgRR.toFixed(1)}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingDown className="h-3.5 w-3.5 text-bear" />
                    <span className="text-[10px] text-muted-foreground">최대 낙폭</span>
                  </div>
                  <p className="text-lg font-bold font-mono text-bear">{stats?.mdd.toFixed(2)}%</p>
                </div>
              </div>

              {/* Charts */}
              <div className="grid md:grid-cols-2 gap-4">
                {/* Daily PnL Bar Chart */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3">일별 PnL (최근 30일)</h4>
                  {stats?.dailyPnL.length ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={stats.dailyPnL}>
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                        <Bar dataKey="pnl" fill="hsl(var(--bull))" radius={[2, 2, 0, 0]}>
                          {stats.dailyPnL.map((entry: any, i: number) => (
                            <Cell key={i} fill={entry.pnl >= 0 ? 'hsl(var(--bull))' : 'hsl(var(--bear))'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-[10px] text-muted-foreground text-center py-10">데이터 없음</p>
                  )}
                </div>

                {/* Pair Pie Chart */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="text-xs font-semibold mb-3">페어별 수익 기여도</h4>
                  {stats?.pairBreakdown.length ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={stats.pairBreakdown} dataKey="pnl" nameKey="pair" cx="50%" cy="50%" outerRadius={70} label={({ pair, pnl }: any) => `${pair}: ${pnl.toFixed(0)}`} labelLine={false} fontSize={10}>
                          {stats.pairBreakdown.map((_: any, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-[10px] text-muted-foreground text-center py-10">데이터 없음</p>
                  )}
                </div>
              </div>

              {/* Trade Journal Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">거래 기록</h4>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={exportCSV}>
                    <Download className="h-3 w-3" /> CSV 내보내기
                  </Button>
                </div>

                {stats?.trades.length ? stats.trades.map((t: any) => (
                  <div
                    key={t.id}
                    className="bg-card border border-border rounded-lg p-3 text-xs cursor-pointer hover:border-primary/30 transition-colors"
                    onClick={() => setSelectedTrade(t)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{t.pair}</span>
                        <Badge variant="outline" className={cn('text-[9px]', t.direction === 'long' ? 'text-bull border-bull/30' : 'text-bear border-bear/30')}>
                          {t.direction?.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-[9px]">{t.signal_type}</Badge>
                      </div>
                      <span className={cn('font-mono font-semibold', (t.pnl_pct || 0) >= 0 ? 'price-up' : 'price-down')}>
                        {(t.pnl_pct || 0) >= 0 ? '+' : ''}{(t.pnl_pct || 0).toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{new Date(t.created_at).toLocaleString('ko-KR')}</span>
                      <span>진입: {Number(t.entry_price).toFixed(2)} → {t.exit_price ? Number(t.exit_price).toFixed(2) : '오픈'}</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-muted-foreground py-8 text-sm">거래 기록이 없습니다</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Trade Detail Modal */}
      <Dialog open={!!selectedTrade} onOpenChange={() => setSelectedTrade(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>거래 상세</DialogTitle>
          </DialogHeader>
          {selectedTrade && (
            <div className="space-y-2 text-xs">
              {[
                ['페어', selectedTrade.pair],
                ['방향', selectedTrade.direction?.toUpperCase()],
                ['진입가', Number(selectedTrade.entry_price).toFixed(2)],
                ['청산가', selectedTrade.exit_price ? Number(selectedTrade.exit_price).toFixed(2) : '오픈'],
                ['손절가', Number(selectedTrade.sl).toFixed(2)],
                ['익절가', Number(selectedTrade.tp).toFixed(2)],
                ['레버리지', `${selectedTrade.leverage}x`],
                ['수량', Number(selectedTrade.quantity).toFixed(4)],
                ['PnL%', `${(selectedTrade.pnl_pct || 0).toFixed(2)}%`],
                ['PnL USDT', `${(selectedTrade.pnl_usdt || 0).toFixed(2)}`],
                ['신호', selectedTrade.signal_type],
                ['상태', selectedTrade.status],
                ['진입 시간', new Date(selectedTrade.created_at).toLocaleString('ko-KR')],
                ['청산 시간', selectedTrade.closed_at ? new Date(selectedTrade.closed_at).toLocaleString('ko-KR') : '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between bg-muted rounded px-3 py-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-semibold">{val}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
