# CCT 개발 노트

**CCT (Crypto Currency Trader)** — 비트코인 매매 일지 웹앱  
스택: Vanilla HTML/CSS/JS · Supabase (Auth + DB) · Vercel 배포  
배포: https://cct-chi.vercel.app

---

## 주요 구현

### 인증 (Auth)
- Supabase 이메일/비밀번호 로그인 + 비밀번호 강도 표시 (실시간)
- **Google OAuth** — `signInWithOAuth({ provider: 'google' })`, Supabase 대시보드에서 Google Cloud Console OAuth 클라이언트 등록 필요
- **비밀번호 재설정** — `PASSWORD_RECOVERY` 이벤트 감지 후 `auth.html`로 리디렉트, `redirectTo: location.origin + '/auth.html'`
- **Resend SMTP** — Supabase 기본 이메일은 2-3건/시간 제한 → Resend 커스텀 SMTP 교체 (발신자: `onboarding@resend.dev`)

### 환산 계산기
- **localStorage 단위 유지** — `calcUnit = localStorage.getItem('calcUnit') || 'USD'`
- **단위 전환 시 값 변환** — 단위 전환 시 기존 입력값을 새 단위로 환산하여 유지 (예: BTC→KRW 전환 시 BTC 수량 → KRW 금액으로 자동 변환)
- **선택 단위 행 숨김** — 현재 입력 단위는 하단 입력바에 표시, 환산 목록에서는 해당 행 숨김
- **KRW 계산**: `USD × S.fx` (BTC 가격 없이도 환율만으로 계산 가능)
- 실시간 시세: Bithumb/Upbit (KRW), Binance/Coinbase (BTC/USD)

### 레이아웃
- PC 사이드바 → 통합 하단 탭바 (모바일/데스크탑 동일, only-btc.app 참고)
- 상단 헤더: CCT 로고 + 닉네임 + ⚙ 설정 아이콘
- 설정/캡처/BIP39 진입 시 ⚙ → ← 뒤로가기 아이콘 전환, `prevTab` 추적
- 하단 탭 5개: 대시보드 | 기록 | 계산기(가운데) | 결산 | 유틸리티

### 대시보드
- 6개 메트릭 카드: 현재총자산 / 총수익률 / 총수익(USDT) / 원화환산 / 투자기간 / 역대최고수익
- 📷 캡처 버튼: html2canvas로 대시보드 스냅샷 저장 (별도 탭, 하단바에서는 분리)

### 설정 페이지
5개 섹션: 기본정보 / 가격설정 / 스타일및화면 / 앱설치 / 정보

### 다크/라이트/시스템 테마
- CSS `[data-theme]` 어트리뷰트로 변수 전환
  - `[data-theme="light"]`: 흰 배경 계열
  - `[data-theme="dark"]`: 기존 어두운 배경 계열
- **FOUC 방지**: `<head>` 최상단 인라인 스크립트로 렌더링 전 `localStorage`에서 테마 읽어 즉시 적용
  ```js
  (function(){
    const t = localStorage.getItem('theme') || 'system';
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  })()
  ```
- `applyTheme(theme)`: system이면 `matchMedia`로 OS 설정 감지
- `saveTheme(theme)`: `localStorage` + Supabase 동시 저장
- 기본값: `'system'` (OS 설정 따름, 첫 방문은 라이트로 렌더)

### BIP39 단어 목록
- Bitcoin BIP39 표준 영어 단어 2048개 온디맨드 로드
  - `fetch('https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt')`
  - 앱 초기 로드 없이 탭 진입 시 최초 1회만 fetch, 이후 메모리 캐시(`bip39Words`)
- 각 단어 → 인덱스(1-2048) → 11비트 이진수 변환 → 점(●/○)으로 시각화 (4-4-3 그룹)
- 접두사 검색: `Array.filter(w => w.startsWith(query))`로 실시간 필터링

### PWA
- `manifest.json` + 아이콘(192/512px): 홈 화면 설치 지원
- `beforeinstallprompt` 이벤트 캡처 → 첫 방문 시 배너 표시 (localStorage로 중복 표시 방지)
- `installPWA()`: 캡처한 이벤트로 네이티브 설치 프롬프트 실행

### 개발자 후원 (Lightning)
- `hash@walletofsatoshi.com` Lightning 주소
- QR 코드: 브랜딩된 이미지(`qr-lightning.png`) 정적 파일로 제공 (초기 qrcode.js canvas → img 태그로 교체)
- 클립보드 복사: `navigator.clipboard.writeText(LIGHTNING_ADDRESS)`

---

## 버그 해결 기록

### 1. 계산기 입력바 220px 오프셋 (모바일)
**원인**: `:root { --sidebar: 220px }` 전역, 모바일 미디어쿼리 재설정 누락  
**해결**: `--sidebar: 0px` 전역 기본값으로 변경

### 2. USD 행 사라짐 (계산기 기본값 설정 시)
**원인**: `calcUnit` 기본값을 `'USD'`로 설정하면 선택 단위 행 숨김 로직에 걸려 USD 행이 사라짐  
**해결**: 단위 목록 렌더링 시 현재 `calcUnit`과 일치하는 행만 숨기되, 입력바에 해당 단위를 표시하는 방식으로 UX 개선 후 기본값 USD 복원

### 3. KRW 계산값 "-" 표시
**원인**: KRW 계산을 BTC 가격에 의존하도록 작성  
**해결**: `KRW = USD입력값 × S.fx` (환율만으로 계산)

### 4. 비밀번호 재설정 → 구 Vercel URL로 리디렉트
**원인**: Supabase Site URL이 구 프리뷰 URL로 설정됨  
**해결**: Authentication → URL Configuration → Site URL → `https://cct-chi.vercel.app`

### 5. SMTP 429/500 에러
**원인 1 (429)**: Supabase 무료 플랜 이메일 제한 (2-3건/시간)  
**원인 2 (500)**: 발신자를 `xxx@gmail.com`으로 설정 → Gmail 도메인 소유 없음  
**해결**: Resend 커스텀 SMTP + 발신자 `onboarding@resend.dev` 사용

### 6. Google OAuth "공백 포함" 에러
**원인**: Supabase Redirect URLs에 공백이 포함된 URL 입력  
**해결**: 공백 제거 후 재등록. URI: `https://<project-ref>.supabase.co/auth/v1/callback`

### 7. 중복 DOM ID (str-fill, str-lbl)
**원인**: 회원가입 폼과 비밀번호 재설정 폼에 동일 ID 사용  
**해결**: 재설정 폼 → `r-str-fill`, `r-str-lbl`로 분리, `checkStr()`에서 활성 폼 감지

### 8. 캡처 이미지 `+18.00$` 형식 오류
**원인**: `sgn(val) + '$'` 문자열 concatenation 오류  
**해결**: `(val >= 0 ? '+' : '-') + Math.abs(val).toFixed(2)`

### 9. 설정 아이콘이 태양처럼 보임
**원인**: 기어 SVG를 8개 방사형 선으로 그려 태양 모양으로 렌더링됨  
**해결**: Feather Icons 스펙의 정확한 gear path (`M19.4 15 ...`) 사용

### 10. 앱 설치 배너 매번 표시
**원인**: `beforeinstallprompt` 이벤트 발생 시 무조건 배너 표시  
**해결**: `localStorage.getItem('pwaPromptDismissed')` 확인 후 미표시, 닫기/설치 시 플래그 저장

### 11. FOUC (Flash of Unstyled Content) — 다크/라이트 테마
**원인**: CSS 변수가 렌더링된 후 JS로 `data-theme`을 적용하면 깜빡임 발생  
**해결**: `<head>` 최상단 인라인 `<script>`로 CSS 파싱 전에 `data-theme` 어트리뷰트 설정

---

## 환경 설정

| 항목 | 값 |
|------|-----|
| Supabase 프로젝트 ID | `zuodnwysgnhrvjgnyaak` |
| 배포 URL | `https://cct-chi.vercel.app` |
| Auth 리디렉트 URL | `https://cct-chi.vercel.app/auth.html` |
| Resend SMTP Host | `smtp.resend.com` / Port `465` / TLS |
| Google OAuth Redirect URI | `https://zuodnwysgnhrvjgnyaak.supabase.co/auth/v1/callback` |
