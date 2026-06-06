// ── CCT · app.js ────────────────────────────

const DEFAULT_S = {
  title: 'My CCT',
  startDate: new Date().toISOString().slice(0,10),
  seed: 100, fx: 1400, goal: 10000,
};

let S = {...DEFAULT_S}, E = [], currentUser = null, lineChart = null;
const db = window._supabase;

// ── 인증 ─────────────────────────────────────
db.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  if (!currentUser) { location.href = './auth.html'; return; }
  updateAuthUI();
  await loadFromDB();
});

function updateAuthUI() {
  if (!currentUser) return;
  const email = currentUser.email || '';
  document.getElementById('user-avatar').textContent = email[0]?.toUpperCase() || 'U';
  document.getElementById('user-name').textContent = email.split('@')[0];
}

async function doLogout() {
  await db.auth.signOut();
  location.href = './auth.html';
}

// ── DB ───────────────────────────────────────
async function loadFromDB() {
  const { data: sd } = await db.from('cct_settings').select('*').eq('user_id', currentUser.id).single();
  if (sd) S = { ...DEFAULT_S, ...JSON.parse(sd.data) };
  const { data: ed } = await db.from('cct_entries').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
  if (ed) E = ed.map(r => ({ date: r.date, asset: +r.asset, memo: r.memo || '' }));
  render();
}

async function persist() {
  if (!currentUser) return;
  await db.from('cct_settings').upsert({ user_id: currentUser.id, data: JSON.stringify(S), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  await db.from('cct_entries').delete().eq('user_id', currentUser.id);
  if (E.length) await db.from('cct_entries').insert(E.map(e => ({ user_id: currentUser.id, ...e })));
}

// ── 계산 ─────────────────────────────────────
function calcData() {
  return E.map((e, i) => {
    const prev = i === 0 ? S.seed : E[i-1].asset;
    const pnl = +(e.asset - prev).toFixed(8);
    const pct = prev > 0 ? (pnl / prev) * 100 : 0;
    const cumPnl = +(e.asset - S.seed).toFixed(8);
    const cumPct = S.seed > 0 ? (cumPnl / S.seed) * 100 : 0;
    return { ...e, pnl, pct, cumPnl, cumPct, krw: e.asset * S.fx };
  });
}

function calcStats(data) {
  const tr = data.slice(1);
  const best = tr.length ? Math.max(...tr.map(d => d.pnl)) : 0;
  const worst = tr.length ? Math.min(...tr.map(d => d.pnl)) : 0;
  const last = data.length ? data[data.length-1] : { asset: S.seed, pnl:0, pct:0, cumPnl:0, cumPct:0, krw: S.seed * S.fx };
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.max(0, Math.floor((today - new Date(S.startDate+'T00:00:00')) / 86400000)) + 1;
  return { best, worst, last, days };
}

// ── 포맷 ─────────────────────────────────────
const sgn = (n, d=2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const krwFmt = n => '₩' + Math.round(n).toLocaleString();
const DAYS = ['일','월','화','수','목','금','토'];
const M = (label, val, cls='', sub='') =>
  `<div class="metric"><div class="ml">${label}</div><div class="mv ${cls}">${val}</div>${sub ? `<div class="ms">${sub}</div>` : ''}</div>`;

// ── 렌더 ─────────────────────────────────────
function render() {
  if (!E.length) { renderEmpty(); return; }
  const data = calcData();
  const { best, worst, last, days } = calcStats(data);

  document.getElementById('dash-title').textContent = S.title;
  document.getElementById('dash-sub').textContent = `시작일 ${S.startDate} · 초기 시드 $${S.seed.toLocaleString()}`;

  document.getElementById('r1').innerHTML =
    M('총 수익 (USDT)', sgn(last.cumPnl), last.cumPnl >= 0 ? 'pos' : 'neg') +
    M('원화 환산', krwFmt(last.krw), '', '현재 총자산 기준');

  document.getElementById('r2').innerHTML =
    M('총 수익률', sgn(last.cumPct, 2) + '%', last.cumPct >= 0 ? 'pos' : 'neg') +
    M('투자 기간', `${days} Days`, 'sm', S.startDate + ' 시작');

  document.getElementById('r3').innerHTML =
    M('역대 최고 하루 수익', '+$' + best.toFixed(2), 'pos sm') +
    M('역대 최악 하루 손실', '$' + worst.toFixed(2), 'neg sm') +
    M('현재 총자산', '$' + last.asset.toFixed(2), 'sm');

  document.getElementById('r4').innerHTML =
    M('초기 시드', '$' + S.seed, 'sm') +
    M('기록 수', data.length + '건', 'sm') +
    M('환율', '₩' + S.fx.toLocaleString(), 'sm', 'KRW/USDT') +
    M('목표', '$' + S.goal.toLocaleString(), 'sm');

  const pct = Math.min((last.asset / S.goal) * 100, 100);
  document.getElementById('gpct').textContent = pct.toFixed(2) + '%';
  document.getElementById('gdesc').textContent = `목표 $${S.goal.toLocaleString()} · 남은 금액 $${Math.max(S.goal - last.asset, 0).toLocaleString()}`;
  document.getElementById('gbar').style.width = pct + '%';

  renderChart(data);
  renderLog(data);
  renderMonthly(data);
  renderCapture(data);
  renderSettingsForm();
}

function renderEmpty() {
  document.getElementById('dash-title').textContent = S.title;
  document.getElementById('dash-sub').textContent = '매매기록 탭에서 첫 번째 기록을 추가해보세요.';
  ['r1','r2','r3','r4'].forEach(id => document.getElementById(id).innerHTML = '');
  document.getElementById('gpct').textContent = '0%';
  document.getElementById('gdesc').textContent = `목표 $${S.goal.toLocaleString()}`;
  document.getElementById('gbar').style.width = '0%';
  document.getElementById('log-body').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:2rem">기록이 없습니다</td></tr>';
  document.getElementById('monthly-body').innerHTML = '';
  renderSettingsForm();
}

function renderChart(data) {
  const ctx = document.getElementById('chart').getContext('2d');
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(e => e.date.slice(5)),
      datasets: [{ data: data.map(e => e.asset), borderColor: '#00c48c', backgroundColor: 'rgba(0,196,140,0.06)', tension: 0.3, pointRadius: 4, pointBackgroundColor: '#00c48c', fill: true }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => '$' + c.parsed.y.toFixed(2) } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#4d5566' } },
        y: { ticks: { callback: v => '$' + v, font: { size: 11 }, color: '#4d5566' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } }
      }
    }
  });
}

function renderLog(data) {
  document.getElementById('log-body').innerHTML = [...data].reverse().map(e => `
    <tr>
      <td style="white-space:nowrap;font-size:12px">${e.date} (${DAYS[new Date(e.date+'T00:00:00').getDay()]})</td>
      <td>$${e.asset.toFixed(2)}</td>
      <td style="font-size:12px">${krwFmt(e.krw)}</td>
      <td><span class="badge ${e.pnl>0?'pos':e.pnl<0?'neg':'neu'}">${e.pnl>=0?'+':''}$${e.pnl.toFixed(2)}</span></td>
      <td><span class="badge ${e.pct>0?'pos':e.pct<0?'neg':'neu'}">${sgn(e.pct,1)}%</span></td>
      <td>${sgn(e.cumPnl)}$</td>
      <td class="memo-cell">${e.memo||'-'}</td>
      <td><button class="del-btn" onclick="delEntry('${e.date}')">삭제</button></td>
    </tr>`).join('');
}

function renderMonthly(data) {
  const mon = {};
  data.forEach(e => { const k = e.date.slice(0,7); if (!mon[k]) mon[k] = []; mon[k].push(e); });
  document.getElementById('monthly-body').innerHTML = Object.entries(mon).map(([k, es]) => {
    const l = es[es.length-1];
    const idx = data.findIndex(e => e.date === es[0].date);
    const pa = idx > 0 ? data[idx-1].asset : S.seed;
    const p = +(l.asset - pa).toFixed(8), r = pa > 0 ? (p/pa)*100 : 0;
    return `<tr>
      <td>${k}</td><td>$${pa.toFixed(2)}</td><td>$${l.asset.toFixed(2)}</td>
      <td style="font-size:12px">${krwFmt(l.krw)}</td>
      <td><span class="badge ${p>=0?'pos':'neg'}">${p>=0?'+':''}$${p.toFixed(2)}</span></td>
      <td><span class="badge ${r>=0?'pos':'neg'}">${sgn(r,1)}%</span></td>
    </tr>`;
  }).join('');
}

function renderCapture(data) {
  const { best, worst, last, days } = calcStats(data);
  const today = data[data.length-1];
  document.getElementById('cap-title').textContent = S.title;
  document.getElementById('cap-meta').textContent = `${days} Days · ${new Date().toLocaleDateString('ko-KR')} · 시작일 ${S.startDate}`;
  const c = today.pnl >= 0 ? '#00c48c' : '#ff4d6a';
  document.getElementById('cap-pnl-val').textContent = (today.pnl >= 0 ? '+' : '') + '$' + today.pnl.toFixed(2);
  document.getElementById('cap-pnl-val').style.color = c;
  document.getElementById('cap-pnl-pct').textContent = sgn(today.pct, 2) + '%  당일 수익률';
  document.getElementById('cap-pnl-pct').style.color = c;
  document.getElementById('cap-grid').innerHTML = [
    { l: '현재 총자산', v: '$' + last.asset.toFixed(2) },
    { l: '총 수익률', v: sgn(last.cumPct, 2) + '%' },
    { l: '역대 최고 하루 수익', v: '+$' + best.toFixed(2) },
    { l: '역대 최악 하루 손실', v: '$' + worst.toFixed(2) },
    { l: '원화 환산', v: krwFmt(last.krw) },
    { l: '총 수익 (USDT)', v: sgn(last.cumPnl) + '$' },
  ].map(it => `<div class="cap-card"><div class="cap-card-lbl">${it.l}</div><div class="cap-card-val">${it.v}</div></div>`).join('');
}

function renderSettingsForm() {
  document.getElementById('s-title').value = S.title;
  document.getElementById('s-start').value = S.startDate;
  document.getElementById('s-seed').value = S.seed;
  document.getElementById('s-fx').value = S.fx;
  document.getElementById('s-goal').value = S.goal;
}

// ── 탭 ───────────────────────────────────────
const TABS = ['dashboard','log','monthly','capture','settings'];
function showTab(name) {
  TABS.forEach((t, i) => {
    document.getElementById('tab-'+t).classList.toggle('hidden', t !== name);
    const sideItems = document.querySelectorAll('.nav-item');
    const bottomItems = document.querySelectorAll('.bottom-tab');
    if (sideItems[i]) sideItems[i].classList.toggle('on', t === name);
    if (bottomItems[i]) bottomItems[i].classList.toggle('on', t === name);
  });
}

// ── CRUD ─────────────────────────────────────
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
  document.getElementById('inp-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('inp-asset').value = '';
  document.getElementById('inp-memo').value = '';
}

function delEntry(date) {
  E = E.filter(e => e.date !== date);
  persist(); render();
}

function saveSettings() {
  S.title = document.getElementById('s-title').value || S.title;
  S.startDate = document.getElementById('s-start').value || S.startDate;
  S.seed = parseFloat(document.getElementById('s-seed').value) || S.seed;
  S.fx = parseInt(document.getElementById('s-fx').value) || S.fx;
  S.goal = parseFloat(document.getElementById('s-goal').value) || S.goal;
  persist(); render(); showTab('dashboard');
}

function resetAll() {
  E = []; S = { ...DEFAULT_S };
  persist(); render(); showTab('dashboard');
}

// 엔터 → 기록 추가
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('tab-log').classList.contains('hidden')) addEntry();
});

clearInputs();
