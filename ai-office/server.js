// 나만의 AI 사무실 - 서버 (외부 의존성 없음, Node 18+)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- .env 로드 ----
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2];
  }
} catch {}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const DATA_DIR = path.join(__dirname, 'data');
const WS_DIR = path.join(__dirname, 'workspace');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(WS_DIR, { recursive: true });

let state = { employees: [], tasks: [] };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
// 재시작 시 중단된 작업은 실패 처리
for (const t of state.tasks) if (t.status === 'working' || t.status === 'queued') { t.status = 'failed'; t.error = '서버가 재시작되어 중단됨'; }
const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const ROLES = {
  researcher: '너는 꼼꼼한 리서처다. 주어진 주제를 조사·정리해 핵심 요약, 근거, 불확실한 점을 구분해 보고한다. 모르는 것은 모른다고 말하고 지어내지 않는다.',
  writer: '너는 센스 있는 카피라이터/작가다. 요청한 글을 목적과 독자에 맞게 바로 쓸 수 있는 완성본으로 작성한다.',
  developer: '너는 실력 있는 개발자다. 요청을 코드와 짧은 설명으로 해결한다. 코드는 바로 실행 가능하게 쓰고 가정은 명시한다.',
  planner: '너는 실무형 기획자다. 요청을 목표, 할 일 목록, 우선순위, 일정으로 구조화해 실행 가능한 계획으로 만든다.',
  translator: '너는 전문 번역가다. 원문의 뉘앙스를 살려 자연스럽게 번역하고, 필요하면 번역 노트를 덧붙인다.',
  secretary: '너는 유능한 비서다. 일정 정리, 메일/메시지 초안, 체크리스트 등 대표를 대신해 처리할 일을 간결하고 정확하게 처리한다.',
};

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((ok, no) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } });
  });
}
const clip = (s, n) => String(s || '').trim().slice(0, n);
const slug = (s) => clip(s, 30).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'task';

async function callClaude(emp, task) {
  const past = state.tasks
    .filter((t) => t.employeeId === emp.id && t.status === 'done' && t.id !== task.id)
    .slice(-3)
    .map((t) => `- 요청: ${t.text}\n  결과 요약: ${clip(t.result, 300)}`)
    .join('\n');
  const system = [
    `너의 이름은 ${emp.name}, 직책은 ${emp.title}. 사용자(대표)를 대신해 일하는 AI 직원이다.`,
    emp.prompt,
    '결과는 마크다운으로 바로 전달 가능한 완성본으로 작성한다. 군더더기 인사말은 생략한다. 한국어로 답한다(요청이 다른 언어를 지정하면 따른다).',
    past ? `참고: 최근에 네가 처리한 일\n${past}` : '',
  ].filter(Boolean).join('\n\n');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system, messages: [{ role: 'user', content: task.text }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `API 오류 ${r.status}`);
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

async function demoWork(emp, task) {
  await new Promise((r) => setTimeout(r, 4000 + Math.random() * 3000));
  return `> 🧪 **데모 모드 결과입니다.** 실제 업무를 하려면 \`.env\`에 ANTHROPIC_API_KEY를 넣고 서버를 다시 시작하세요.\n\n**${emp.name}(${emp.title})** 이(가) 받은 업무:\n\n"${task.text}"\n\n(키가 연결되면 여기에 실제 결과가 들어옵니다.)`;
}

const running = new Set(); // 직원별 동시 작업 1개
async function pump(empId) {
  if (running.has(empId)) return;
  const emp = state.employees.find((e) => e.id === empId);
  const task = state.tasks.find((t) => t.employeeId === empId && t.status === 'queued');
  if (!emp || !task) return;
  running.add(empId);
  task.status = 'working'; task.startedAt = Date.now(); save();
  try {
    task.result = API_KEY ? await callClaude(emp, task) : await demoWork(emp, task);
    const dir = path.join(WS_DIR, emp.id);
    fs.mkdirSync(dir, { recursive: true });
    const file = `${new Date().toISOString().slice(0, 10)}-${slug(task.text)}-${task.id.slice(0, 4)}.md`;
    fs.writeFileSync(path.join(dir, file), `# ${task.text}\n\n${task.result}\n`);
    task.file = `workspace/${emp.id}/${file}`;
    task.status = 'done';
  } catch (e) {
    task.status = 'failed'; task.error = String(e.message || e);
  }
  task.finishedAt = Date.now(); save();
  running.delete(empId);
  pump(empId);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/markdown; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/api/state')
      return send(res, 200, { ...state, mode: API_KEY ? 'live' : 'demo', model: MODEL, roles: Object.keys(ROLES) });

    if (req.method === 'POST' && url.pathname === '/api/employees') {
      if (state.employees.length >= 8) return send(res, 400, { error: '자리가 가득 찼어요 (최대 8명)' });
      const b = await body(req);
      const name = clip(b.name, 12);
      if (!name) return send(res, 400, { error: '이름을 입력하세요' });
      const emp = {
        id: crypto.randomBytes(4).toString('hex'),
        name, title: clip(b.title, 20) || '직원',
        role: ROLES[b.role] ? b.role : 'secretary',
        prompt: clip(b.prompt, 1500) || ROLES[b.role] || ROLES.secretary,
        color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#5b8def',
        hair: /^#[0-9a-f]{6}$/i.test(b.hair) ? b.hair : '#3a2a1a',
        slot: [0, 1, 2, 3, 4, 5, 6, 7].find((s) => !state.employees.some((e) => e.slot === s)),
      };
      state.employees.push(emp); save();
      return send(res, 200, emp);
    }

    let m;
    if (req.method === 'DELETE' && (m = url.pathname.match(/^\/api\/employees\/(\w+)$/))) {
      state.employees = state.employees.filter((e) => e.id !== m[1]);
      state.tasks = state.tasks.filter((t) => t.employeeId !== m[1] || t.status === 'working');
      save(); return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      const b = await body(req);
      const text = clip(b.text, 4000);
      if (!text) return send(res, 400, { error: '업무 내용을 입력하세요' });
      if (!state.employees.some((e) => e.id === b.employeeId)) return send(res, 400, { error: '직원을 선택하세요' });
      const t = { id: crypto.randomBytes(8).toString('hex'), employeeId: b.employeeId, text, status: 'queued', createdAt: Date.now() };
      state.tasks.push(t); save(); pump(b.employeeId);
      return send(res, 200, t);
    }

    // 정적 파일 (public/, 그리고 작업 결과 workspace/)
    let rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const root = rel.startsWith('/workspace/') ? __dirname : path.join(__dirname, 'public');
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () =>
  console.log(`🏢 AI 사무실 오픈: http://${HOST}:${PORT}  (${API_KEY ? `API 연결됨 · ${MODEL}` : '데모 모드 - .env에 ANTHROPIC_API_KEY 필요'})`));
