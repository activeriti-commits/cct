// ── CCT · app.js ────────────────────────────

const DEFAULT_S = {
  title: 'My CCT',
  startDate: new Date().toISOString().slice(0,10),
  seed: 100, fx: 1400, goal: 10000, fxAuto: true,
  currency: 'KRW/USD', domestic: 'bithumb', overseas: 'binance',
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

// ── 시세 ─────────────────────────────────────
let calcBtcPrice = 0;

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
  const r = {};
  try {
    if (S.overseas === 'coinbase') {
      const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      if (res.ok) { const d = await res.json(); r.btc = parseFloat(d.data.amount); }
    } else {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      if (res.ok) { const d = await res.json(); r.btc = parseFloat(d.price); }
    }
  } catch(_) {}
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
  const { data: ed } = await db.from('cct_entries').select('*').eq('user_id', currentUser.id).order('date', { ascending: true });
  if (ed) E = ed.map(r => ({ date: r.date, asset: +r.asset, memo: r.memo || '' }));
  if (S.fxAuto) await fetchFx(); else render();
  fetchMarketPrices().then(p => {
    if (p.btc) {
      calcBtcPrice = p.btc;
      const el = document.getElementById('btc-price');
      if (el) el.textContent = '$' + Math.round(p.btc).toLocaleString();
    }
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

  document.getElementById('r1').innerHTML =
    M('총 수익 (USDT)', sgn(last.cumPnl), last.cumPnl >= 0 ? 'pos' : 'neg') +
    M('원화 환산', krwFmt(last.krw), '', '현재 총자산 기준');

  document.getElementById('r2').innerHTML =
    M('총 수익률', sgn(last.cumPct, 2) + '%', last.cumPct >= 0 ? 'pos' : 'neg') +
    M('투자 기간', `${days} Days`, 'sm', S.startDate + ' 시작');

  document.getElementById('r3').innerHTML =
    M('역대 최고 하루 수익', '+$' + best.toFixed(2), 'pos sm') +
    M('역대 최악 하루 손실', '$' + worst.toFixed(2), 'neg sm') +
    M('환율', '₩' + S.fx.toLocaleString() + (S.fxAuto ? ' 🔄' : ''), 'sm', 'KRW/USDT');

  document.getElementById('r4').innerHTML =
    M('현재 총자산', '$' + last.asset.toFixed(2), 'sm') +
    M('초기 시드', '$' + S.seed, 'sm') +
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
    { l: '역대 최악 하루 손실', v: '-$' + Math.abs(worst).toFixed(2) },
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
  if (cur) cur.value = S.currency;
  if (dom) dom.value = S.domestic;
  if (ov)  ov.value  = S.overseas;
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
const TABS = ['dashboard','log','monthly','capture','calc','settings'];
function showTab(name) {
  TABS.forEach((t, i) => {
    document.getElementById('tab-'+t).classList.toggle('hidden', t !== name);
    const sideItems   = document.querySelectorAll('.nav-item');
    const bottomItems = document.querySelectorAll('.bottom-tab');
    if (sideItems[i])   sideItems[i].classList.toggle('on', t === name);
    if (bottomItems[i]) bottomItems[i].classList.toggle('on', t === name);
  });
  if (name === 'calc') showCalcBar();
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
  if (!S.fxAuto) S.fx = parseInt(document.getElementById('s-fx')?.value) || S.fx;
  else fetchFx();
  persist(); render(); showTab('dashboard');
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

// ── 환산 계산기 ───────────────────────────────
let calcUnit = 'USD';
let _btcCacheAt = 0;

async function refreshCalcPrices() {
  const s = (id, t) => { const el = document.getElementById(id); if(el) el.textContent = t; };

  // 이미 가진 값 즉시 표시 (탭 열자마자 보이도록)
  const showCurrent = () => {
    s('calc-rate',        S.fx > 0 ? S.fx.toLocaleString() : '-');
    s('calc-rate2',       S.fx > 0 ? S.fx.toLocaleString() : '-');
    s('calc-btc-price',   calcBtcPrice > 0 ? Math.round(calcBtcPrice).toLocaleString() : '-');
    s('calc-btc-krw-lbl', calcBtcPrice > 0 ? '₩' + Math.round(calcBtcPrice * S.fx).toLocaleString() : '-');
    s('calc-btc-usd-lbl', calcBtcPrice > 0 ? Math.round(calcBtcPrice).toLocaleString() : '-');
    s('calc-rate-bar',    calcBtcPrice > 0
      ? `1BTC = $${Math.round(calcBtcPrice).toLocaleString()} · ₩${Math.round(calcBtcPrice * S.fx).toLocaleString()}`
      : '시세 로딩 중...');
  };
  showCurrent();

  // 60초 캐시: 신선한 데이터 fetch
  if (Date.now() - _btcCacheAt > 60000) {
    const p = await fetchMarketPrices();
    if (p.btc) calcBtcPrice = p.btc;
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
  ['btc','sats','krw','usd'].forEach(u => {
    const row = document.getElementById('calc-row-' + u);
    if (row) row.style.display = u === cur ? 'none' : '';
  });
  const s = (id, t) => { const el = document.getElementById(id); if(el) el.textContent = t; };
  if (!val) { ['calc-btc','calc-sats','calc-krw','calc-usd'].forEach(id => s(id, '-')); return; }
  const premium = parseFloat(document.getElementById('calc-premium')?.value || 0) / 100;
  const usd = toUSD(val, calcUnit);
  const btc = calcBtcPrice > 0 ? usd / calcBtcPrice : 0;
  const hasBtc = calcBtcPrice > 0;
  s('calc-btc',  hasBtc ? btc.toFixed(8) : '-');
  s('calc-sats', hasBtc ? Math.round(btc * 100000000).toLocaleString() : '-');
  s('calc-krw',  '₩' + Math.round(usd * S.fx * (1 + premium)).toLocaleString());
  s('calc-usd',  '$' + usd.toFixed(2));
}

function setUnit(unit) {
  calcUnit = unit;
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
  const inp = document.getElementById('calc-input');
  if (inp) { inp.value = ''; inp.focus(); }
  ['calc-btc','calc-sats','calc-krw','calc-usd'].forEach(id => {
    const el = document.getElementById(id); if(el) el.textContent = '-';
  });
}

function toggleUnitMenu() {
  const m = document.getElementById('unit-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

function showCalcBar() {
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

function adjPremium(delta) {
  const el = document.getElementById('calc-premium');
  if (!el) return;
  el.value = Math.round((parseFloat(el.value || 0) + delta) * 10) / 10;
  const inp = document.getElementById('calc-input');
  if (inp && inp.value) calcConvert(inp.value);
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
