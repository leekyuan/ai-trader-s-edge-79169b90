# AI Trader's Edge — 신호 엔진 개선 가이드

## 🔴 신호가 안 온 원인 분석

원본 Lovable.dev 생성 코드의 문제점:

1. **Binance WebSocket 연결 없음** — 실시간 가격 데이터가 안 들어오면 지표 계산 불가
2. **Supabase Edge Function 미배포** — 트리거가 없어 신호 생성 로직이 실행 안 됨
3. **신호 생성 임계값이 너무 빡빡하거나 조건 자체가 버그** — 코드 실행은 되지만 신호 조건 미충족
4. **캔들 히스토리 없이 지표 계산** — EMA200 등은 최소 200개 캔들 필요

---

## 📁 추가/교체할 파일

```
src/engine/indicators.ts     ← 핵심 지표 계산 엔진 (새로 작성)
src/hooks/useBinanceStream.ts ← WebSocket + REST 캔들 로더
src/hooks/useSignalEngine.ts  ← 신호 생성 메인 훅
src/hooks/useSupabaseSignals.ts ← DB 저장 + Realtime
src/App.tsx                  ← 전체 대시보드 UI
supabase/migrations/20260427_trading_signals.sql ← DB 스키마
```

---

## 🚀 적용 순서

### 1. Supabase DB 스키마 생성

```bash
# Supabase CLI 설치 후
supabase db push

# 또는 Supabase 대시보드 SQL Editor에서
# supabase/migrations/20260427_trading_signals.sql 내용 실행
```

### 2. .env 확인 (이미 있음)
```
VITE_SUPABASE_URL="https://eeozmgejilzpyiuwifhl.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJ..."
```

### 3. 파일 교체

위 파일들을 레포에 복사하고:

```bash
npm install
npm run dev
```

### 4. 신호 수신 확인

- 앱 실행 후 캔들 300개 로드 완료되면 (약 3~5초)
- 15분봉 캔들이 확정(isClosed=true)될 때마다 자동 분석
- 조건 점수 ≥ 4점이면 신호 생성 + Supabase 저장

---

## ⚙️ 신호 설정 조정

`src/engine/indicators.ts`의 `generateSignal()` 함수에서:

```typescript
const MIN_SCORE = 4;  // 낮추면 신호 더 자주 (3으로 변경 시 2~3배)
```

```typescript
const INTERVAL = '15m';  // 타임프레임 변경 가능: '5m', '1h', '4h'
const COOLDOWN_MS = 15 * 60 * 1000;  // 쿨다운 (현재 15분)
```

---

## 📊 지표 조합 (신호 점수 시스템)

| 조건 | 롱 | 숏 | 점수 |
|------|----|----|------|
| RSI < 35 | ✅ | | +2 |
| RSI > 65 | | ✅ | +2 |
| MACD 크로스 | ✅ | ✅ | +2 |
| 볼린저 밴드 터치 | ✅ | ✅ | +2 |
| EMA 배열 | ✅ | ✅ | +1 |
| EMA200 위/아래 | ✅ | ✅ | +1 |
| 거래량 1.5x | ✅ | ✅ | +1 |
| EMA50 근접 | ✅ | ✅ | +1 |

**최대 점수: 10점 / 발동 임계값: 4점**

---

## 🔧 추가 개선 옵션 (필요 시 요청)

- [ ] 텔레그램 봇 알림 (`/supabase/functions/telegram-alert/`)
- [ ] 백테스트 모드 (과거 신호 검증)
- [ ] 다중 타임프레임 (5분 + 15분 + 1시간 동시 분석)
- [ ] 포지션 트래커 (TP/SL 자동 상태 업데이트)
- [ ] 웹 푸시 알림
