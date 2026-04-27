import { useEffect, useRef, useState, useCallback } from 'react';
import { calcIndicators, generateSignal, type Signal, type IndicatorSnapshot, type OHLCV } from './engine/indicators';
import { fetchKlines } from './hooks/useBinanceStream';
import { useSupabaseSignals } from './hooks/useSupabaseSignals';

// ── 상수 ─────────────────────────────────────────────────
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const INTERVAL = '15m';
const MAX_CANDLES = 300;
const COOLDOWN_MS = 15 * 60 * 1000;

// ── 유틸 ─────────────────────────────────────────────────
const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function App() {
  const [prices, setPrices] = useState<Record<string, number>>({ BTCUSDT: 0, ETHUSDT: 0 });
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({ BTCUSDT: 0, ETHUSDT: 0 });
  const [indicators, setIndicators] = useState<Record<string, IndicatorSnapshot | null>>({
    BTCUSDT: null, ETHUSDT: null,
  });
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [activeTab, setActiveTab] = useState<'signals' | 'indicators'>('signals');

  const candleBuffers = useRef<Record<string, OHLCV[]>>({ BTCUSDT: [], ETHUSDT: [] });
  const lastSignalTime = useRef<Record<string, number>>({ BTCUSDT: 0, ETHUSDT: 0 });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const { dbSignals, connected: dbConnected, saveSignal } = useSupabaseSignals();

  // ── 초기 캔들 로드 ────────────────────────────────────
  useEffect(() => {
    Promise.all(SYMBOLS.map(async (sym) => {
      try {
        const klines = await fetchKlines(sym, INTERVAL, MAX_CANDLES);
        candleBuffers.current[sym] = klines;
        const ind = calcIndicators(klines);
        setIndicators(prev => ({ ...prev, [sym]: ind }));
        setPrices(prev => ({ ...prev, [sym]: klines[klines.length - 1].close }));
      } catch (e) { console.error(`Kline load failed: ${sym}`, e); }
    })).finally(() => setLoading(false));
  }, []);

  // ── 캔들 처리 + 신호 생성 ─────────────────────────────
  const processCandle = useCallback((sym: string, candle: OHLCV, isClosed: boolean) => {
    const buf = candleBuffers.current[sym];
    if (isClosed) {
      buf.push(candle);
      if (buf.length > MAX_CANDLES) buf.shift();
    } else {
      if (buf.length > 0) buf[buf.length - 1] = candle;
    }
    if (buf.length < 60) return;
    const ind = calcIndicators(buf);
    setIndicators(prev => ({ ...prev, [sym]: ind }));

    if (!isClosed) return;
    const now = Date.now();
    if (now - lastSignalTime.current[sym] < COOLDOWN_MS) return;
    const signal = generateSignal(sym, buf, ind);
    if (!signal) return;
    lastSignalTime.current[sym] = now;
    setSignals(prev => [signal, ...prev].slice(0, 50));
    saveSignal(signal).catch(console.warn);
  }, [saveSignal]);

  // ── WebSocket 연결 ────────────────────────────────────
  const connectWS = useCallback(() => {
    setWsStatus('connecting');
    const streams = SYMBOLS.flatMap(s => [
      `${s.toLowerCase()}@kline_${INTERVAL}`,
      `${s.toLowerCase()}@aggTrade`,
    ]).join('/');
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus('connected');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const stream: string = msg.stream ?? '';
        const data = msg.data;
        const sym = SYMBOLS.find(s => stream.startsWith(s.toLowerCase())) ?? null;
        if (!sym) return;

        if (stream.includes('@kline')) {
          const k = data.k;
          processCandle(sym, {
            time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v,
          }, k.x);
          setPrices(prev => {
            setPrevPrices(p => ({ ...p, [sym]: prev[sym] }));
            return { ...prev, [sym]: +k.c };
          });
        } else if (stream.includes('@aggTrade')) {
          const p = +data.p;
          setPrices(prev => {
            setPrevPrices(pp => ({ ...pp, [sym]: prev[sym] }));
            return { ...prev, [sym]: p };
          });
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      setWsStatus('reconnecting');
      reconnectRef.current = setTimeout(connectWS, 3000);
    };
    ws.onerror = () => ws.close();
  }, [processCandle]);

  useEffect(() => {
    if (!loading) connectWS();
    return () => { wsRef.current?.close(); clearTimeout(reconnectRef.current); };
  }, [loading, connectWS]);

  // Supabase 신호를 로컬과 합쳐서 표시
  const allSignals = [...signals, ...dbSignals.filter(ds => !signals.find(s => s.id === ds.id))]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);

  return (
    <div className="app">
      {/* ── 헤더 ─────────────────────────────────────── */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">AI Trader's Edge</span>
          </div>
          <div className="tagline">실시간 다중 지표 신호 시스템</div>
        </div>
        <div className="header-right">
          <div className={`ws-badge ws-${wsStatus}`}>
            <span className="ws-dot" />
            {wsStatus === 'connected' ? 'LIVE' : wsStatus === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING'}
          </div>
          <div className={`db-badge ${dbConnected ? 'db-ok' : 'db-off'}`}>
            DB {dbConnected ? '연결' : '미연결'}
          </div>
        </div>
      </header>

      {/* ── 가격 티커 ─────────────────────────────────── */}
      <div className="tickers">
        {SYMBOLS.map(sym => {
          const price = prices[sym];
          const prev = prevPrices[sym];
          const up = price >= prev;
          const ind = indicators[sym];
          return (
            <div key={sym} className="ticker-card">
              <div className="ticker-symbol">{sym.replace('USDT', '')}<span className="ticker-usdt">/USDT</span></div>
              <div className={`ticker-price ${up ? 'price-up' : 'price-down'}`}>
                ${fmt(price, sym === 'BTCUSDT' ? 0 : 2)}
              </div>
              {ind && (
                <div className="ticker-meta">
                  <span className={`rsi-badge ${ind.rsi < 35 ? 'rsi-low' : ind.rsi > 65 ? 'rsi-high' : 'rsi-mid'}`}>
                    RSI {ind.rsi.toFixed(1)}
                  </span>
                  <span className={`trend-badge ${ind.price > ind.ema50 ? 'trend-up' : 'trend-down'}`}>
                    {ind.price > ind.ema50 ? '↑ EMA50 위' : '↓ EMA50 아래'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        <div className="ticker-card stat-card">
          <div className="stat-label">오늘 신호</div>
          <div className="stat-num">{allSignals.filter(s => Date.now() - s.timestamp < 86400000).length}</div>
          <div className="stat-sub">롱 {allSignals.filter(s => s.direction === 'LONG' && Date.now() - s.timestamp < 86400000).length} / 숏 {allSignals.filter(s => s.direction === 'SHORT' && Date.now() - s.timestamp < 86400000).length}</div>
        </div>
        <div className="ticker-card stat-card">
          <div className="stat-label">평균 손익비</div>
          <div className="stat-num">
            {allSignals.length > 0
              ? (allSignals.reduce((a, s) => a + s.rrRatio, 0) / allSignals.length).toFixed(2)
              : '—'}
          </div>
          <div className="stat-sub">전체 {allSignals.length}건</div>
        </div>
      </div>

      {/* ── 메인 영역 ─────────────────────────────────── */}
      <div className="main">
        {/* 좌측: 신호 & 지표 */}
        <div className="left-panel">
          <div className="tab-bar">
            <button className={`tab ${activeTab === 'signals' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('signals')}>
              신호 목록 <span className="tab-count">{allSignals.length}</span>
            </button>
            <button className={`tab ${activeTab === 'indicators' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('indicators')}>
              지표 현황
            </button>
          </div>

          {activeTab === 'signals' && (
            <div className="signal-list">
              {loading && <div className="loading-msg">캔들 데이터 로딩 중...</div>}
              {!loading && allSignals.length === 0 && (
                <div className="empty-msg">
                  <div className="empty-icon">◌</div>
                  <div>신호 대기 중</div>
                  <div className="empty-sub">15분봉 캔들 확정 시 자동 분석</div>
                </div>
              )}
              {allSignals.map(sig => (
                <div key={sig.id}
                  className={`signal-card ${sig.direction === 'LONG' ? 'sig-long' : 'sig-short'} ${selectedSignal?.id === sig.id ? 'sig-selected' : ''}`}
                  onClick={() => setSelectedSignal(sig === selectedSignal ? null : sig)}>
                  <div className="sig-header">
                    <div className="sig-left">
                      <span className={`dir-badge ${sig.direction === 'LONG' ? 'dir-long' : 'dir-short'}`}>
                        {sig.direction === 'LONG' ? '▲ LONG' : '▼ SHORT'}
                      </span>
                      <span className="sig-symbol">{sig.symbol.replace('USDT', '')}</span>
                      <div className="strength-dots">
                        {[1,2,3,4,5].map(i => (
                          <span key={i} className={`dot ${i <= sig.strength ? 'dot-on' : 'dot-off'}`} />
                        ))}
                      </div>
                    </div>
                    <div className="sig-right">
                      <span className={`status-tag status-${sig.status}`}>{sig.status}</span>
                      <span className="sig-time">{fmtDate(sig.timestamp)}</span>
                    </div>
                  </div>

                  <div className="sig-levels">
                    <div className="level-row">
                      <span className="lv-label">진입</span>
                      <span className="lv-val entry-val">${fmt(sig.entry1)} / ${fmt(sig.entry2)}</span>
                    </div>
                    <div className="level-row">
                      <span className="lv-label lv-tp">익절</span>
                      <span className="lv-val tp-val">${fmt(sig.tp1)} / ${fmt(sig.tp2)}</span>
                    </div>
                    <div className="level-row">
                      <span className="lv-label lv-sl">손절</span>
                      <span className="lv-val sl-val">${fmt(sig.sl1)} / ${fmt(sig.sl2)}</span>
                    </div>
                  </div>

                  <div className="sig-footer">
                    <span className="rr-tag">R:R = 1 : {sig.rrRatio}</span>
                    <span className="reasons-preview">{sig.reasons[0]}</span>
                  </div>

                  {selectedSignal?.id === sig.id && (
                    <div className="sig-detail">
                      <div className="detail-title">신호 근거</div>
                      <ul className="reason-list">
                        {sig.reasons.map((r, i) => <li key={i}>· {r}</li>)}
                      </ul>
                      <div className="detail-title" style={{marginTop:'10px'}}>지표 스냅샷</div>
                      <div className="ind-grid">
                        {[
                          ['RSI', sig.indicators.rsi.toFixed(1)],
                          ['MACD', sig.indicators.macdHist.toFixed(4)],
                          ['EMA20', fmt(sig.indicators.ema20, 0)],
                          ['EMA50', fmt(sig.indicators.ema50, 0)],
                          ['BB위', fmt(sig.indicators.bbUpper, 0)],
                          ['BB아래', fmt(sig.indicators.bbLower, 0)],
                          ['ATR', fmt(sig.indicators.atr, 2)],
                          ['거래량比', (sig.indicators.volume / sig.indicators.volumeAvg).toFixed(2) + 'x'],
                        ].map(([label, val]) => (
                          <div key={label} className="ind-item">
                            <div className="ind-label">{label}</div>
                            <div className="ind-val">{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'indicators' && (
            <div className="ind-panel">
              {SYMBOLS.map(sym => {
                const ind = indicators[sym];
                if (!ind) return <div key={sym} className="loading-msg">로딩 중...</div>;
                return (
                  <div key={sym} className="ind-section">
                    <div className="ind-sym-title">{sym.replace('USDT', '')}/USDT</div>
                    <div className="ind-full-grid">
                      {[
                        ['RSI (14)', ind.rsi.toFixed(2), ind.rsi < 35 ? 'good' : ind.rsi > 65 ? 'bad' : 'neutral'],
                        ['EMA 20', fmt(ind.ema20, 0), ind.price > ind.ema20 ? 'good' : 'bad'],
                        ['EMA 50', fmt(ind.ema50, 0), ind.price > ind.ema50 ? 'good' : 'bad'],
                        ['EMA 200', fmt(ind.ema200, 0), ind.price > ind.ema200 ? 'good' : 'bad'],
                        ['MACD Line', ind.macdLine.toFixed(4), ind.macdHist > 0 ? 'good' : 'bad'],
                        ['MACD Signal', ind.macdSignal.toFixed(4), 'neutral'],
                        ['MACD Hist', ind.macdHist.toFixed(4), ind.macdHist > 0 ? 'good' : 'bad'],
                        ['BB 상단', fmt(ind.bbUpper, 0), 'neutral'],
                        ['BB 중심', fmt(ind.bbMiddle, 0), 'neutral'],
                        ['BB 하단', fmt(ind.bbLower, 0), 'neutral'],
                        ['BB 폭', (ind.bbWidth * 100).toFixed(2) + '%', ind.bbWidth < 0.03 ? 'warn' : 'neutral'],
                        ['ATR', fmt(ind.atr, 2), 'neutral'],
                        ['거래량', (ind.volume / 1000).toFixed(1) + 'K', 'neutral'],
                        ['거래량 평균', (ind.volumeAvg / 1000).toFixed(1) + 'K', 'neutral'],
                      ].map(([label, val, color]) => (
                        <div key={label} className={`ind-row ind-row-${color}`}>
                          <span className="ind-row-label">{label}</span>
                          <span className="ind-row-val">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 우측: 가이드 & 설정 */}
        <div className="right-panel">
          <div className="guide-card">
            <div className="guide-title">신호 생성 조건</div>
            <div className="guide-body">
              <div className="cond-group">
                <div className="cond-title">롱 신호 조건 (점수 ≥ 4)</div>
                <div className="cond-item">RSI &lt; 35 → +2점</div>
                <div className="cond-item">RSI 35~45 → +1점</div>
                <div className="cond-item">EMA20 &gt; EMA50 배열 → +1점</div>
                <div className="cond-item">가격 &gt; EMA200 → +1점</div>
                <div className="cond-item">MACD 골든크로스 → +2점</div>
                <div className="cond-item">볼린저 하단 터치 → +2점</div>
                <div className="cond-item">거래량 평균 1.5x → +1점</div>
              </div>
              <div className="cond-group">
                <div className="cond-title">숏 신호 조건 (점수 ≥ 4)</div>
                <div className="cond-item">RSI &gt; 65 → +2점</div>
                <div className="cond-item">RSI 55~65 → +1점</div>
                <div className="cond-item">EMA20 &lt; EMA50 배열 → +1점</div>
                <div className="cond-item">가격 &lt; EMA200 → +1점</div>
                <div className="cond-item">MACD 데드크로스 → +2점</div>
                <div className="cond-item">볼린저 상단 터치 → +2점</div>
                <div className="cond-item">거래량 평균 1.5x → +1점</div>
              </div>
            </div>
          </div>

          <div className="guide-card">
            <div className="guide-title">포지션 계산 기준</div>
            <div className="guide-body">
              <div className="cond-item">진입 1: 현재가 − ATR × 0.3</div>
              <div className="cond-item">진입 2: 현재가 − ATR × 1.0</div>
              <div className="cond-item">손절 1: 진입1 − ATR × 1.8</div>
              <div className="cond-item">익절 1: 진입1 + ATR × 2.0</div>
              <div className="cond-item">익절 2: 진입1 + ATR × 3.5</div>
              <div className="cond-item" style={{marginTop:'8px',fontWeight:500}}>쿨다운: 심볼당 15분</div>
              <div className="cond-item">타임프레임: 15분봉</div>
              <div className="cond-item">캔들 히스토리: 300개</div>
            </div>
          </div>

          <div className="guide-card warn-card">
            <div className="guide-title">⚠ 리스크 관리 원칙</div>
            <div className="guide-body">
              <div className="cond-item">일일 최대 손실: 시드 5%</div>
              <div className="cond-item">동시 포지션: BTC or ETH 1종목만</div>
              <div className="cond-item">1차 손절 시 2차 진입 취소</div>
              <div className="cond-item">신호는 참고용 — 최종 판단은 직접</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0a0c10;
          --bg2: #0f1117;
          --bg3: #161b24;
          --border: rgba(255,255,255,0.07);
          --border2: rgba(255,255,255,0.12);
          --text1: #e8eaf0;
          --text2: #8892a4;
          --text3: #4e5a6e;
          --green: #00d68f;
          --green-dim: rgba(0,214,143,0.1);
          --red: #ff4d6d;
          --red-dim: rgba(255,77,109,0.1);
          --amber: #fbbf24;
          --blue: #3b82f6;
          --blue-dim: rgba(59,130,246,0.1);
          --purple: #8b5cf6;
          --radius: 10px;
        }
        body { background: var(--bg); color: var(--text1); font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; }
        .app { min-height: 100vh; display: flex; flex-direction: column; }

        .header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; border-bottom: 1px solid var(--border2);
          background: var(--bg2);
        }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .logo { display: flex; align-items: center; gap: 8px; }
        .logo-icon { color: var(--amber); font-size: 20px; }
        .logo-text { font-size: 16px; font-weight: 700; letter-spacing: 0.05em; color: var(--text1); }
        .tagline { color: var(--text3); font-size: 11px; }
        .header-right { display: flex; align-items: center; gap: 10px; }
        .ws-badge, .db-badge {
          display: flex; align-items: center; gap: 6px;
          padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
          border: 1px solid var(--border2);
        }
        .ws-dot { width: 7px; height: 7px; border-radius: 50%; }
        .ws-connected { color: var(--green); border-color: rgba(0,214,143,0.3); }
        .ws-connected .ws-dot { background: var(--green); box-shadow: 0 0 6px var(--green); animation: pulse 2s infinite; }
        .ws-connecting, .ws-reconnecting { color: var(--amber); }
        .ws-connecting .ws-dot, .ws-reconnecting .ws-dot { background: var(--amber); }
        .db-ok { color: var(--green); border-color: rgba(0,214,143,0.3); }
        .db-off { color: var(--text3); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        .tickers {
          display: flex; gap: 12px; padding: 14px 20px;
          background: var(--bg2); border-bottom: 1px solid var(--border);
          overflow-x: auto;
        }
        .ticker-card {
          background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 12px 16px; min-width: 180px;
        }
        .ticker-symbol { font-size: 11px; color: var(--text2); margin-bottom: 4px; }
        .ticker-usdt { color: var(--text3); }
        .ticker-price { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 6px; transition: color 0.2s; }
        .price-up { color: var(--green); }
        .price-down { color: var(--red); }
        .ticker-meta { display: flex; gap: 6px; flex-wrap: wrap; }
        .rsi-badge, .trend-badge {
          font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 600;
        }
        .rsi-low { background: var(--green-dim); color: var(--green); }
        .rsi-high { background: var(--red-dim); color: var(--red); }
        .rsi-mid { background: var(--blue-dim); color: var(--blue); }
        .trend-up { background: var(--green-dim); color: var(--green); }
        .trend-down { background: var(--red-dim); color: var(--red); }
        .stat-card { min-width: 140px; }
        .stat-label { font-size: 10px; color: var(--text3); margin-bottom: 4px; }
        .stat-num { font-size: 26px; font-weight: 700; color: var(--text1); }
        .stat-sub { font-size: 10px; color: var(--text2); margin-top: 2px; }

        .main { display: flex; flex: 1; gap: 0; overflow: hidden; }
        .left-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); }
        .right-panel { width: 280px; padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }

        .tab-bar { display: flex; border-bottom: 1px solid var(--border); background: var(--bg2); }
        .tab {
          padding: 12px 20px; background: none; border: none; color: var(--text2);
          cursor: pointer; font-size: 13px; font-family: inherit; border-bottom: 2px solid transparent;
          transition: all 0.15s;
        }
        .tab:hover { color: var(--text1); }
        .tab-active { color: var(--text1); border-bottom-color: var(--amber); }
        .tab-count {
          background: var(--bg3); color: var(--amber); font-size: 10px;
          padding: 1px 6px; border-radius: 10px; margin-left: 6px;
        }

        .signal-list { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .loading-msg, .empty-msg { text-align: center; padding: 40px; color: var(--text3); }
        .empty-icon { font-size: 32px; margin-bottom: 8px; }
        .empty-sub { font-size: 11px; margin-top: 4px; }

        .signal-card {
          background: var(--bg3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 12px 14px;
          cursor: pointer; transition: border-color 0.15s;
        }
        .signal-card:hover { border-color: var(--border2); }
        .sig-selected { border-color: var(--amber) !important; }
        .sig-long { border-left: 3px solid var(--green); }
        .sig-short { border-left: 3px solid var(--red); }

        .sig-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .sig-left { display: flex; align-items: center; gap: 8px; }
        .sig-right { display: flex; align-items: center; gap: 8px; }
        .dir-badge {
          font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
        }
        .dir-long { background: var(--green-dim); color: var(--green); }
        .dir-short { background: var(--red-dim); color: var(--red); }
        .sig-symbol { font-weight: 600; font-size: 14px; }
        .strength-dots { display: flex; gap: 3px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; }
        .dot-on { background: var(--amber); }
        .dot-off { background: var(--border2); }
        .status-tag {
          font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600;
        }
        .status-ACTIVE { background: var(--blue-dim); color: var(--blue); }
        .status-TP1_HIT, .status-TP2_HIT { background: var(--green-dim); color: var(--green); }
        .status-SL_HIT { background: var(--red-dim); color: var(--red); }
        .status-EXPIRED { background: rgba(255,255,255,0.05); color: var(--text3); }
        .sig-time { font-size: 10px; color: var(--text3); }

        .sig-levels { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
        .level-row { display: flex; align-items: center; gap: 8px; }
        .lv-label { font-size: 10px; color: var(--text3); width: 30px; flex-shrink: 0; }
        .lv-tp { color: var(--green); }
        .lv-sl { color: var(--red); }
        .lv-val { font-size: 12px; font-weight: 600; }
        .entry-val { color: var(--amber); }
        .tp-val { color: var(--green); }
        .sl-val { color: var(--red); }

        .sig-footer { display: flex; align-items: center; gap: 10px; }
        .rr-tag {
          font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
          background: rgba(139,92,246,0.15); color: var(--purple);
        }
        .reasons-preview { font-size: 11px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .sig-detail { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
        .detail-title { font-size: 10px; color: var(--text3); font-weight: 600; letter-spacing: 0.06em; margin-bottom: 6px; }
        .reason-list { list-style: none; display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px; }
        .reason-list li { font-size: 11px; color: var(--text2); }
        .ind-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .ind-item { background: var(--bg2); border-radius: 6px; padding: 6px 8px; }
        .ind-label { font-size: 9px; color: var(--text3); margin-bottom: 2px; }
        .ind-val { font-size: 12px; font-weight: 600; color: var(--text1); }

        .ind-panel { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 16px; }
        .ind-section {}
        .ind-sym-title { font-size: 14px; font-weight: 700; color: var(--amber); margin-bottom: 8px; }
        .ind-full-grid { display: flex; flex-direction: column; gap: 2px; }
        .ind-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 10px; border-radius: 6px;
        }
        .ind-row-good { background: rgba(0,214,143,0.06); }
        .ind-row-bad { background: rgba(255,77,109,0.06); }
        .ind-row-neutral { background: transparent; }
        .ind-row-warn { background: rgba(251,191,36,0.08); }
        .ind-row-label { color: var(--text2); font-size: 12px; }
        .ind-row-val { font-weight: 600; font-size: 12px; }
        .ind-row-good .ind-row-val { color: var(--green); }
        .ind-row-bad .ind-row-val { color: var(--red); }
        .ind-row-neutral .ind-row-val { color: var(--text1); }
        .ind-row-warn .ind-row-val { color: var(--amber); }

        .guide-card {
          background: var(--bg3); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 14px;
        }
        .warn-card { border-color: rgba(251,191,36,0.2); }
        .guide-title { font-size: 12px; font-weight: 700; color: var(--amber); margin-bottom: 10px; letter-spacing: 0.04em; }
        .guide-body { display: flex; flex-direction: column; gap: 4px; }
        .cond-group { margin-bottom: 10px; }
        .cond-title { font-size: 10px; color: var(--text2); font-weight: 600; margin-bottom: 4px; letter-spacing: 0.04em; }
        .cond-item { font-size: 11px; color: var(--text3); padding: 2px 0; }
      `}</style>
    </div>
  );
}
