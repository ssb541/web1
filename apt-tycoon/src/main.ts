import { BDEFS, BUILD_ORDER, BType, ROLES, ROLE_ORDER, Role, SEASON_NAMES, SEASON_ICON, RANKS, APT_HH, fmt, N, POST_R } from './data';
import { Game, Staff, Resident, EV, ToastKind, clamp } from './game';
import { Renderer, View } from './render';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

let g = new Game();
const renderer = new Renderer($('world') as HTMLCanvasElement, $('over') as HTMLCanvasElement);
const view: View = {
  camX: 16, camY: 150, S: window.innerWidth < 700 ? 1 : 2, hover: null, tool: null, rot: false,
  selected: null, carrying: null, mouse: { x: 0, y: 0 }, placeStaff: null, ghostOk: false,
};
let started = false;

// ───────── 토스트 ─────────
function toast(text: string, kind: ToastKind = 'info') {
  const box = $('toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + kind; d.textContent = text;
  box.appendChild(d);
  while (box.children.length > 4) box.removeChild(box.firstChild!);
  setTimeout(() => d.remove(), kind === 'bad' ? 6500 : 4500);
}
function bindGame() { g.onToast = toast; }
bindGame();

// ───────── 카메라/줌 ─────────
function clampCam() {
  view.camX = clamp(view.camX, -N * 16 - 40, N * 16 + 40);
  view.camY = clamp(view.camY, -30, N * 16 + 50);
}
function setZoom(S: number) {
  view.S = clamp(S, 1, 4); renderer.resize(view.S);
}
function focusTile(x: number, y: number) { view.camX = (x - y) * 16; view.camY = (x + y) * 8; clampCam(); }
function measureUI() {
  const root = document.documentElement.style;
  root.setProperty('--hudh', Math.ceil($('hud').getBoundingClientRect().height) + 'px');
  root.setProperty('--tbh', Math.ceil($('toolbar').getBoundingClientRect().height) + 'px');
}
function resize() { measureUI(); renderer.resize(view.S); }
window.addEventListener('resize', resize);
if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(measureUI); ro.observe($('hud')); ro.observe($('toolbar')); }
resize();

// ───────── 툴바 ─────────
function buildToolbar() {
  const tb = $('toolbar');
  let h = `<button class="tb" data-tool="" title="선택 (Esc)"><span class="ti">👆</span><span class="tn">선택</span><span class="tc">&nbsp;</span></button>`;
  for (const k of BUILD_ORDER) {
    const d = BDEFS[k];
    h += `<button class="tb" data-tool="${k}" title="${esc(d.desc)}"><span class="ti">${d.icon}</span><span class="tn">${d.name}</span><span class="tc">${fmt(d.cost)}</span></button>`;
  }
  h += `<button class="tb" data-tool="demolish" title="철거 (50% 환급)"><span class="ti">🔨</span><span class="tn">철거</span><span class="tc">환급50%</span></button>`;
  h += `<button class="tb" data-act="rot" title="회전 (R)"><span class="ti">🔄</span><span class="tn">회전</span><span class="tc">R</span></button>`;
  tb.innerHTML = h;
}
buildToolbar();
function refreshToolbar() {
  for (const el of Array.from($('toolbar').querySelectorAll<HTMLElement>('[data-tool]'))) {
    const t = el.dataset.tool as BType | 'demolish' | '';
    el.classList.toggle('on', (t || null) === view.tool);
    el.classList.toggle('poor', !!t && t !== 'demolish' && g.funds < BDEFS[t as BType].cost);
  }
}
function setTool(t: BType | 'demolish' | null) {
  view.tool = t; view.placeStaff = null; view.rot = false;
  if (t) view.selected = null;
  updateGhost(); refreshToolbar();
}

// ───────── 입력 ─────────
const canvas = $('over') as HTMLCanvasElement;
interface Down { x: number; y: number; cx: number; cy: number; moved: boolean; button: number; staff: Staff | null; id: number }
const downs = new Map<number, Down>();
let pinch: { d: number; S: number } | null = null;

function tileAt(sx: number, sy: number) { const t = renderer.toTile(sx, sy); return { x: Math.floor(t.x), y: Math.floor(t.y) }; }
function anchorFor(tool: BType, tx: number, ty: number) {
  const d = BDEFS[tool]; const w = view.rot ? d.h : d.w, h = view.rot ? d.w : d.h;
  return { x: tx - Math.floor((w - 1) / 2), y: ty - Math.floor((h - 1) / 2), w, h };
}
function updateGhost() {
  const m = view.mouse; const t = tileAt(m.x, m.y);
  if (view.tool && view.tool !== 'demolish') {
    const a = anchorFor(view.tool, t.x, t.y);
    view.hover = { x: a.x, y: a.y };
    view.ghostOk = g.canPlace(view.tool, a.x, a.y, a.w, a.h).ok;
  } else view.hover = t;
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (!started) return;
  canvas.setPointerCapture(e.pointerId);
  view.mouse = { x: e.clientX, y: e.clientY };
  if (e.button === 2) { if (view.tool || view.placeStaff) { setTool(null); } }
  let staff: Staff | null = null;
  if (e.button === 0 && !view.tool && !view.placeStaff) {
    const h = renderer.hit(g, e.clientX, e.clientY);
    if (h && h.kind === 'staff') staff = g.staff.find(s => s.id === h.id) ?? null;
  }
  downs.set(e.pointerId, { x: e.clientX, y: e.clientY, cx: view.camX, cy: view.camY, moved: false, button: e.button, staff, id: e.pointerId });
  if (downs.size === 2) {
    const [a, b] = Array.from(downs.values());
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), S: view.S };
    for (const d of downs.values()) { d.moved = true; if (d.staff) { d.staff = null; } }
    if (view.carrying) { g.dropStaff(view.carrying, 0, 0); view.carrying = null; }
  }
});
canvas.addEventListener('pointermove', e => {
  view.mouse = { x: e.clientX, y: e.clientY };
  const d = downs.get(e.pointerId);
  if (pinch && downs.size === 2) {
    d && (d.x = e.clientX, d.y = e.clientY);
    const [a, b] = Array.from(downs.values()); const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const target = Math.round(clamp(pinch.S * dist / pinch.d, 1, 4));
    if (target !== view.S) setZoom(target);
    return;
  }
  if (d) {
    const dist = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (!d.moved && dist > 7) {
      d.moved = true;
      if (d.staff) { g.pickUp(d.staff); view.carrying = d.staff; view.selected = { kind: 'staff', id: d.staff.id }; }
    }
    if (d.moved && !d.staff) {
      view.camX = d.cx - (e.clientX - d.x) / view.S; view.camY = d.cy - (e.clientY - d.y) / view.S; clampCam();
    }
  }
  updateGhost();
});
function endPointer(e: PointerEvent, cancel: boolean) {
  const d = downs.get(e.pointerId);
  downs.delete(e.pointerId);
  if (downs.size < 2) pinch = null;
  if (!d || cancel) { if (view.carrying) { g.dropStaff(view.carrying, tileAt(e.clientX, e.clientY).x, tileAt(e.clientX, e.clientY).y); view.carrying = null; } return; }
  view.mouse = { x: e.clientX, y: e.clientY };
  const t = tileAt(e.clientX, e.clientY);
  if (view.carrying) {
    const s = view.carrying; view.carrying = null;
    g.dropStaff(s, t.x, t.y);
    toast(`${s.name}을(를) 이 구역에 배치했어요 (반경 ${POST_R}칸)`, 'good');
    return;
  }
  if (d.moved || d.button !== 0) return;
  // 클릭
  if (view.placeStaff) {
    const s = view.placeStaff; view.placeStaff = null; g.dropStaff(s, t.x, t.y);
    toast(`${s.name}을(를) 이 구역에 배치했어요`, 'good'); return;
  }
  if (view.tool === 'demolish') {
    const id = t.x >= 0 && t.y >= 0 && t.x < N && t.y < N ? g.grid[t.y * N + t.x] : 0;
    const b = id > 0 ? g.bById(id) : null;
    if (b) { g.demolish(b); if (view.selected?.id === b.id) view.selected = null; } else toast('철거할 건물을 클릭하세요', 'info');
    return;
  }
  if (view.tool) {
    const a = anchorFor(view.tool, t.x, t.y);
    const b = g.place(view.tool, a.x, a.y, a.w, a.h);
    if (b) { view.selected = null; }
    updateGhost();
    return;
  }
  const h = renderer.hit(g, e.clientX, e.clientY);
  view.selected = h;
  if (h?.kind === 'event') { setTab('events'); }
  if (h?.kind === 'staff') { setTab('staff'); }
}
canvas.addEventListener('pointerup', e => endPointer(e, false));
canvas.addEventListener('pointercancel', e => endPointer(e, true));
canvas.addEventListener('wheel', e => { e.preventDefault(); setZoom(view.S + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });

const keys = new Set<string>();
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (!started) return;
  if (k === ' ') { e.preventDefault(); setSpeed(g.speed === 0 ? 1 : 0); }
  else if (k === '1' || k === '2' || k === '3') setSpeed(Number(k));
  else if (k === 'escape') { setTool(null); view.selected = null; view.placeStaff = null; }
  else if (k === 'r') { view.rot = !view.rot; updateGhost(); }
  else if (k === '+' || k === '=') setZoom(view.S + 1);
  else if (k === '-' || k === '_') setZoom(view.S - 1);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

function setSpeed(v: number) { if (g.state === 'play') g.speed = v; }

// ───────── 사이드 패널 ─────────
type Tab = 'staff' | 'events' | 'status' | 'report';
let tab: Tab = 'staff';
let sideCollapsed = window.innerWidth < 820;
const TABS: [Tab, string][] = [['staff', '👷 직원'], ['events', '📢 민원'], ['status', '📊 현황'], ['report', '🧾 정산']];
function buildTabs() {
  $('tabs').innerHTML = TABS.map(([k, n]) => `<button data-act="tab" data-v="${k}" class="${k === tab && !sideCollapsed ? 'on' : ''}">${n}${k === 'events' ? `<span id="evcount"></span>` : ''}</button>`).join('');
}
function setTab(t: Tab) { tab = t; sideCollapsed = false; buildTabs(); lastSig = ''; renderSide(); }
let lastSig = '';

function roleIcon(r: Role) { return ROLES[r].icon; }

function renderSide() {
  $('side').classList.toggle('collapsed', sideCollapsed);
  if (sideCollapsed) return;
  let sig = '', html = '';
  if (tab === 'staff') {
    const cap = g.staffCap();
    sig = `s|${g.staff.map(s => s.id + (s.post ? 'p' : '') + (view.selected?.id === s.id ? '*' : '')).join(',')}|${ROLE_ORDER.map(r => (g.funds >= ROLES[r].hire ? 1 : 0)).join('')}|${g.staff.length >= cap}|${cap}`;
    if (sig !== lastSig) {
      html += `<div class="sec">채용 (정원 ${g.staff.length}/${cap}명)</div><div class="hire-grid">`;
      for (const r of ROLE_ORDER) {
        const d = ROLES[r]; const n = g.staff.filter(s => s.role === r).length;
        html += `<button class="hire ${g.funds < d.hire ? 'poor' : ''}" data-act="hire" data-v="${r}"><span class="hn">${d.icon} ${d.name} <small>(${n}명)</small></span><small>채용 ${d.hire} · 월급 ${d.salary}</small><small>${d.desc}</small></button>`;
      }
      html += `</div><div class="sec">직원 목록</div>`;
      for (const s of g.staff) html += `<div class="srow ${view.selected?.kind === 'staff' && view.selected.id === s.id ? 'sel' : ''}" data-act="selstaff" data-v="${s.id}">${roleIcon(s.role)} <b>${esc(s.name)}</b> <small>${ROLES[s.role].name}</small>${s.post ? '📍' : ''}<span class="stat" data-live="st-${s.id}"></span></div>`;
      if (!g.staff.length) html += `<div class="hint">직원이 없어요. 위에서 채용하세요!</div>`;
      html += `<div class="hint">💡 <b>직원을 지도에서 직접 집어서(드래그)</b> 원하는 곳에 놓으면 반경 ${POST_R}칸이 그 직원의 담당 구역이 돼요. 민원 마커 위에 놓으면 그 민원을 바로 맡습니다. (롤러코스터 타이쿤처럼!)</div>`;
    }
  } else if (tab === 'events') {
    sig = `e|${g.events.map(e => e.id + ':' + e.worker + ':' + (g.funds >= EV[e.key].out ? 1 : 0) + (view.selected?.kind === 'event' && view.selected.id === e.id ? '*' : '')).join(',')}`;
    if (sig !== lastSig) {
      if (!g.events.length) html = `<div class="hint">현재 접수된 민원이 없어요. 평화로운 단지 🌿<br>계절과 시설 상태에 따라 돌발 민원이 발생합니다. 제한 시간 안에 처리하지 못하면 민원 게이지가 오릅니다.</div>`;
      for (const e of g.events) {
        const d = EV[e.key]; const b = g.bById(e.bid);
        const sel = view.selected?.kind === 'event' && view.selected.id === e.id;
        html += `<div class="ev ${sel ? 'sel' : ''}"><div class="evh"><span>${d.icon} ${d.title}${b?.type === 'apt' ? ` · ${b.num}동` : ''}</span><span data-live="el-${e.id}"></span></div><div class="bar"><i data-bar="eb-${e.id}"></i></div><div class="evd">${d.desc}</div><div class="evb"><span class="badge">담당 ${ROLES[e.role].icon}${ROLES[e.role].name}</span><span class="badge">처리비 ${d.cost}</span><span data-live="es-${e.id}"></span></div><div class="evb"><button data-act="evfocus" data-v="${e.id}">📍 위치</button><button class="${g.funds < d.out ? 'poor' : 'warn'}" data-act="evout" data-v="${e.id}">외주로 즉시 해결 (${d.out}만원)</button></div></div>`;
      }
    }
  } else if (tab === 'status') {
    const S = g.scores;
    const goal = g.rank < RANKS.length - 1 ? RANKS[g.rank + 1] : null;
    const next = g.tiers.find(t => t.star === Math.min(5, g.stars + 1));
    sig = `t|${g.stars}|${g.rank}|${next ? next.items.map(i => (i.ok ? 1 : 0)).join('') : ''}`;
    if (sig !== lastSig) {
      html += `<div class="sec">입주민 만족 요인</div>`;
      for (const [k, n] of [['clean', '🧹 청결'], ['facility', '🔧 시설'], ['park', '🅿️ 주차'], ['safety', '💂 치안'], ['amen', '🌳 조경·놀이'], ['service', '📋 서비스']] as [string, string][])
        html += `<div class="row"><span class="lb">${n}</span><div class="bar"><i data-bar="sc-${k}"></i></div><span class="v" data-live="sct-${k}"></span></div>`;
      html += `<div class="sec">직책 · 승진</div><div class="evd" data-live="rk"></div><div class="bar"><i data-bar="rkbar" style="background:var(--gold)"></i></div>`;
      html += `<div class="sec">단지 등급 ${'★'.repeat(g.stars)}${'☆'.repeat(5 - g.stars)}</div>`;
      if (next) {
        html += `<div class="evd">다음 등급(${next.star}성) 조건</div>`;
        for (const i of next.items) html += `<div class="chk ${i.ok ? 'ok' : 'no'}">${i.ok ? '✅' : '⬜'} ${esc(i.label)}</div>`;
      } else html += `<div class="chk ok">🏆 최고 등급(5성)입니다! 만족도를 유지하세요.</div>`;
      void S; void goal;
    }
  } else {
    sig = `r|${g.history.length}`;
    if (sig !== lastSig) {
      html += `<div class="sec">이번 달 예상</div><div class="evd">수입 <b class="grn" data-live="inc"></b> / 지출 <b class="red" data-live="exp"></b></div>`;
      html += `<div class="sec">월별 정산 (만원)</div><table><tr><th>월</th><th>수입</th><th>지출</th><th>순익</th><th>만족</th></tr>`;
      for (const h of g.history) html += `<tr><td>${h.label}</td><td>${fmt(h.income)}</td><td>${fmt(h.upkeep + h.salary)}</td><td class="${h.net >= 0 ? 'grn' : 'red'}">${h.net >= 0 ? '+' : ''}${fmt(h.net)}</td><td>${h.sat}%</td></tr>`;
      html += `</table>`;
      if (!g.history.length) html += `<div class="hint">아직 정산 내역이 없어요. 매월 말에 관리비 수입과 직원 급여·시설 유지비가 정산됩니다.</div>`;
      html += `<div class="sec">통계</div><div class="evd">해결한 민원 ${g.stats.resolved}건 · 외주 ${g.stats.outsourced}건 · 기한 초과 ${g.stats.failed}건</div>`;
    }
  }
  if (sig !== lastSig) { $('sidebody').innerHTML = html; lastSig = sig; }
  const evc = document.getElementById('evcount'); if (evc) evc.textContent = g.events.length ? ` (${g.events.length})` : '';
}

// ───────── 정보 패널 ─────────
let infoSig = '';
let fireArm = 0, fireArmT = 0;
function moodEmoji(v: number) { return v >= 80 ? '😄' : v >= 60 ? '🙂' : v >= 40 ? '😐' : v >= 20 ? '😠' : '🤬'; }
const KIND: Record<string, string> = { adult: '직장인', mom: '주부', kid: '어린이', elder: '어르신' };
function renderInfo() {
  const el = $('info'); const sel = view.selected;
  if (!sel) { el.classList.add('hidden'); infoSig = ''; return; }
  el.classList.remove('hidden');
  let sig = '', html = '';
  if (sel.kind === 'resident') {
    const r = g.residents.find(x => x.id === sel.id);
    if (!r) { view.selected = null; return; }
    const re = g.reasons(r);
    sig = `r${r.id}|${re.bad.join('/')}|${re.good.join('/')}`;
    if (sig !== infoSig) {
      html = `<div class="sec">${moodEmoji(r.sat)} ${esc(r.name)}</div><div class="evd">${KIND[r.kind]} · <span data-live="rd"></span></div>
        <div class="row"><span class="lb">만족도</span><div class="bar"><i data-bar="rsat"></i></div><span class="v" data-live="rsatt"></span></div>
        <div class="sec" style="color:#ff9b8c">불만 사항</div>${re.bad.length ? re.bad.map(b => `<div class="chk red">• ${esc(b)}</div>`).join('') : '<div class="chk ok">불만 없음 😊</div>'}
        ${re.good.length ? `<div class="sec" style="color:#8be3a2">만족 사항</div>${re.good.map(b => `<div class="chk ok">• ${esc(b)}</div>`).join('')}` : ''}`;
    }
  } else if (sel.kind === 'building') {
    const b = g.bById(sel.id);
    if (!b) { view.selected = null; return; }
    const d = BDEFS[b.type]; const upc = b.level < d.maxLevel ? d.up[b.level - 1] : 0;
    sig = `b${b.id}|${b.level}|${g.funds >= upc}`;
    if (sig !== infoSig) {
      html = `<div class="sec">${d.icon} ${b.type === 'apt' ? b.num + '동' : d.name} <small>Lv.${b.level}/${d.maxLevel}</small></div><div class="evd">${d.desc}</div>`;
      if (b.type !== 'garden' && b.type !== 'tree') html += `<div class="row"><span class="lb">정비도</span><div class="bar"><i data-bar="bhp"></i></div><span class="v" data-live="bhpt"></span></div>`;
      if (b.type === 'apt') html += `<div class="evd">입주 <b data-live="bocc"></b> / ${APT_HH[b.level]}세대</div>`;
      if (b.type === 'office') html += `<div class="evd">직원 정원 ${g.staffCap()}명</div>`;
      html += `<div class="evb">`;
      if (b.level < d.maxLevel) html += `<button class="${g.funds >= upc ? 'good' : 'poor'}" data-act="upgrade" data-v="${b.id}">⬆ 업그레이드 (${fmt(upc)}만원)</button>`;
      if (b.type !== 'office') html += `<button class="bad" data-act="demo" data-v="${b.id}">🔨 철거 (+${fmt(d.cost * 0.5)})</button>`;
      html += `</div>`;
    }
  } else if (sel.kind === 'staff') {
    const s = g.staff.find(x => x.id === sel.id);
    if (!s) { view.selected = null; return; }
    sig = `s${s.id}|${!!s.post}|${view.placeStaff === s}|${fireArm === s.id}`;
    if (sig !== infoSig) {
      html = `<div class="sec">${roleIcon(s.role)} ${esc(s.name)} <small>${ROLES[s.role].name}</small></div><div class="evd">월급 ${ROLES[s.role].salary}만원 · <span data-live="st-${s.id}"></span></div>
        <div class="evd">${s.post ? '📍 담당 구역이 지정되어 있어요 (노란 점선 반경 ' + POST_R + '칸)' : '자유 근무 중 (자동으로 일감을 찾아요)'}</div>
        <div class="evb"><button class="${view.placeStaff === s ? 'on' : ''}" data-act="placestaff" data-v="${s.id}">📍 지도에서 위치 지정</button>${s.post ? `<button data-act="clearpost" data-v="${s.id}">구역 해제</button>` : ''}<button class="bad" data-act="fire" data-v="${s.id}">${fireArm === s.id ? '⚠ 정말 해고? 한 번 더 클릭' : '해고'}</button></div>
        <div class="hint">지도에서 직원을 직접 끌어다(드래그) 놓아도 돼요.</div>`;
    }
  } else if (sel.kind === 'event') {
    const e = g.events.find(x => x.id === sel.id);
    if (!e) { view.selected = null; return; }
    const d = EV[e.key];
    sig = `e${e.id}`;
    if (sig !== infoSig) html = `<div class="sec">${d.icon} ${d.title}</div><div class="evd">${d.desc}</div><div class="evb"><span class="badge">담당 ${ROLES[e.role].name}</span><span class="badge">처리비 ${d.cost}</span></div><div class="hint">오른쪽 '📢 민원' 탭에서 외주로 즉시 해결할 수도 있어요.</div>`;
  }
  if (sig !== infoSig) { el.innerHTML = html; infoSig = sig; }
}

// ───────── 실시간 값 갱신 ─────────
function live() {
  const set = (k: string, v: string) => document.querySelectorAll<HTMLElement>(`[data-live="${k}"]`).forEach(e => { if (e.textContent !== v) e.textContent = v; });
  const bar = (k: string, pct: number, color?: string) => document.querySelectorAll<HTMLElement>(`[data-bar="${k}"]`).forEach(e => { e.style.width = clamp(pct, 0, 100) + '%'; if (color) e.style.background = color; });
  const col = (p: number) => (p > 66 ? '#5fd47e' : p > 36 ? '#ffb23f' : '#ff6a5a');
  for (const s of g.staff) set(`st-${s.id}`, s.status);
  for (const e of g.events) {
    const d = EV[e.key]; const left = e.deadlineT - g.t; const frac = left / d.days * 100;
    set(`el-${e.id}`, `${Math.max(0, left).toFixed(1)}일 남음`);
    bar(`eb-${e.id}`, frac, frac < 35 ? '#ff6a5a' : '#e8a020');
    const w = g.staff.find(s => s.id === e.worker);
    set(`es-${e.id}`, w ? `🛠 ${w.name} 처리 중` : '⏳ 담당자 대기');
  }
  const S = g.scores;
  for (const k of ['clean', 'facility', 'park', 'safety', 'amen', 'service'] as const) { const p = Math.round(S[k] * 100); bar(`sc-${k}`, p, col(p)); set(`sct-${k}`, p + '%'); }
  const goal = g.rank < RANKS.length - 1 ? RANKS[g.rank + 1] : null;
  if (goal) { set('rk', `현재 ${RANKS[g.rank].title} → 다음 ${goal.title}: ${goal.need}성 이상 & 만족도 ${goal.minSat}%↑ 상태를 ${goal.days}일 유지 (${g.hold}/${goal.days}일)`); bar('rkbar', g.hold / goal.days * 100); }
  set('inc', '+' + fmt(g.income)); set('exp', '-' + fmt(g.expense));
  const sel = view.selected;
  if (sel?.kind === 'resident') { const r = g.residents.find(x => x.id === sel.id); if (r) { const p = Math.round(r.sat); bar('rsat', p, col(p)); set('rsatt', p + '%'); set('rd', `${moodEmoji(r.sat)} ${r.dest}`); } }
  if (sel?.kind === 'building') { const b = g.bById(sel.id); if (b) { const p = Math.round(b.hp); bar('bhp', p, col(p)); set('bhpt', p + '%'); set('bocc', String(b.occ)); } }
}

// ───────── HUD ─────────
function hud() {
  const set = (id: string, v: string) => { const e = $(id); if (e.textContent !== v) e.textContent = v; };
  set('h-funds', fmt(g.funds));
  const fe = $('h-funds'); fe.style.color = g.funds < 0 ? '#ff6a5a' : '';
  set('h-inc', '+' + fmt(g.income)); set('h-exp', '-' + fmt(g.expense));
  const sat = Math.round(g.sat); set('h-sat', sat + '%');
  const sb = $('h-satbar'); sb.style.width = sat + '%'; sb.style.background = sat > 66 ? '#5fd47e' : sat > 40 ? '#ffb23f' : '#ff6a5a';
  const cp = Math.round(g.complaints); set('h-cmp', cp + '%');
  const cb = $('h-cmpbar'); cb.style.width = cp + '%'; cb.style.background = cp > 70 ? '#ff4a3a' : cp > 40 ? '#ffb23f' : '#5aa8ff';
  $('h-cmp').style.color = cp > 70 && Math.floor(performance.now() / 350) % 2 ? '#ff4a3a' : '';
  set('h-date', `${g.year}년 ${g.month}월 ${g.dayOfMonth}일`);
  set('h-season', `${SEASON_ICON[g.season]}${SEASON_NAMES[g.season]}`);
  set('h-hour', `${g.hour}시`);
  set('stars', '★'.repeat(g.stars) + '☆'.repeat(5 - g.stars));
  set('h-rank', RANKS[g.rank].title);
  for (const b of Array.from(document.querySelectorAll<HTMLElement>('#speed button'))) b.classList.toggle('on', Number(b.dataset.v) === g.speed);
}

// ───────── 클릭 위임 ─────────
document.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tool]');
  if (!t) return;
  if (t.dataset.tool !== undefined) { const v = t.dataset.tool; setTool(v === '' ? null : (v as BType | 'demolish')); return; }
  const act = t.dataset.act!, v = t.dataset.v ?? '';
  switch (act) {
    case 'speed': setSpeed(Number(v)); break;
    case 'zoom': setZoom(view.S + Number(v)); break;
    case 'help': showHelp(); break;
    case 'rot': view.rot = !view.rot; updateGhost(); break;
    case 'tab': if (tab === v && !sideCollapsed) { sideCollapsed = true; } else { tab = v as Tab; sideCollapsed = false; } buildTabs(); lastSig = ''; renderSide(); break;
    case 'hire': g.hire(v as Role); lastSig = ''; break;
    case 'selstaff': { const s = g.staff.find(x => x.id === Number(v)); if (s) { view.selected = { kind: 'staff', id: s.id }; focusTile(s.x, s.y); } lastSig = ''; break; }
    case 'evfocus': { const ev = g.events.find(x => x.id === Number(v)); if (ev) { focusTile(ev.x + 0.5, ev.y + 0.5); view.selected = { kind: 'event', id: ev.id }; lastSig = ''; } break; }
    case 'evout': { const ev = g.events.find(x => x.id === Number(v)); if (ev) g.outsource(ev); lastSig = ''; break; }
    case 'upgrade': { const b = g.bById(Number(v)); if (b) g.upgrade(b); infoSig = ''; break; }
    case 'demo': { const b = g.bById(Number(v)); if (b) { g.demolish(b); view.selected = null; } break; }
    case 'fire': { const s = g.staff.find(x => x.id === Number(v)); if (!s) break; if (fireArm === s.id) { fireArm = 0; g.fire(s); view.selected = null; lastSig = ''; } else { fireArm = s.id; fireArmT = performance.now(); } infoSig = ''; break; }
    case 'save': saveGame(true); break;
    case 'load': loadGame(); break;
    case 'continue': loadGame(); break;
    case 'clearpost': { const s = g.staff.find(x => x.id === Number(v)); if (s) { g.clearPost(s); infoSig = ''; lastSig = ''; } break; }
    case 'placestaff': { const s = g.staff.find(x => x.id === Number(v)); if (s) { view.placeStaff = view.placeStaff === s ? null : s; view.tool = null; refreshToolbar(); infoSig = ''; if (view.placeStaff) toast('지도에서 배치할 위치를 클릭하세요', 'info'); } break; }
    case 'start': startGame(); break;
    case 'restart': restart(); break;
    case 'close': $('modal').innerHTML = ''; if (started && g.state === 'play' && g.speed === 0 && wasSpeed) g.speed = wasSpeed; break;
  }
});

// ───────── 모달 ─────────
let wasSpeed = 1;
const HELP = `
<h2>🎮 조작법</h2>
<ul>
<li><b>화면 이동</b>: 빈 곳 드래그 / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>·방향키 &nbsp; <b>확대/축소</b>: 휠, <kbd>+</kbd><kbd>-</kbd>, 두 손가락 핀치</li>
<li><b>건설</b>: 아래 건설 메뉴 선택 → 지도 클릭. <kbd>R</kbd> 회전, 우클릭/<kbd>Esc</kbd> 취소. 건물을 클릭하면 업그레이드/철거</li>
<li><b>입주민 클릭</b>: 만족도와 불만 이유 확인</li>
<li><b>직원 배치</b>: 직원을 <b>드래그해서 집어 올려</b> 원하는 곳에 놓기 → 그 주변 반경 ${POST_R}칸이 담당 구역. 민원 마커 위에 놓으면 즉시 투입!</li>
<li><b>시간</b>: <kbd>Space</kbd> 일시정지, <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 배속</li>
</ul>
<h2>🎯 목표</h2>
<ul>
<li>만족도를 높이고 단지 등급(★)을 올려 <b>관리주임 → 관리과장 → 관리소장 → 총괄소장 → 명품 5성 단지</b>로 승진하세요.</li>
<li><b>민원 게이지가 100%</b>가 되거나 만족도 20% 미만이 15일간 계속되면 <b>해임</b>, 재정이 크게 적자가 나도 해임입니다.</li>
<li>민원(📢)은 제한 시간 안에 알맞은 직원이 처리해야 해요. 직원이 없거나 급하면 <b>외주</b>로 해결(비용 ↑).</li>
</ul>`;
function showHelp() {
  wasSpeed = g.speed || 1; if (g.state === 'play') g.speed = 0;
  $('modal').innerHTML = `<div class="box panel"><h1>🏢 단지 타이쿤 도움말</h1>${HELP}<button class="big good" data-act="close">닫기</button></div>`;
}
function showTitle() {
  $('modal').innerHTML = `<div class="box panel"><h1>🏢 단지 타이쿤</h1><p>신축·노후 아파트 단지의 <b>관리소장</b>이 되어 시설을 가꾸고, 직원을 고용하고, 민원을 해결해 <b>'명품 5성급 아파트'</b>를 만들어 보세요.</p>${HELP}<button class="big good" data-act="start">▶ 새 게임 시작</button> ${hasSave() ? '<button class="big warn" data-act="continue">📂 이어하기</button>' : ''}</div>`;
}
function endModal() {
  const won = g.state === 'won';
  $('modal').innerHTML = `<div class="box panel"><h1>${won ? '🏆 명품 5성 단지 달성!' : '📄 해임 통보'}</h1><p>${esc(g.endReason)}</p>
  <h2>📊 근무 기록</h2><ul><li>근속 ${g.day}일 (${g.year}년 ${g.month}월)</li><li>직책: ${RANKS[g.rank].title} · 등급 ${'★'.repeat(g.stars)}</li><li>입주 ${g.households()}세대 · 만족도 ${Math.round(g.sat)}%</li><li>해결한 민원 ${g.stats.resolved}건 (외주 ${g.stats.outsourced}) · 기한 초과 ${g.stats.failed}건</li><li>최종 자금 ${fmt(g.funds)}만원</li></ul>
  <button class="big good" data-act="restart">🔄 다시 시작</button></div>`;
}
const SAVE_KEY = 'apt-tycoon-save-v1';
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
function saveGame(manual: boolean) {
  if (g.state !== 'play') return;
  try { localStorage.setItem(SAVE_KEY, g.serialize()); if (manual) toast('💾 저장했어요', 'good'); }
  catch { if (manual) toast('이 환경에서는 저장할 수 없어요', 'bad'); }
}
function loadGame() {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { /* ignore */ }
  if (!raw) { toast('저장된 게임이 없어요', 'warn'); return; }
  const ng = new Game();
  if (!ng.loadSave(raw)) { toast('저장 데이터를 불러오지 못했어요', 'bad'); return; }
  g = ng; bindGame(); view.selected = null; view.tool = null; view.carrying = null; view.placeStaff = null;
  lastSig = ''; infoSig = ''; endShown = false; refreshToolbar();
  if (!started) startGame(); else { $('modal').innerHTML = ''; g.speed = 1; }
  g.speed = 1; toast('📂 저장한 게임을 불러왔어요', 'good');
}
function startGame() { started = true; $('modal').innerHTML = ''; g.speed = 1; buildTabs(); renderSide(); }
function restart() {
  g = new Game(); bindGame(); view.selected = null; view.tool = null; view.carrying = null; view.placeStaff = null;
  view.camX = 16; view.camY = 150; lastSig = ''; infoSig = ''; $('toasts').innerHTML = '';
  refreshToolbar(); startGame();
}

// ───────── 메인 루프 ─────────
let last = performance.now(), uiT = 0, endShown = false;
let errShown = 0, lastSave = performance.now();
function fail(where: string, e: unknown) {
  console.error(where, e);
  if (errShown++ < 3) toast(`⚠️ 오류(${where}): ${(e as Error)?.message ?? e}`, 'bad');
}
function frame(now: number) {
  requestAnimationFrame(frame); // 예외가 나도 루프가 죽지 않도록 가장 먼저 예약
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (started) {
    try {
      const sp = 260 / view.S * dt * 2;
      if (keys.has('w') || keys.has('arrowup')) view.camY -= sp;
      if (keys.has('s') || keys.has('arrowdown')) view.camY += sp;
      if (keys.has('a') || keys.has('arrowleft')) view.camX -= sp;
      if (keys.has('d') || keys.has('arrowright')) view.camX += sp;
      clampCam();
      g.update(dt);
      if (g.state !== 'play' && !endShown) { endShown = true; endModal(); }
      if (g.state === 'play') endShown = false;
    } catch (e) { fail('시뮬레이션', e); }
  }
  try { renderer.draw(g, view, dt); } catch (e) { fail('그리기', e); }
  uiT -= dt;
  if (uiT <= 0) {
    uiT = 0.12;
    if (fireArm && performance.now() - fireArmT > 3500) { fireArm = 0; infoSig = ''; }
    if (started && performance.now() - lastSave > 20000) { lastSave = performance.now(); saveGame(false); }
    try { hud(); refreshToolbar(); renderSide(); renderInfo(); live(); } catch (e) { fail('화면', e); lastSig = ''; infoSig = ''; }
  }
}
buildTabs(); renderSide(); refreshToolbar(); hud();
showTitle();
requestAnimationFrame(frame);
// 디버그/테스트용
(window as unknown as { __g: () => Game; __v: View; __r: Renderer }).__g = () => g;
(window as unknown as { __v: View }).__v = view;
(window as unknown as { __r: Renderer }).__r = renderer;
void (null as unknown as Resident);
