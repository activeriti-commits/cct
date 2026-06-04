// =============================================
// CCT · app.js
// =============================================

// ── 기본값 ──────────────────────────────────
const DEFAULT_SETTINGS = {
  title: 'My CCT',
  startDate: new Date().toISOString().slice(0, 10),
  seed: 100,
  fx: 1400,
  goal: 10000,
  dday: new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10),
};

// ── 상태 ────────────────────────────────────
let S = { ...DEFAULT_SETTINGS };
let E = []; // entries: [{date, asset, memo}]
let currentUser = null;
let lineChart = null;

// ── Supabase 인증 ────────────────────────────
const db = window._supabase;

db.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  updateAuthUI();
  if (currentUser) {
    await loadFromDB();
  } else {
    loadLocal();
  }
});

function updateAuthUI() {
  const avatar = document.getElementById('user-avatar');
  const name = document.getElementById('user-name');
  const action = document.getElementById('auth-action');
  if (currentUser) {
    const email = currentUser.email || '';
    avatar.textContent = email[0]?.toUpperCase() || 'U';
    name.textContent = email.split('@')[0];
    action.textContent = '로그아웃';
    action.onclick = handleLogout;
  } else {
    avatar.textContent = '?';
    name.textContent = '로그인 필요';
    action.textContent = '로그인 →';
    action.onclick = handleAuth;
  }
}

async function handleAuth() {
  const email = prompt('이메일을 입력하세요:');
  if (!email) return;
  const password = prompt('비밀번호를 입력하세요:');
  if (!password) return;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    // 로그인 실패 시 회원가입 시도
    const { error: signUpError } = await db.auth.signUp({ email, password });
    if (signUpError) alert('오류: ' + signUpError.message);
    else alert('가입 완료! 이메일 확인 후 로그인하세요.');
  }
}

async function handleLogout() {
  await db.auth.signOut();
}

// ── DB CRUD ──────────────────────────────────
async function loadFromDB() {
  // settings
  const { data: sData } = await db
    .from('cct_settings')
    .select('*')
    .eq('user_id', currentUser.id)
    .single();
  if (sData) S = { ...DEFAULT_SETTINGS, ...JSON.parse(sData.data) };

  // entries
  const { data: eData } = await db
    .from('cct_entries')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: true });
  if (eData) E = eData.map(r => ({ date: r.date, asset: r.asset, memo: r.memo || '' }));

  render();
}

async function saveToDB() {
  if (!currentUser) { saveLocal(); return; }

  // settings upsert
  await db.from('cct_settings').upsert({
    user_id: currentUser.id,
    data: JSON.stringify(S),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  // entries: 전체 replace (단순 구조 유지)
  await db.from('cct_entries').delete().eq('user_id', currentUser.id);
  if (E.length > 0) {
    await db.from('cct_entries').insert(
      E.map(e => ({ user_id: currentUser.id, date: e.date, asset: e.asset, memo: e.memo }))
    );
  }
}

// ── 로컬 폴백 (비로그인) ─────────────────────
function saveLocal() {
  localStorage.setItem('cct_s', JSON.stringify(S));
  localStorage.setItem('cct_e', JSON.stringify(E));
}
function loadLocal() {
  try { const r = localStorage.getItem('cct_s'); if (r) S = { ...DEFAULT_SETTINGS, ...JSON.parse(r) }; } catch (_) {}
  try { const r = localStorage.getItem('cct_e'); if (r) E = JSON.parse(r); } catch (_) {}
  render();
}

async function persist() {
  if (currentUser) await saveToDB();
  else saveLocal();
}

// ── 계산 ─────────────────────────────────────
function calcData() {
  return E.map((e, i) => {
    const prev = i === 0 ? S.seed : E[i - 1].asset;
    const pnl = +(e.asset - prev).toFixed(8);
    const pct = prev > 0 ? (pnl / prev) * 100 : 0;
    const cumPnl = +(e.asset - S.seed).toFixed(8);
    const cumPct = S.seed > 0 ? (cumPnl / S.seed) * 100 : 0;
    return { ...e, pnl, pct, cumPnl, cumPct, krw: e.asset * S.fx };
  });
}

function calcStats(data) {
  const trading = data.slice(1); // 첫날(시드) 제외
  const best = trading.length ? Math.max(...trading.map(d => d.pnl)) : 0;
  const worst = trading.length ? Math.min(...trading.map(d => d.pnl)) : 0;
  const last = data.length ? data[data.length - 1] : { asset: S.seed, pnl: 0, pct: 0, cumPnl: 0, cumPct: 0, krw: S.seed * S.fx };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDate = new Date(S.startDate + 'T00:00:00');
  const ddayDate = new Date(S.dday + 'T00:00:00');
  const dayN = Math.max(0, Math.floor((today - startDate) / 86400000)) + 1;
  const dday = Math.ceil((ddayDate - today) / 86400000);
  return { best, worst, last, dayN, dday };
}

// ── 포맷 헬퍼 ────────────────────────────────
const sgn = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const krwFmt = n => '₩' + Math.round(n).toLocaleString();
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function M(label, value, cls = '', sub = '') {
  return `<div class="metric">
    <div class="metric-label">${label}</div>
    <div class="metric-value ${cls}">${value}</div>
    ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
  </div>`;
}

// ── 렌더 ─────────────────────────────────────
function render() {
  if (!E.length) {
    renderEmpty();
    return;
  }
  const data = calcData();
  const { best, worst, last, dayN, dday } = calcStats(data);

  document.getElementById('dash-title').textContent = S.title;
  document.getElementById('dash-sub').textContent =
    `시작일 ${S.startDate} · 초기 시드 $${S.seed.toLocaleString()}`;

  // Row1: 총 수익 | 원화 환산
  document.getElementById('r1').innerHTML =
    M('총 수익 (USDT)', sgn(last.cumPnl), last.cumPnl >= 0 ? 'pos' : 'neg') +
    M('원화 환산', krwFmt(last.krw), '', '현재 총자산 기준');

  // Row2: 총 수익률 | D-Day
  document.getElementById('r2').innerHTML =
    M('총 수익률', sgn(last.cumPct, 2) + '%', last.cumPct >= 0 ? 'pos' : 'neg') +
    M('D-Day', dday > 0 ? `D-${dday}` : dday === 0 ? 'D-Day!' : `D+${Math.abs(dday)}`, '', S.dday);

  // Row3: 역대 최고 하루 수익 | 역대 최악 하루 손실 | Day N
  document.getElementById('r3').innerHTML =
    M('역대 최고 하루 수익', '+$' + best.toFixed(2), 'pos sm') +
    M('역대 최악 하루 손실', '$' + worst.toFixed(2), 'neg sm') +
    M('투자 기간', `${dayN} Days`, 'sm', S.startDate + ' 시작');

  // Row4: 현재 총자산 | 초기 시드
  document.getElementById('r4').innerHTML =
    M('현재 총자산', '$' + last.asset.toFixed(2), 'sm') +
    M('초기 시드', '$' + S.seed, 'sm') +
    M('기록 수', data.length + '건', 'sm') +
    M('환율', '₩' + S.fx.toLocaleString(), 'sm', 'KRW/USDT');

  // 목표 달성도
  const pct = Math.min((last.asset / S.goal) * 100, 100);
  document.getElementById('gpct').textContent = pct.toFixed(2) + '%';
  document.getElementById('gdesc').textContent =
    `목표 $${S.goal.toLocaleString()} · 남은 금액 $${Math.max(S.goal - last.asset, 0).toLocaleString()}`;
  document.getElementById('gbar').style.width = pct + '%';

  renderChart(data);
  renderLog(data);
  renderMonthly(data);
  renderSettings();
}

function renderEmpty() {
  document.getElementById('dash-title').textContent = S.title;
  document.getElementById('dash-sub').textContent = '아직 기록이 없습니다. 매매기록 탭에서 첫 번째 기록을 추가해보세요.';
  ['r1','r2','r3','r4'].forEach(id => document.getElementById(id).innerHTML = '');
  document.getElementById('gpct').textContent = '0%';
  document.getElementById('gdesc').textContent = `목표 $${S.goal.toLocaleString()}`;
  document.getElementById('gbar').style.width = '0%';
  document.getElementById('log-body').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:2rem">기록이 없습니다</td></tr>';
  document.getElementById('monthly-body').innerHTML = '';
  renderSettings();
}

function renderChart(data) {
  const ctx = document.getElementById('chart').getContext('2d');
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(e => e.date.slice(5)),
      datasets: [{
        data: data.map(e => e.asset),
        borderColor: '#00c48c',
        backgroundColor: 'rgba(0,196,140,0.06)',
        tension: 0.3, pointRadius: 4,
        pointBackgroundColor: '#00c48c', fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => '$' + c.parsed.y.toFixed(2) } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#4d5566' } },
        y: { ticks: { callback: v => '$' + v, font: { size: 11 }, color: '#4d5566' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
      }
    }
  });
}

function renderLog(data) {
  document.getElementById('log-body').innerHTML = [...data].reverse().map(e => `
    <tr>
      <td style="white-space:nowrap;font-size:12px">${e.date} (${DAYS[new Date(e.date + 'T00:00:00').getDay()]})</td>
      <td>$${e.asset.toFixed(2)}</td>
      <td style="font-size:12px">${krwFmt(e.krw)}</td>
      <td><span class="badge ${e.pnl > 0 ? 'pos' : e.pnl < 0 ? 'neg' : 'neu'}">${e.pnl >= 0 ? '+' : ''}$${e.pnl.toFixed(2)}</span></td>
      <td><span class="badge ${e.pct > 0 ? 'pos' : e.pct < 0 ? 'neg' : 'neu'}">${sgn(e.pct, 1)}%</span></td>
      <td>${sgn(e.cumPnl)}$</td>
      <td class="memo-cell">${e.memo || '-'}</td>
      <td><button class="del-btn" onclick="delEntry('${e.date}')">삭제</button></td>
    </tr>`).join('');
}

function renderMonthly(data) {
  const mon = {};
  data.forEach(e => {
    const k = e.date.slice(0, 7);
    if (!mon[k]) mon[k] = [];
    mon[k].push(e);
  });
  document.getElementById('monthly-body').innerHTML = Object.entries(mon).map(([k, es]) => {
    const l = es[es.length - 1];
    const idx = data.findIndex(e => e.date === es[0].date);
    const pa = idx > 0 ? data[idx - 1].asset : S.seed;
    const p = +(l.asset - pa).toFixed(8);
    const r = pa > 0 ? (p / pa) * 100 : 0;
    return `<tr>
      <td>${k}</td>
      <td>$${pa.toFixed(2)}</td>
      <td>$${l.asset.toFixed(2)}</td>
      <td style="font-size:12px">${krwFmt(l.krw)}</td>
      <td><span class="badge ${p >= 0 ? 'pos' : 'neg'}">${p >= 0 ? '+' : ''}$${p.toFixed(2)}</span></td>
      <td><span class="badge ${r >= 0 ? 'pos' : 'neg'}">${sgn(r, 1)}%</span></td>
    </tr>`;
  }).join('');
}

function renderSettings() {
  document.getElementById('s-title').value = S.title;
  document.getElementById('s-start').value = S.startDate;
  document.getElementById('s-seed').value = S.seed;
  document.getElementById('s-fx').value = S.fx;
  document.getElementById('s-goal').value = S.goal;
  document.getElementById('s-dday').value = S.dday;
}

// ── 탭 ───────────────────────────────────────
function showTab(name) {
  ['dashboard', 'log', 'monthly', 'settings'].forEach((t, i) => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== name);
    document.querySelectorAll('.nav-item')[i].classList.toggle('active', t === name);
  });
}

// ── 기록 추가 / 삭제 ─────────────────────────
function addEntry() {
  const date = document.getElementById('inp-date').value;
  const asset = parseFloat(document.getElementById('inp-asset').value);
  const memo = document.getElementById('inp-memo').value.trim();
  if (!date || isNaN(asset) || asset < 0) return;
  const idx = E.findIndex(e => e.date === date);
  if (idx >= 0) E[idx] = { date, asset, memo };
  else { E.push({ date, asset, memo }); E.sort((a, b) => a.date.localeCompare(b.date)); }
  persist(); render(); clearInputs();
}

function clearInputs() {
  document.getElementById('inp-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('inp-asset').value = '';
  document.getElementById('inp-memo').value = '';
}

function delEntry(date) {
  E = E.filter(e => e.date !== date);
  persist(); render();
}

// ── 설정 저장 ─────────────────────────────────
function saveSettings() {
  S.title = document.getElementById('s-title').value || S.title;
  S.startDate = document.getElementById('s-start').value || S.startDate;
  S.seed = parseFloat(document.getElementById('s-seed').value) || S.seed;
  S.fx = parseInt(document.getElementById('s-fx').value) || S.fx;
  S.goal = parseFloat(document.getElementById('s-goal').value) || S.goal;
  S.dday = document.getElementById('s-dday').value || S.dday;
  persist(); render(); showTab('dashboard');
}

function resetAll() {
  if (!confirm('모든 데이터를 초기화할까요?')) return;
  E = []; S = { ...DEFAULT_SETTINGS };
  persist(); render(); showTab('dashboard');
}

// ── 캡처 ─────────────────────────────────────
function enterCapture() {
  if (!E.length) return;
  const data = calcData();
  const { best, worst, last, dayN, dday } = calcStats(data);
  const todayEntry = data[data.length - 1]; // 가장 최근 기록

  document.getElementById('cap-title').textContent = S.title;
  document.getElementById('cap-meta').textContent =
    `${dayN} Days · ${new Date().toLocaleDateString('ko-KR')} · 시작일 ${S.startDate}`;

  // 오늘 수익이 메인 (가장 크게)
  const pnlColor = todayEntry.pnl >= 0 ? '#00c48c' : '#ff4d6a';
  document.getElementById('cap-pnl-value').textContent =
    (todayEntry.pnl >= 0 ? '+' : '') + '$' + todayEntry.pnl.toFixed(2);
  document.getElementById('cap-pnl-value').style.color = pnlColor;
  document.getElementById('cap-pnl-pct').textContent =
    sgn(todayEntry.pct, 2) + '%  당일 수익률';
  document.getElementById('cap-pnl-pct').style.color = pnlColor;

  // 나머지 지표
  document.getElementById('cap-grid').innerHTML = [
    { l: '현재 총자산', v: '$' + last.asset.toFixed(2) },
    { l: '총 수익률', v: sgn(last.cumPct, 2) + '%' },
    { l: '역대 최고 하루 수익', v: '+$' + best.toFixed(2) },
    { l: 'D-Day', v: dday > 0 ? `D-${dday}` : dday === 0 ? 'D-Day!' : `D+${Math.abs(dday)}` },
    { l: '원화 환산', v: krwFmt(last.krw) },
    { l: '총 수익 (USDT)', v: sgn(last.cumPnl) + '$' },
  ].map(it => `
    <div class="cap-card">
      <div class="cap-card-label">${it.l}</div>
      <div class="cap-card-value">${it.v}</div>
    </div>`).join('');

  document.getElementById('cap-ov').style.display = 'block';
}

// ── 엔터 → 기록 추가 ─────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('tab-log').classList.contains('hidden')) {
    addEntry();
  }
});

// ── 초기화 ───────────────────────────────────
clearInputs();
// 인증 상태 체크 후 자동으로 loadFromDB 또는 loadLocal 호출됨
