// 나만의 AI 사무실 - 프론트엔드 (픽셀 렌더링 + UI)
const S = 3, W = 400, H = 240; // 논리 해상도 400x240, 화면은 3배
const cv = document.getElementById('c');
const g = cv.getContext('2d');
g.imageSmoothingEnabled = false;
const $ = (id) => document.getElementById(id);

let state = { employees: [], tasks: [], mode: 'demo' };
let selected = null;
const rt = {}; // 직원별 런타임(위치/상태)

const deskPos = (slot) => ({ x: 12 + (slot % 4) * 72, y: 76 + Math.floor(slot / 4) * 76 });
const seat = (slot) => { const d = deskPos(slot); return { x: d.x + 22, y: d.y + 12 }; };
const LOUNGE = { x0: 308, x1: 384, y0: 104, y1: 212 };
const rnd = (a, b) => a + Math.random() * (b - a);

function empStatus(e) {
  const mine = state.tasks.filter((t) => t.employeeId === e.id);
  if (mine.some((t) => t.status === 'working' || t.status === 'queued')) return 'working';
  const lastDone = mine.filter((t) => t.status === 'done' || t.status === 'failed').sort((a, b) => b.finishedAt - a.finishedAt)[0];
  if (lastDone && Date.now() - lastDone.finishedAt < 8000) return lastDone.status;
  return 'idle';
}

// ---------- 그리기 도구 ----------
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
function text(str, x, y, color = '#fff', size = 5, align = 'center') {
  g.font = `bold ${size}px "Malgun Gothic","Apple SD Gothic Neo",sans-serif`;
  g.textAlign = align; g.fillStyle = color; g.fillText(str, Math.round(x), Math.round(y));
}

function drawRoom(t) {
  // 바닥
  for (let y = 44; y < H; y += 16) for (let x = 0; x < W; x += 16)
    R(x, y, 16, 16, ((x + y) / 16) % 2 ? '#c9b48f' : '#d6c29d');
  // 벽
  R(0, 0, W, 44, '#6f7bb8'); R(0, 40, W, 4, '#4a5488'); R(0, 36, W, 4, '#8791cc');
  for (let i = 0; i < 4; i++) { // 창문
    const x = 20 + i * 76; R(x, 6, 40, 26, '#2f365f'); R(x + 2, 8, 36, 22, '#8fd3ff'); R(x + 2, 8, 36, 8, '#b7e6ff'); R(x + 19, 8, 2, 22, '#2f365f');
  }
  // 시계
  R(336, 8, 18, 18, '#2f365f'); R(338, 10, 14, 14, '#fff');
  const a = t * 0.2, bx = 345, by = 17;
  g.strokeStyle = '#222'; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * 5, by + Math.sin(a) * 5); g.stroke();
  g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a / 12) * 3, by + Math.sin(a / 12) * 3); g.stroke();
  // 간판
  R(150, 2, 100, 0, '#000');
  text('AI OFFICE', 200, 38, '#ffe28a', 6);
  // 라운지: 러그, 소파, 화분, 커피머신
  R(LOUNGE.x0 - 8, LOUNGE.y0 - 8, 92, 118, '#b5546b'); R(LOUNGE.x0 - 6, LOUNGE.y0 - 6, 88, 114, '#c96a82');
  R(316, 54, 22, 20, '#444'); R(318, 56, 18, 8, '#222'); R(322, 66, 10, 6, '#9fd'); R(326, 60, 2, 2, '#f55');
  text('☕', 327, 52, '#fff', 6);
  R(366, 58, 8, 14, '#6a4a2a'); R(362, 44, 16, 16, '#3fa65a'); R(366, 40, 8, 10, '#56c775');
  R(312, 214, 56, 14, '#47507d'); R(312, 210, 56, 6, '#5d68a0'); R(308, 210, 6, 18, '#3a4268'); R(366, 210, 6, 18, '#3a4268');
  // 문
  R(386, 196, 14, 36, '#7a4e2b'); R(388, 198, 10, 32, '#9a6a3b'); R(394, 214, 2, 2, '#ffd34d');
}

function drawDesk(slot, e, status, t) {
  const d = deskPos(slot);
  R(d.x + 16, d.y + 8, 12, 10, '#3a3f66'); // 의자 등받이
  return d;
}
function drawDeskFront(slot, e, status, t) {
  const d = deskPos(slot);
  R(d.x, d.y + 6, 56, 4, '#e0b57a'); R(d.x, d.y + 10, 56, 12, '#b9854f'); R(d.x + 2, d.y + 22, 4, 4, '#7d5630'); R(d.x + 50, d.y + 22, 4, 4, '#7d5630');
  // 모니터
  R(d.x + 36, d.y - 2, 16, 12, '#222'); R(d.x + 37, d.y - 1, 14, 9, status === 'working' ? (Math.floor(t * 6) % 2 ? '#7ae0ff' : '#5cc3ee') : '#1f2a3a');
  if (status === 'working') for (let i = 0; i < 3; i++) R(d.x + 39, d.y + i * 3, 4 + ((Math.floor(t * 4) + i * 2) % 6), 1, '#fff');
  R(d.x + 42, d.y + 10, 4, 2, '#222');
  R(d.x + 12, d.y + 11, 18, 3, '#f1f1f1'); // 키보드
  if (e) { // 명패
    R(d.x + 2, d.y + 12, 8, 6, e.color);
  }
}

function drawPerson(x, y, e, r, t, status) {
  x = Math.round(x); y = Math.round(y);
  const walking = r.walking, sit = r.sitting;
  const bob = walking ? (Math.floor(t * 8) % 2) : 0;
  if (!sit) R(x - 5, y - 1, 10, 2, 'rgba(0,0,0,.25)');
  if (!sit) {
    const st = Math.floor(t * 6) % 2;
    R(x - 3, y - 4 - (walking && st ? 1 : 0), 2, 4, '#2b2f4a'); R(x + 1, y - 4 - (walking && !st ? 1 : 0), 2, 4, '#2b2f4a');
  }
  const yy = y - bob;
  R(x - 4, yy - 10, 8, 7, e.color); R(x - 4, yy - 10, 8, 2, 'rgba(255,255,255,.25)');
  let ah = 0; if (sit && status === 'working') ah = Math.floor(t * 10) % 2;
  R(x - 5, yy - 9 + ah, 1, 5, e.color); R(x + 4, yy - 9 + (1 - ah) * (sit ? 1 : 0), 1, 5, e.color);
  R(x - 5, yy - 5 + ah, 1, 1, '#f5cfa0'); R(x + 4, yy - 5, 1, 1, '#f5cfa0');
  R(x - 3, yy - 16, 6, 6, '#f5cfa0');
  R(x - 4, yy - 18, 8, 3, e.hair); R(x - 4, yy - 16, 1, 3, e.hair); R(x + 3, yy - 16, 1, 3, e.hair);
  const blink = (Math.floor(t * 2 + e.slot * 3) % 9) === 0;
  if (!blink) { R(x - 2, yy - 13, 1, 1, '#222'); R(x + 1, yy - 13, 1, 1, '#222'); } else { R(x - 2, yy - 13, 2, 1, '#8a6a4a'); R(x, yy - 13, 2, 1, '#8a6a4a'); }
  if (status === 'done') R(x - 1, yy - 11, 2, 1, '#c0605a'); // 웃음
}

function bubble(x, y, str, bg = '#fff', fg = '#222') {
  g.font = 'bold 5px "Malgun Gothic",sans-serif';
  const w = Math.ceil(g.measureText(str).width) + 6;
  const bx = Math.round(x - w / 2), by = Math.round(y - 12);
  R(bx, by, w, 10, bg); R(bx + 2, by - 1, w - 4, 1, bg); R(bx + 2, by + 10, w - 4, 1, bg);
  R(Math.round(x) - 1, by + 11, 3, 2, bg);
  text(str, x, by + 7, fg, 5);
}

// ---------- 시뮬레이션 ----------
function syncRuntime() {
  const ids = new Set(state.employees.map((e) => e.id));
  for (const id of Object.keys(rt)) if (!ids.has(id)) delete rt[id];
  for (const e of state.employees) if (!rt[e.id]) rt[e.id] = { x: 392, y: 226, tx: 350, ty: 190, wait: 0, walking: true, sitting: false };
}
function step(dt) {
  for (const e of state.employees) {
    const r = rt[e.id]; if (!r) continue;
    const status = empStatus(e);
    let target;
    if (status === 'working') target = seat(e.slot);
    else {
      if (r.sitting) { r.sitting = false; r.tx = rnd(LOUNGE.x0, LOUNGE.x1); r.ty = rnd(LOUNGE.y0 + 10, LOUNGE.y1); }
      if (status === 'done' || status === 'failed') target = seat(e.slot); // 끝난 직후엔 자리에서 뿌듯
      else target = null;
    }
    if (target) { r.tx = target.x; r.ty = target.y; }
    const dx = r.tx - r.x, dy = r.ty - r.y, dist = Math.hypot(dx, dy);
    if (dist > 1.5) {
      const sp = 46 * dt; r.x += (dx / dist) * Math.min(sp, dist); r.y += (dy / dist) * Math.min(sp, dist); r.walking = true; r.sitting = false;
    } else {
      r.walking = false;
      const atSeat = target && Math.hypot(r.x - seat(e.slot).x, r.y - seat(e.slot).y) < 2;
      r.sitting = !!atSeat;
      if (!target) { r.wait -= dt; if (r.wait <= 0) { r.wait = rnd(2, 6); r.tx = rnd(LOUNGE.x0, LOUNGE.x1); r.ty = rnd(LOUNGE.y0 + 10, LOUNGE.y1); } }
    }
  }
}

function render(t) {
  g.setTransform(S, 0, 0, S, 0, 0);
  g.imageSmoothingEnabled = false;
  drawRoom(t);
  const emps = state.employees;
  // 빈 자리도 책상은 보이게
  for (let s = 0; s < 8; s++) { const e = emps.find((x) => x.slot === s); drawDesk(s, e, e ? empStatus(e) : 'idle', t); }
  // 앉은 직원 → 책상 앞면 → 서 있는 직원
  const sorted = [...emps].sort((a, b) => rt[a.id].y - rt[b.id].y);
  for (const e of sorted) if (rt[e.id].sitting) drawPerson(rt[e.id].x, rt[e.id].y, e, rt[e.id], t, empStatus(e));
  for (let s = 0; s < 8; s++) { const e = emps.find((x) => x.slot === s); drawDeskFront(s, e, e ? empStatus(e) : 'idle', t); }
  for (const e of sorted) if (!rt[e.id].sitting) drawPerson(rt[e.id].x, rt[e.id].y, e, rt[e.id], t, empStatus(e));
  // 이름표/말풍선
  for (const e of emps) {
    const r = rt[e.id], st = empStatus(e), d = deskPos(e.slot);
    text(e.name, d.x + 28, d.y + 36, e.id === selected ? '#ffe28a' : '#3a2a1a', 5);
    text(e.title, d.x + 28, d.y + 42, '#6a5a44', 4);
    const top = r.y - 22;
    if (st === 'working') bubble(r.x, top, '💻 ' + '.'.repeat(1 + (Math.floor(t * 2) % 3)));
    else if (st === 'done') bubble(r.x, top, '✅ 완료!', '#d6ffe5', '#06501f');
    else if (st === 'failed') bubble(r.x, top, '⚠️ 실패', '#ffd6d6', '#600');
    else if (r.walking === false && !r.sitting && Math.floor(t / 4 + e.slot) % 3 === 0) bubble(r.x, top, '☕ 휴식', '#fff6d6', '#5a4200');
    if (e.id === selected) { R(r.x - 2, top - 8, 5, 1, '#ffd34d'); R(r.x - 1, top - 7, 3, 1, '#ffd34d'); R(r.x, top - 6, 1, 1, '#ffd34d'); }
  }
  if (!emps.length) { bubble(200, 120, '오른쪽에서 직원을 채용해보세요!'); }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  syncRuntime(); step(dt); render(now / 1000);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

cv.addEventListener('click', (ev) => {
  const b = cv.getBoundingClientRect();
  const lx = ((ev.clientX - b.left) / b.width) * W, ly = ((ev.clientY - b.top) / b.height) * H;
  let hit = null;
  for (const e of state.employees) { const r = rt[e.id]; if (r && Math.abs(lx - r.x) < 9 && ly > r.y - 22 && ly < r.y + 2) hit = e; }
  if (hit) { selected = hit.id; $('who').value = hit.id; $('text').focus(); }
});

// ---------- UI ----------
async function api(method, url, data) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || '오류'); return j;
}
let lastSig = '';
const openIds = new Set();
async function refresh() {
  try { state = await api('GET', '/api/state'); } catch { $('mode').textContent = '서버 연결 끊김'; return; }
  $('mode').textContent = state.mode === 'live' ? `🟢 실제 업무 모드 · ${state.model}` : '🧪 데모 모드 (API 키 없음 – 가짜 결과)';
  const sig = JSON.stringify([state.employees, state.tasks]);
  if (sig === lastSig) return; lastSig = sig;

  const sel = $('who'), cur = sel.value || selected;
  sel.innerHTML = '';
  for (const e of state.employees) sel.add(new Option(`${e.name} (${e.title})`, e.id));
  if (state.employees.some((e) => e.id === cur)) sel.value = cur;
  if (!selected && state.employees[0]) selected = state.employees[0].id;

  const list = $('list'); list.innerHTML = '';
  const tasks = [...state.tasks].sort((a, b) => b.createdAt - a.createdAt);
  if (!tasks.length) list.innerHTML = '<span class="hint">아직 업무가 없어요.</span>';
  const label = { queued: '대기', working: '작업중', done: '완료', failed: '실패' };
  for (const t of tasks) {
    const emp = state.employees.find((e) => e.id === t.employeeId);
    const div = document.createElement('div'); div.className = 'task';
    const b = document.createElement('span'); b.className = 'badge ' + t.status; b.textContent = label[t.status];
    div.append(b, document.createTextNode(`${emp ? emp.name : '(퇴사)'}: ${t.text.slice(0, 60)}${t.text.length > 60 ? '…' : ''}`));
    if (t.status === 'done') {
      const d = document.createElement('details'); d.open = openIds.has(t.id);
      d.addEventListener('toggle', () => (d.open ? openIds.add(t.id) : openIds.delete(t.id)));
      const s = document.createElement('summary'); s.textContent = '결과 보기'; s.style.cursor = 'pointer';
      const pre = document.createElement('pre'); pre.textContent = t.result;
      const small = document.createElement('small'); small.textContent = '저장 위치: ai-office/' + t.file;
      d.append(s, pre, small); div.append(d);
    } else if (t.status === 'failed') {
      const s = document.createElement('small'); s.style.color = 'var(--bad)'; s.textContent = t.error; div.append(s);
    }
    list.append(div);
  }
}
setInterval(refresh, 1500); refresh();

$('assign').onclick = async () => {
  $('err').textContent = '';
  try { await api('POST', '/api/tasks', { employeeId: $('who').value, text: $('text').value }); $('text').value = ''; lastSig = ''; refresh(); }
  catch (e) { $('err').textContent = e.message; }
};
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('assign').click(); });
$('hire').onclick = async () => {
  $('err').textContent = '';
  const roleSel = $('role'), title = roleSel.options[roleSel.selectedIndex].text.replace(/^\S+\s/, '');
  try {
    const e = await api('POST', '/api/employees', { name: $('name').value, role: roleSel.value, title, color: $('color').value, hair: $('hair').value, prompt: $('prompt').value });
    $('name').value = ''; $('prompt').value = ''; selected = e.id; lastSig = ''; await refresh(); $('who').value = e.id;
  } catch (e) { $('err').textContent = e.message; }
};
// 퇴사 버튼
const fire = document.createElement('button'); fire.className = 'ghost'; fire.textContent = '선택한 직원 퇴사'; fire.style.marginTop = '6px';
fire.onclick = async () => {
  const id = $('who').value; const e = state.employees.find((x) => x.id === id); if (!e) return;
  if (!confirm(`${e.name} 직원을 퇴사시킬까요? (작업 결과 파일은 workspace 폴더에 남습니다)`)) return;
  await api('DELETE', '/api/employees/' + id); selected = null; lastSig = ''; refresh();
};
$('who').after(fire);
