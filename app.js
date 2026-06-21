// ── CCT · app.js ────────────────────────────

const DEFAULT_S = {
  title: 'My CCT',
  startDate: new Date().toISOString().slice(0,10),
  seed: 100, fx: 1400, goal: 10000, fxAuto: true,
  currency: 'KRW/USD', domestic: 'bithumb', overseas: 'binance',
  startPage: 'dashboard', theme: 'system',
};

let S = {...DEFAULT_S}, E = [], currentUser = null, lineChart = null;
let prevTab = 'dashboard', currentTab = 'dashboard';
let deferredPrompt = null;
const db = window._supabase;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // 설정 탭 버튼
  const btn = document.getElementById('pwa-install-btn');
  const lbl = document.getElementById('pwa-manual-lbl');
  if (btn) btn.style.display = '';
  if (lbl) lbl.style.display = 'none';
  // 첫 방문 배너
  if (!localStorage.getItem('pwaPromptDismissed')) {
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.style.display = 'flex';
  }
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  dismissPWABanner();
  const btn = document.getElementById('pwa-install-btn');
  const lbl = document.getElementById('pwa-installed-lbl');
  const ml  = document.getElementById('pwa-manual-lbl');
  if (btn) btn.style.display = 'none';
  if (lbl) lbl.style.display = '';
  if (ml)  ml.style.display = 'none';
});
function installPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(() => {
    deferredPrompt = null;
    dismissPWABanner();
  });
}
function dismissPWABanner() {
  localStorage.setItem('pwaPromptDismissed', '1');
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.style.display = 'none';
}

// ── 인증 ─────────────────────────────────────
db.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') { location.href = './auth.html'; return; }
  currentUser = session?.user ?? null;
  if (!currentUser) { location.href = './auth.html'; return; }
  updateAuthUI();
  await loadFromDB();
});

function updateAuthUI() {
  if (!currentUser) return;
  const email = currentUser.email || '';
  const name = email.split('@')[0];
  document.getElementById('user-avatar').textContent = email[0]?.toUpperCase() || 'U';
  document.getElementById('user-name').textContent = name;
  const sa = document.getElementById('settings-avatar');
  const su = document.getElementById('settings-username');
  const se = document.getElementById('settings-email');
  if (sa) sa.textContent = email[0]?.toUpperCase() || 'U';
  if (su) su.textContent = name;
  if (se) se.textContent = email;
}

async function doLogout() {
  await db.auth.signOut();
  location.href = './auth.html';
}

// ── 시세 ─────────────────────────────────────
let calcBtcPrice = 0;
let calcKrwBtcPrice = 0;
let realUsdKrw = 0;

async function fetchFx() {
  try {
    if (S.domestic === 'upbit') {
      const res = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT');
      if (res.ok) { const d = await res.json(); S.fx = Math.round(d[0].trade_price); }
    } else {
      const res = await fetch('https://api.bithumb.com/public/ticker/USDT_KRW');
      if (res.ok) { const d = await res.json(); if (d.status==='0000') S.fx = Math.round(parseFloat(d.data.closing_price)); }
    }
  } catch(_) {}
  render();
}

async function fetchMarketPrices() {
  const [btcRes, krwRes, fxRes] = await Promise.allSettled([
    (S.overseas === 'coinbase'
      ? fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot').then(r=>r.json()).then(d=>({btc:parseFloat(d.data.amount)}))
      : fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT').then(r=>r.json()).then(d=>({btc:parseFloat(d.price)}))),
    fetch('https://api.upbit.com/v1/ticker?markets=KRW-BTC').then(r=>r.json()).then(d=>({krwBtc:d[0].trade_price})),
    fetch('https://cdn.jsdelivr.net/gh/fawazahmed0/exchange-api@1/latest/currencies/usd/krw.json').then(r=>r.json()).then(d=>({usdKrw:d.krw}))
  ]);
  const r = {};
  if (btcRes.status==='fulfilled') Object.assign(r, btcRes.value);
  if (krwRes.status==='fulfilled') Object.assign(r, krwRes.value);
  if (fxRes.status==='fulfilled') Object.assign(r, fxRes.value);
  return r;
}

async function toggleFxAuto() {
  S.fxAuto = !S.fxAuto;
  renderSettingsForm();
  if (S.fxAuto) { await fetchFx(); toast('환율 자동 연동 켜짐 — ₩' + S.fx.toLocaleString()); }
  else toast('수동 입력으로 변경됐어요');
  persist();
}

// ── DB ───────────────────────────────────────
async function loadFromDB() {
  const { data: sd } = await db.from('cct_settings').select('*').eq('user_id', currentUser.id).single();
  if (sd) S = { ...DEFAULT_S, ...JSON.parse(sd.data) };
  applyTheme(S.theme || 'system');
  const { data: ed } = await db.from('cct_entries').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
  if (ed) E = ed.map(r => ({ date: r.date, asset: +r.asset, memo: r.memo || '' }));
  if (S.fxAuto) await fetchFx(); else render();
  if (S.startPage && S.startPage !== 'dashboard') showTab(S.startPage);
  fetchMarketPrices().then(p => {
    if (p.btc) {
      calcBtcPrice = p.btc;
      const el = document.getElementById('btc-price');
      if (el) el.textContent = '$' + Math.round(p.btc).toLocaleString();
    }
    if (p.krwBtc) calcKrwBtcPrice = p.krwBtc;
    if (p.usdKrw) {
      realUsdKrw = p.usdKrw;
      const el = document.getElementById('usd-krw');
      if (el) el.textContent = '₩' + Math.round(p.usdKrw).toLocaleString();
    }
    const usdt = document.getElementById('usdt-krw');
    if (usdt && S.fx) usdt.textContent = '₩' + S.fx.toLocaleString();
    updatePremiumDisplay();
    updateSatsPerUsd();
  });
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

// ── 토스트 ────────────────────────────────────
function toast(msg, type='ok') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${type==='ok'?'var(--green)':'var(--red)'};color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; setTimeout(() => el.remove(), 300); }, 2000);
}

// ── 렌더 ─────────────────────────────────────
function render() {
  if (!E.length) { renderEmpty(); return; }
  const data = calcData();
  const { best, worst, last, days } = calcStats(data);

  document.getElementById('dash-title').textContent = S.title;
  document.getElementById('dash-sub').textContent = `시작일 ${S.startDate} · 초기 시드 $${S.seed.toLocaleString()}`;
  const usdt = document.getElementById('usdt-krw');
  if (usdt) usdt.textContent = '₩' + S.fx.toLocaleString();
  if (realUsdKrw) { const el = document.getElementById('usd-krw'); if (el) el.textContent = '₩' + Math.round(realUsdKrw).toLocaleString(); }

  document.getElementById('r1').innerHTML =
    M('현재 총자산', '$' + last.asset.toFixed(2), 'lg') +
    M('총 수익률', sgn(last.cumPct, 2) + '%', last.cumPct >= 0 ? 'pos lg' : 'neg lg');

  document.getElementById('r2').innerHTML =
    M('총 수익 (USDT)', sgn(last.cumPnl), last.cumPnl >= 0 ? 'pos' : 'neg') +
    M('원화 환산', krwFmt(last.krw), '', '현재 총자산 기준');

  document.getElementById('r3').innerHTML =
    M('투자 기간', `${days} Days`, 'sm', S.startDate + ' 시작') +
    M('역대 최고 하루 수익', '+$' + best.toFixed(2), 'pos sm');

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
      <td style="white-space:nowrap">
        <button class="del-btn" style="border-color:rgba(61,126,255,.3);color:var(--accent);margin-right:4px" onclick="editEntry('${e.date}')">수정</button>
        <button class="del-btn" onclick="delEntry('${e.date}')">삭제</button>
      </td>
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
  if (!data.length) return;
  const { best, worst, last, days } = calcStats(data);
  const lastEntry = data[data.length-1];
  document.getElementById('cap-title').textContent = S.title;
  document.getElementById('cap-meta').textContent = `${days} Days · 시작일 ${S.startDate}`;
  const c = lastEntry.pnl >= 0 ? '#00c48c' : '#ff4d6a';
  document.getElementById('cap-pnl-val').textContent = (lastEntry.pnl >= 0 ? '+' : '') + '$' + lastEntry.pnl.toFixed(2);
  document.getElementById('cap-pnl-val').style.color = c;
  document.getElementById('cap-pnl-pct').textContent = sgn(lastEntry.pct, 2) + '%  당일 수익률';
  document.getElementById('cap-pnl-pct').style.color = c;
  document.getElementById('cap-grid').innerHTML = [
    { l: '현재 총자산',         v: '$' + last.asset.toFixed(2) },
    { l: '원화 환산',           v: krwFmt(last.krw), sub: '현재 총자산 기준' },
    { l: '총 수익률',           v: sgn(last.cumPct, 2) + '%' },
    { l: '총 수익 (USDT)',      v: (last.cumPnl >= 0 ? '+$' : '-$') + Math.abs(last.cumPnl).toFixed(2) },
    { l: '역대 최고 하루 수익', v: '+$' + best.toFixed(2) },
    { l: '투자 기간',           v: days + ' Days' },
  ].map(it => `<div class="cap-card"><div class="cap-card-lbl">${it.l}</div><div class="cap-card-val">${it.v}</div>${it.sub ? `<div style="font-size:10px;color:rgba(255,255,255,.3);margin-top:3px">${it.sub}</div>` : ''}</div>`).join('');
}

function renderSettingsForm() {
  document.getElementById('s-title').value = S.title;
  document.getElementById('s-start').value = S.startDate;
  document.getElementById('s-seed').value = S.seed;
  document.getElementById('s-goal').value = S.goal;
  const cur = document.getElementById('s-currency');
  const dom = document.getElementById('s-domestic');
  const ov  = document.getElementById('s-overseas');
  const sp  = document.getElementById('s-startpage');
  const th  = document.getElementById('s-theme');
  if (cur) cur.value = S.currency;
  if (dom) dom.value = S.domestic;
  if (ov)  ov.value  = S.overseas;
  if (sp)  sp.value  = S.startPage || 'dashboard';
  if (th)  th.value  = S.theme || 'system';
  const toggle = document.getElementById('fx-toggle');
  const knob   = document.getElementById('fx-knob');
  const lbl    = document.getElementById('fx-toggle-lbl');
  const manRow = document.getElementById('fx-manual-row');
  const sub    = document.getElementById('fx-sub');
  if (toggle) {
    toggle.style.background = S.fxAuto ? 'var(--green)' : 'var(--bg3)';
    knob.style.left = S.fxAuto ? '20px' : '2px';
    lbl.textContent = S.fxAuto ? '자동' : '수동';
    manRow.style.display = S.fxAuto ? 'none' : 'flex';
    sub.textContent = S.fxAuto ? `빗썸 실시간 · 현재 ₩${S.fx.toLocaleString()}` : '직접 입력';
    if (!S.fxAuto) document.getElementById('s-fx').value = S.fx;
  }
}

// ── 탭 ───────────────────────────────────────
// 순서 = 하단바 버튼 순서와 일치: 대시보드|기록|계산기|멤풀|유틸리티 (이후는 하단바 없음)
const TABS = ['dashboard','log','calc','mempool','utility','settings','capture','bip39','monthly'];
function showTab(name) {
  if (name !== currentTab) { prevTab = currentTab; currentTab = name; }
  TABS.forEach((t, i) => {
    document.getElementById('tab-'+t).classList.toggle('hidden', t !== name);
    const bottomItems = document.querySelectorAll('.bottom-tab');
    if (bottomItems[i]) bottomItems[i].classList.toggle('on', t === name);
  });
  if (name === 'calc') showCalcBar();
  if (name === 'mempool') fetchAndRenderMempool();
  if (name === 'utility') loadTopAssets();
  updateTopBar();
}

const GEAR_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;
const BACK_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;

const LIGHTNING_ADDRESS = 'hash@walletofsatoshi.com';

function copyLightning() {
  navigator.clipboard.writeText(LIGHTNING_ADDRESS).then(() => toast('⚡ 라이트닝 주소 복사됨'));
}

function toggleAccordion(id) {
  const body  = document.getElementById(id);
  const arrow = document.getElementById(id + '-arrow');
  const open  = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if (arrow) arrow.style.transform = open ? 'rotate(90deg)' : '';
}

function updateTopBar() {
  const btn = document.querySelector('.top-bar-settings');
  if (!btn) return;
  if (currentTab === 'settings' || currentTab === 'capture' || currentTab === 'bip39' || currentTab === 'monthly') {
    btn.setAttribute('aria-label', '뒤로');
    btn.innerHTML = BACK_SVG;
    btn.onclick = () => showTab(prevTab || 'dashboard');
  } else {
    btn.setAttribute('aria-label', '설정');
    btn.innerHTML = GEAR_SVG;
    btn.onclick = () => showTab('settings');
  }
}

// ── CRUD ─────────────────────────────────────
function addEntry() {
  const date  = document.getElementById('inp-date').value;
  const asset = parseFloat(document.getElementById('inp-asset').value);
  const memo  = document.getElementById('inp-memo').value.trim();
  if (!date || isNaN(asset) || asset < 0) return;
  const idx = E.findIndex(e => e.date === date);
  if (idx >= 0) E[idx] = { date, asset, memo };
  else { E.push({ date, asset, memo }); E.sort((a, b) => a.date.localeCompare(b.date)); }
  persist(); render(); setNextDate();
}

function setNextDate() {
  if (E.length > 0) {
    const last = E[E.length-1].date;
    const next = new Date(last+'T00:00:00');
    next.setDate(next.getDate() + 1);
    document.getElementById('inp-date').value = next.toISOString().slice(0,10);
  } else {
    document.getElementById('inp-date').value = new Date().toISOString().slice(0,10);
  }
  document.getElementById('inp-asset').value = '';
  document.getElementById('inp-memo').value = '';
}

function clearInputs() {
  document.getElementById('inp-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('inp-asset').value = '';
  document.getElementById('inp-memo').value = '';
}

function editEntry(date) {
  const entry = E.find(e => e.date === date);
  if (!entry) return;
  document.getElementById('inp-date').value = entry.date;
  document.getElementById('inp-asset').value = entry.asset;
  document.getElementById('inp-memo').value = entry.memo || '';
  const card = document.querySelector('#tab-log .card');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('inp-asset').focus();
}

function delEntry(date) {
  E = E.filter(e => e.date !== date);
  persist(); render();
}

function saveSettings() {
  S.title     = document.getElementById('s-title').value || S.title;
  S.startDate = document.getElementById('s-start').value || S.startDate;
  S.seed      = parseFloat(document.getElementById('s-seed').value) || S.seed;
  S.goal      = parseFloat(document.getElementById('s-goal').value) || S.goal;
  S.currency  = document.getElementById('s-currency')?.value || S.currency;
  S.domestic  = document.getElementById('s-domestic')?.value || S.domestic;
  S.overseas  = document.getElementById('s-overseas')?.value || S.overseas;
  S.startPage = document.getElementById('s-startpage')?.value || S.startPage;
  if (!S.fxAuto) S.fx = parseInt(document.getElementById('s-fx')?.value) || S.fx;
  else fetchFx();
  persist(); render();
  toast('설정이 저장됐어요');
}

function resetAll() {
  const btn = document.getElementById('btn-reset');
  if (btn.dataset.confirm !== 'yes') {
    btn.textContent = '정말? 한 번 더 클릭';
    btn.dataset.confirm = 'yes';
    setTimeout(() => { btn.textContent = '전체 초기화'; btn.dataset.confirm = ''; }, 3000);
    return;
  }
  E = []; S = { ...DEFAULT_S };
  persist(); render(); showTab('dashboard');
  toast('초기화됐어요', 'err');
}

// ── 김치 프리미엄 ─────────────────────────────
function updatePremiumDisplay() {
  if (!calcBtcPrice || !calcKrwBtcPrice) return;
  const fx = S.fx;
  const overseasKrw = Math.round(calcBtcPrice * fx);
  const premDiff = calcKrwBtcPrice - overseasKrw;
  const prem = (premDiff / overseasKrw) * 100;
  const pos = prem >= 0;
  const fmtPct = (pos ? '+' : '') + prem.toFixed(2) + '%';
  const color = pos ? 'var(--green)' : 'var(--red)';
  const realFx = realUsdKrw || fx;

  const set = (id, txt, col) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = txt;
    if (col !== undefined) el.style.color = col;
  };

  set('dash-kimchi', fmtPct, color);
  set('prem-pct', fmtPct, color);
  set('prem-diff-krw', (premDiff >= 0 ? '+' : '') + Math.round(premDiff).toLocaleString() + ' KRW', color);
  set('prem-diff-usd', (premDiff >= 0 ? '+' : '') + Math.round(premDiff / realFx).toLocaleString() + ' USD');
  set('prem-kr-krw', Math.round(calcKrwBtcPrice).toLocaleString() + ' KRW');
  set('prem-kr-usd', Math.round(calcKrwBtcPrice / realFx).toLocaleString() + ' USD');
  set('prem-os-krw', overseasKrw.toLocaleString() + ' KRW');
  set('prem-os-usd', Math.round(calcBtcPrice).toLocaleString() + ' USD');
  set('prem-fx', '₩' + Math.round(realFx).toLocaleString());
}

function updateSatsPerUsd() {
  if (!calcBtcPrice) return;
  const sats = Math.round(100_000_000 / calcBtcPrice);
  const el = document.getElementById('calc-sats-per-usd');
  if (el) el.textContent = sats.toLocaleString();
}

// ── 멤풀 ─────────────────────────────────────
const NEXT_HALVING_BLOCK = 1_050_000;
let _mempoolCacheAt = 0;

async function fetchAndRenderMempool() {
  if (Date.now() - _mempoolCacheAt < 30000) return;
  const heightEl = document.getElementById('mp-block-height');
  const [heightRes, feesRes] = await Promise.allSettled([
    fetch('https://mempool.space/api/blocks/tip/height').then(r => r.json()),
    fetch('https://mempool.space/api/v1/fees/recommended').then(r => r.json()),
  ]);
  if (heightRes.status === 'fulfilled') {
    const height = heightRes.value;
    if (heightEl) heightEl.textContent = height.toLocaleString();
    const remain = Math.max(0, NEXT_HALVING_BLOCK - height);
    const el = document.getElementById('mp-halving-remain');
    if (el) el.textContent = remain.toLocaleString() + ' 블록';
    const minutesLeft = remain * 10;
    const msLeft = minutesLeft * 60 * 1000;
    const eta = new Date(Date.now() + msLeft);
    const dateEl = document.getElementById('mp-halving-date');
    const daysEl = document.getElementById('mp-halving-days');
    if (dateEl) dateEl.textContent = eta.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' });
    const daysLeft = Math.round(minutesLeft / 60 / 24);
    if (daysEl) daysEl.textContent = '약 ' + daysLeft.toLocaleString() + '일 후 (예상)';
    _mempoolCacheAt = Date.now();
  }
  if (feesRes.status === 'fulfilled') {
    const f = feesRes.value;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '-'; };
    set('mp-fee-fast', f.fastestFee);
    set('mp-fee-half', f.halfHourFee);
    set('mp-fee-hour', f.hourFee);
  }
}

function toggleHalvingInfo() {
  const body = document.getElementById('mp-acc-body');
  const arrow = document.getElementById('mp-acc-arrow');
  const open = body.classList.toggle('open');
  if (arrow) arrow.style.transform = open ? 'rotate(90deg)' : '';
}

// ── Top Assets ─────────────────────────────
let _topAssetsCacheAt = 0;

async function loadTopAssets(force = false) {
  if (!force && Date.now() - _topAssetsCacheAt < 60000) return;
  const loading = document.getElementById('top-assets-loading');
  const list    = document.getElementById('top-assets-list');
  const updated = document.getElementById('top-assets-updated');
  if (!list) return;
  if (loading) loading.style.display = '';
  list.style.display = 'none';
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h');
    if (!res.ok) throw new Error('api error');
    const coins = await res.json();
    const fmtMcap = v => {
      if (v >= 1e12) return '$' + (v/1e12).toFixed(2) + 'T';
      if (v >= 1e9)  return '$' + (v/1e9).toFixed(1) + 'B';
      return '$' + (v/1e6).toFixed(0) + 'M';
    };
    const fmtPrice = v => {
      if (v >= 1000) return '$' + Math.round(v).toLocaleString();
      if (v >= 1)    return '$' + v.toFixed(2);
      return '$' + v.toPrecision(4);
    };
    list.innerHTML = coins.map((c, i) => {
      const chg = c.price_change_percentage_24h ?? 0;
      const chgColor = chg >= 0 ? 'var(--green)' : 'var(--red)';
      const chgSign = chg >= 0 ? '+' : '';
      return `<div class="ta-row">
        <span class="ta-rank">${i+1}</span>
        <img class="ta-icon" src="${c.image}" alt="${c.symbol}" onerror="this.style.display='none'">
        <div class="ta-name">
          <div class="ta-sym">${c.symbol.toUpperCase()}</div>
          <div class="ta-full">${c.name}</div>
        </div>
        <div class="ta-right">
          <div class="ta-price">${fmtPrice(c.current_price)}</div>
          <div class="ta-mcap">${fmtMcap(c.market_cap)}</div>
        </div>
        <span class="ta-chg" style="color:${chgColor}">${chgSign}${chg.toFixed(2)}%</span>
      </div>`;
    }).join('');
    if (loading) loading.style.display = 'none';
    list.style.display = '';
    _topAssetsCacheAt = Date.now();
    if (updated) {
      const t = new Date();
      updated.textContent = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')} 업데이트`;
    }
  } catch(_) {
    if (loading) loading.textContent = '불러오기 실패 — 새로고침을 눌러보세요';
  }
}

// ── 테마 ─────────────────────────────────────
function applyTheme(theme) {
  const actual = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = actual;
}

function saveTheme(theme) {
  S.theme = theme;
  localStorage.setItem('theme', theme);
  applyTheme(theme);
  persist();
}

// ── 환산 계산기 ───────────────────────────────
let calcUnit = localStorage.getItem('calcUnit') || 'USD';
let _btcCacheAt = 0;

async function refreshCalcPrices() {
  const s = (id, t) => { const el = document.getElementById(id); if(el) el.textContent = t; };

  // 이미 가진 값 즉시 표시 (탭 열자마자 보이도록)
  const showCurrent = () => {
    s('calc-rate',        S.fx > 0 ? S.fx.toLocaleString() : '-');
    s('calc-rate2',       S.fx > 0 ? S.fx.toLocaleString() : '-');
    s('calc-btc-price',   calcBtcPrice > 0 ? Math.round(calcBtcPrice).toLocaleString() : '-');
    s('calc-btc-krw-lbl', calcKrwBtcPrice > 0 ? '₩' + Math.round(calcKrwBtcPrice).toLocaleString()
                          : calcBtcPrice > 0 ? '₩' + Math.round(calcBtcPrice * S.fx).toLocaleString() : '-');
    s('calc-btc-usd-lbl', calcBtcPrice > 0 ? Math.round(calcBtcPrice).toLocaleString() : '-');
    s('calc-rate-bar',    calcBtcPrice > 0
      ? `해외 $${Math.round(calcBtcPrice).toLocaleString()} · 업비트 ₩${calcKrwBtcPrice > 0 ? Math.round(calcKrwBtcPrice).toLocaleString() : Math.round(calcBtcPrice * S.fx).toLocaleString()}`
      : '시세 로딩 중...');
    updateSatsPerUsd();
  };
  showCurrent();

  // 60초 캐시: 신선한 데이터 fetch
  if (Date.now() - _btcCacheAt > 60000) {
    const p = await fetchMarketPrices();
    if (p.btc) calcBtcPrice = p.btc;
    if (p.krwBtc) calcKrwBtcPrice = p.krwBtc;
    if (p.usdKrw) {
      realUsdKrw = p.usdKrw;
      const el = document.getElementById('usd-krw');
      if (el) el.textContent = '₩' + Math.round(p.usdKrw).toLocaleString();
    }
    if (S.fxAuto) {
      try {
        if (S.domestic === 'upbit') {
          const res = await fetch('https://api.upbit.com/v1/ticker?markets=KRW-USDT');
          if (res.ok) { const d = await res.json(); S.fx = Math.round(d[0].trade_price); }
        } else {
          const res = await fetch('https://api.bithumb.com/public/ticker/USDT_KRW');
          if (res.ok) { const d = await res.json(); if (d.status==='0000') S.fx = Math.round(parseFloat(d.data.closing_price)); }
        }
      } catch(_) {}
    }
    _btcCacheAt = Date.now();
    showCurrent();
    updatePremiumDisplay();
    updateSatsPerUsd();
  }

  const inp = document.getElementById('calc-input');
  if (inp && inp.value) calcConvert(inp.value);
}

function toUSD(val, unit) {
  switch(unit) {
    case 'BTC':  return val * calcBtcPrice;
    case 'KRW':  return val / S.fx;
    case 'Sats': return (val / 100000000) * calcBtcPrice;
    default:     return val;
  }
}

function calcConvert(raw) {
  const val = parseFloat(raw) || 0;
  const cur = calcUnit.toLowerCase();
  const hideRow = u => { const r = document.getElementById('calc-row-' + u); if (r) r.style.display = u === cur ? 'none' : ''; };
  ['btc','sats','krw','usd'].forEach(hideRow);
  const s = (id, t) => { const el = document.getElementById(id); if(el) el.textContent = t; };
  if (!val) { ['calc-btc','calc-sats','calc-krw','calc-usd'].forEach(id => s(id, '-')); return; }
  const usd = toUSD(val, calcUnit);
  const btc = calcBtcPrice > 0 ? usd / calcBtcPrice : 0;
  const hasBtc = calcBtcPrice > 0;
  s('calc-btc',  hasBtc ? btc.toFixed(8) : '-');
  s('calc-sats', hasBtc ? Math.round(btc * 100000000).toLocaleString() : '-');
  s('calc-krw',  '₩' + Math.round(usd * S.fx).toLocaleString());
  s('calc-usd',  '$' + usd.toFixed(2));
}

function setUnit(unit) {
  // 현재 입력값을 새 단위로 환산해서 유지
  const inp = document.getElementById('calc-input');
  const prevVal = parseFloat(inp?.value) || 0;
  let newVal = '';
  if (prevVal && calcBtcPrice > 0) {
    const usd = toUSD(prevVal, calcUnit);
    if (unit === 'BTC')       newVal = (usd / calcBtcPrice).toFixed(8);
    else if (unit === 'Sats') newVal = Math.round(usd / calcBtcPrice * 100000000).toString();
    else if (unit === 'KRW')  newVal = Math.round(usd * S.fx).toString();
    else                      newVal = usd.toFixed(2);
  }

  calcUnit = unit;
  localStorage.setItem('calcUnit', unit);
  document.getElementById('unit-label').textContent = unit;
  document.querySelectorAll('.unit-option').forEach(el => {
    const u = el.textContent.replace(' ✓', '').trim();
    el.classList.toggle('active', u === unit);
    el.textContent = u + (u === unit ? ' ✓' : '');
  });
  document.getElementById('unit-menu').style.display = 'none';
  const cur = unit.toLowerCase();
  ['btc','sats','krw','usd'].forEach(u => {
    const row = document.getElementById('calc-row-' + u);
    if (row) row.style.display = u === cur ? 'none' : '';
  });
  if (inp) { inp.value = newVal; inp.focus(); }
  if (newVal) calcConvert(newVal);
  else ['calc-btc','calc-sats','calc-krw','calc-usd'].forEach(id => {
    const el = document.getElementById(id); if(el) el.textContent = '-';
  });
}

function toggleUnitMenu() {
  const m = document.getElementById('unit-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

function showCalcBar() {
  // 저장된 단위 UI 동기화
  const lbl = document.getElementById('unit-label');
  if (lbl) lbl.textContent = calcUnit;
  document.querySelectorAll('.unit-option').forEach(el => {
    const u = el.textContent.replace(' ✓', '').trim();
    el.classList.toggle('active', u === calcUnit);
    el.textContent = u + (u === calcUnit ? ' ✓' : '');
  });
  const cur = calcUnit.toLowerCase();
  ['btc','sats','krw','usd'].forEach(u => {
    const row = document.getElementById('calc-row-' + u);
    if (row) row.style.display = u === cur ? 'none' : '';
  });
  refreshCalcPrices();
  const inp = document.getElementById('calc-input');
  if (inp) inp.focus();
}

function clearCalc() {
  const inp = document.getElementById('calc-input');
  if (inp) inp.value = '';
  ['calc-btc','calc-sats','calc-krw','calc-usd'].forEach(id => {
    const el = document.getElementById(id); if(el) el.textContent = '-';
  });
}

function copyCalc(id) {
  const el = document.getElementById(id);
  if (!el || el.textContent === '-') return;
  navigator.clipboard.writeText(el.textContent.replace(/[₩$,]/g, '').trim())
    .then(() => toast('복사됐어요'));
}


document.addEventListener('click', e => {
  const menu = document.getElementById('unit-menu');
  const btn  = document.getElementById('unit-btn');
  if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target))
    menu.style.display = 'none';
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('tab-log').classList.contains('hidden')) addEntry();
});

clearInputs();

// ── BIP39 ─────────────────────────────────────
let bip39Words = null;

async function showBIP39() {
  showTab('bip39');
  if (bip39Words) return;
  try {
    const res = await fetch('https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt');
    const text = await res.text();
    bip39Words = text.trim().split('\n').map(w => w.trim()).filter(Boolean);
    renderBIP39List(bip39Words);
  } catch(e) {
    const el = document.getElementById('bip39-list');
    if (el) el.innerHTML = '<div style="color:var(--red);text-align:center;padding:2rem">목록 로드 실패. 네트워크를 확인해주세요.</div>';
  }
}

function filterBIP39(query) {
  if (!bip39Words) return;
  const q = query.toLowerCase().trim();
  const filtered = q ? bip39Words.filter(w => w.startsWith(q)) : bip39Words;
  renderBIP39List(filtered, !!q);
}

function renderBIP39List(words, isFiltered) {
  const el = document.getElementById('bip39-list');
  if (!el) return;
  if (!words.length) {
    el.innerHTML = '<div style="color:var(--text3);text-align:center;padding:2rem">검색 결과 없음</div>';
    return;
  }
  let html = `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-weight:700;font-size:11px;color:var(--text3);letter-spacing:.06em;text-transform:uppercase"><span>단어</span><span>Binary (11-bit)</span></div>`;
  words.forEach(word => {
    const idx = bip39Words.indexOf(word);
    const num = idx + 1;
    const bin = num.toString(2).padStart(11, '0');
    const g1 = bin.slice(0,4).split('').map(b => b==='1'?'●':'○').join('');
    const g2 = bin.slice(4,8).split('').map(b => b==='1'?'●':'○').join('');
    const g3 = bin.slice(8,11).split('').map(b => b==='1'?'●':'○').join('');
    html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)"><span><span style="color:var(--text3);display:inline-block;min-width:36px;font-size:12px">${num}.</span><span style="color:var(--accent);font-weight:500">${word}</span></span><span style="font-size:11px;color:var(--text2);letter-spacing:2px;font-family:monospace">${g1} ${g2} ${g3}</span></div>`;
  });
  el.innerHTML = html;
}
