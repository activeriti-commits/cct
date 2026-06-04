# CCT — Crypto Currency Trader

바이낸스 레버리지 매매일지 웹앱

---

## 셋업 순서

### 1. Supabase 프로젝트 만들기

1. https://supabase.com 접속 → 회원가입 → New Project
2. 프로젝트 이름: `cct`, 비밀번호 설정, 지역: Northeast Asia (Seoul)
3. 프로젝트 생성 후 **Settings → API** 에서:
   - `Project URL` 복사
   - `anon public` 키 복사
4. `supabase.js` 파일 열어서 붙여넣기:
   ```js
   const SUPABASE_URL = 'https://여기에붙여넣기.supabase.co';
   const SUPABASE_ANON_KEY = '여기에붙여넣기';
   ```

### 2. Supabase 테이블 만들기

Supabase 대시보드 → SQL Editor → New Query → 아래 SQL 붙여넣고 실행:

```sql
-- 설정 테이블
create table cct_settings (
  user_id uuid primary key references auth.users(id),
  data text not null,
  updated_at timestamptz default now()
);

-- 매매기록 테이블
create table cct_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  date date not null,
  asset numeric not null,
  memo text,
  created_at timestamptz default now()
);

-- 보안 정책 (본인 데이터만 접근)
alter table cct_settings enable row level security;
alter table cct_entries enable row level security;

create policy "본인만 설정 접근" on cct_settings
  for all using (auth.uid() = user_id);

create policy "본인만 기록 접근" on cct_entries
  for all using (auth.uid() = user_id);
```

### 3. GitHub에 올리기

```bash
git init
git add .
git commit -m "CCT init"
git branch -M main
git remote add origin https://github.com/본인계정/cct.git
git push -u origin main
```

### 4. Vercel 배포

1. https://vercel.com 접속 → New Project
2. GitHub 연결 → cct 레포 선택 → Deploy
3. 배포 완료 후 URL 생성됨: `cct-본인이름.vercel.app`

### 5. 완료

- URL 접속 → 이메일/비밀번호로 계정 만들기
- 설정에서 시드, 시작일, 환율 입력
- 매일 마감 총자산 입력하면 손익 자동 계산

---

## 파일 구조

```
cct/
├── index.html    ← 전체 UI
├── app.js        ← 로직 (계산, 렌더, DB 연동)
├── supabase.js   ← Supabase 연결 설정 (URL/키 입력 필요)
├── vercel.json   ← Vercel 배포 설정
└── README.md
```

## 다음 버전 예정

- 환율 자동 연동 (Binance API)
- 캡처 → 이미지 저장 기능
- 공개 URL 공유 (다른 사람이 볼 수 있게)
