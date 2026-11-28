import {
  N, BDEFS, BType, ROLES, Role, DAY_SEC, MONTH_DAYS, POST_R,
  FEE_PER_HH, APT_HH, PARK_SLOTS, monthNumber, seasonOf, RANKS, fmt, Diff, DIFFS, MAX_LV, xpNeed,
} from './data';

export interface P { x: number; y: number }
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const rint = (a: number, b: number) => Math.floor(rnd(a, b + 1));
export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Building {
  id: number; type: BType; x: number; y: number; w: number; h: number;
  level: number; hp: number; num: number; occ: number;
  broken: boolean; frozen: boolean; tint: number; fixer: number;
}
export type Kind = 'adult' | 'mom' | 'kid' | 'elder';
export interface Mover { x: number; y: number; path: P[]; dir: number; anim: number }
export interface Resident extends Mover {
  id: number; name: string; kind: Kind; look: number; home: number;
  wait: number; sat: number; off: number;
  bubble: string; bubbleT: number; bubbleNeg: boolean; nextBubble: number;
  dest: string; destKey: string;
}
export interface Litter { x: number; y: number; k: number; claim: number }
export type Task =
  | { k: 'event'; ev: GEvent }
  | { k: 'litter'; l: Litter }
  | { k: 'maint'; b: Building }
  | { k: 'patrol' }
  | { k: 'visit'; b: Building }
  | { k: 'return' };
export interface Staff extends Mover {
  id: number; role: Role; name: string;
  state: 'idle' | 'walk' | 'work';
  task: Task | null; workT: number; workNeed: number; think: number;
  post: P | null; carried: boolean; status: string; idleT: number; xp: number; lv: number;
}
export interface GEvent {
  id: number; key: string; x: number; y: number; bid: number;
  spawnT: number; deadlineT: number; worker: number; role: Role; work: number;
}
export interface Scores {
  clean: number; facility: number; park: number; safety: number; amen: number; service: number;
  litterN: number; parkCap: number; demand: number; guards: number; posts: number;
  broken: number; avgHp: number; pg: number; land: number; hasMgr: boolean;
}
export interface MonthReport { label: string; income: number; upkeep: number; salary: number; net: number; sat: number }
export type ToastKind = 'info' | 'good' | 'bad' | 'warn';

// ───────── 민원/이벤트 정의 ─────────
interface EvDef {
  key: string; title: string; icon: string; role: Role; seasons: number[] | null;
  days: number; work: number; cost: number; out: number; fail: number; weight: number;
  desc: string;
  pick: (g: Game) => { x: number; y: number; bid: number } | null;
  onOpen?: (g: Game, ev: GEvent) => void;
  onClose?: (g: Game, ev: GEvent, ok: boolean) => void;
}

function pickApt(g: Game, key: string, bad?: (b: Building) => boolean) {
  const apts = g.buildings.filter(b => b.type === 'apt' && b.occ > 0 && !(bad && bad(b)) && !g.events.some(e => e.key === key && e.bid === b.id));
  if (!apts.length) return null;
  const tot = apts.reduce((s, b) => s + (110 - b.hp), 0);
  let r = Math.random() * tot;
  for (const b of apts) { r -= 110 - b.hp; if (r <= 0) return b; }
  return apts[0];
}
function atB(b: Building) { return { x: Math.floor(b.x + b.w / 2), y: Math.floor(b.y + b.h / 2), bid: b.id }; }

export const EV: Record<string, EvDef> = {
  elevator: {
    key: 'elevator', title: '승강기 고장', icon: '🛗', role: 'tech', seasons: null, days: 7, work: 5, cost: 120, out: 400, fail: 14, weight: 1.3,
    desc: '엘리베이터가 멈췄어요! 어르신과 아이 엄마들이 계단을 오르내립니다.',
    pick: g => { const b = pickApt(g, 'elevator', b => b.broken); return b ? atB(b) : null; },
    onOpen: (g, ev) => { const b = g.bById(ev.bid); if (b) b.broken = true; },
    onClose: (g, ev, ok) => { const b = g.bById(ev.bid); if (b) { b.broken = false; b.hp = ok ? Math.max(b.hp, 65) : Math.max(0, b.hp - 15); } },
  },
  freeze: {
    key: 'freeze', title: '수도 동파', icon: '🥶', role: 'tech', seasons: [3], days: 5, work: 6, cost: 200, out: 600, fail: 18, weight: 1.8,
    desc: '한파로 계량기와 배관이 얼었습니다. 터지기 전에 녹여야 해요!',
    pick: g => { const b = pickApt(g, 'freeze', b => b.frozen); return b ? atB(b) : null; },
    onOpen: (g, ev) => { const b = g.bById(ev.bid); if (b) b.frozen = true; },
    onClose: (g, ev, ok) => { const b = g.bById(ev.bid); if (b) { b.frozen = false; b.hp = ok ? Math.max(b.hp, 60) : Math.max(0, b.hp - 30); } },
  },
  noise: {
    key: 'noise', title: '층간소음 민원', icon: '🔊', role: 'manager', seasons: null, days: 8, work: 6, cost: 0, out: 250, fail: 10, weight: 1.1,
    desc: '윗집 쿵쿵 소리 때문에 아랫집이 항의했어요. 관리주임의 중재가 필요합니다.',
    pick: g => { const b = pickApt(g, 'noise'); return b ? atB(b) : null; },
  },
  doublepark: {
    key: 'doublepark', title: '이중주차 갈등', icon: '🚗', role: 'guard', seasons: null, days: 4, work: 4, cost: 0, out: 120, fail: 10, weight: 1.2,
    desc: '이중주차로 차를 못 빼는 입주민이 화가 났어요. 경비원이 정리해야 합니다.',
    pick: g => {
      const ps = g.buildings.filter(b => b.type === 'parking' && !g.events.some(e => e.key === 'doublepark' && e.bid === b.id));
      if (ps.length) return atB(pick(ps));
      const t = { x: 5, y: N - 2 };
      if (g.walkable(t.x, t.y) && !g.events.some(e => e.key === 'doublepark')) return { ...t, bid: 0 };
      return null;
    },
  },
  trash: {
    key: 'trash', title: '분리수거장 넘침', icon: '🗑️', role: 'cleaner', seasons: null, days: 5, work: 5, cost: 20, out: 120, fail: 8, weight: 0.9,
    desc: '분리수거장이 가득 차 주변에 쓰레기가 쏟아지고 있어요.',
    pick: g => {
      const rs = g.buildings.filter(b => b.type === 'recycle' && !g.events.some(e => e.key === 'trash' && e.bid === b.id));
      return rs.length ? atB(pick(rs)) : null;
    },
  },
  mowing: {
    key: 'mowing', title: '여름 예초 작업', icon: '🌿', role: 'cleaner', seasons: [1], days: 9, work: 7, cost: 40, out: 150, fail: 8, weight: 1.6,
    desc: '장마 뒤 잡초가 무성해졌어요. 벌레가 꼬이기 전에 예초기를 돌려야 합니다.',
    pick: g => g.groundNear('mowing'),
  },
  pest: {
    key: 'pest', title: '해충 방역', icon: '🪰', role: 'tech', seasons: [0, 1], days: 7, work: 5, cost: 60, out: 220, fail: 8, weight: 1.0,
    desc: '화단 주변에 모기와 벌레가 늘었다는 민원입니다. 방역 소독이 필요해요.',
    pick: g => g.groundNear('pest'),
  },
  leaves: {
    key: 'leaves', title: '낙엽 청소', icon: '🍂', role: 'cleaner', seasons: [2], days: 7, work: 5, cost: 20, out: 100, fail: 6, weight: 1.6,
    desc: '낙엽이 길을 덮었어요. 미끄러워서 넘어지기 전에 쓸어주세요.',
    pick: g => g.groundNear('leaves'),
  },
  snow: {
    key: 'snow', title: '빙판길 제설', icon: '⛄', role: 'cleaner', seasons: [3], days: 5, work: 6, cost: 30, out: 160, fail: 12, weight: 1.7,
    desc: '눈이 얼어붙어 길이 빙판이에요. 염화칼슘을 뿌리고 눈을 치워야 합니다.',
    pick: g => g.groundNear('snow'),
  },
};

const officeAt = (g: Game) => { const o = g.office(); return { x: Math.floor(o.x + o.w / 2), y: Math.floor(o.y + o.h / 2), bid: o.id }; };
EV.blackout = {
  key: 'blackout', title: '정전 발생', icon: '💡', role: 'tech', seasons: null, days: 4, work: 6, cost: 150, out: 450, fail: 15, weight: 0.8,
  desc: '배전반 이상으로 한 동이 정전됐어요. 엘리베이터도 멈췄습니다!',
  pick: g => { const b = pickApt(g, 'blackout'); return b ? atB(b) : null; },
};
EV.leak = {
  key: 'leak', title: '수도관 누수', icon: '💧', role: 'tech', seasons: null, days: 6, work: 5, cost: 100, out: 320, fail: 10, weight: 0.9,
  desc: '노후 배관에서 물이 새고 있어요. 아랫집 천장이 젖었습니다.',
  pick: g => { const b = pickApt(g, 'leak', b => b.hp > 75); return b ? atB(b) : null; },
};
EV.parcel = {
  key: 'parcel', title: '택배 분실 소동', icon: '📦', role: 'guard', seasons: null, days: 5, work: 4, cost: 0, out: 100, fail: 8, weight: 0.8,
  desc: '택배가 없어졌다는 항의가 연달아 들어와요. 경비원이 CCTV와 택배 보관함을 확인해야 합니다.',
  pick: g => { const gs = g.buildings.filter(b => b.type === 'guard'); return gs.length ? atB(pick(gs)) : officeAt(g); },
};
EV.council = {
  key: 'council', title: '입주자대표회의 소집', icon: '🗣️', role: 'manager', seasons: null, days: 8, work: 7, cost: 0, out: 300, fail: 16, weight: 0.7,
  desc: '관리비 사용 내역을 두고 대표회의가 열려요. 관리주임이 자료를 준비해 설명해야 합니다.',
  pick: g => officeAt(g),
};
EV.drill = {
  key: 'drill', title: '소방 안전훈련', icon: '🧯', role: 'manager', seasons: null, days: 9, work: 6, cost: 50, out: 200, fail: 6, weight: 0.6,
  desc: '연 2회 의무 소방훈련 시즌이에요. 안내방송과 대피 훈련을 진행해야 합니다.',
  pick: g => { const b = pickApt(g, 'drill'); return b ? atB(b) : null; },
};
EV.typhoon = {
  key: 'typhoon', title: '태풍 낙하물 정리', icon: '🌀', role: 'cleaner', seasons: [1, 2], days: 4, work: 7, cost: 40, out: 200, fail: 14, weight: 0.9,
  desc: '태풍이 지나가며 나뭇가지와 간판이 널렸어요. 사고 나기 전에 치워야 합니다.',
  pick: g => g.groundNear('typhoon'),
};
const NAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송'];
const STAFF_NAMES: Record<Role, string[]> = {
  manager: ['한주임', '오주임', '문주임', '배주임'],
  tech: ['강기사', '노기사', '유기사', '허기사'],
  guard: ['황경비', '전경비', '조경비', '민경비'],
  cleaner: ['순이 여사', '말순 여사', '옥희 여사', '영자 여사'],
};
const TRAIT: Record<Kind, Record<string, number>> = {
  adult: { clean: 1, facility: 1, park: 1.7, safety: 0.9, amen: 0.6, service: 1 },
  mom: { clean: 1.3, facility: 1, park: 0.7, safety: 1.3, amen: 1.5, service: 1 },
  kid: { clean: 0.6, facility: 0.6, park: 0.2, safety: 0.8, amen: 3, service: 0.3 },
  elder: { clean: 1, facility: 1.6, park: 0.3, safety: 1.5, amen: 1, service: 1.2 },
};
const BASE_W: Record<string, number> = { clean: 0.2, facility: 0.2, park: 0.15, safety: 0.15, amen: 0.2, service: 0.1 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const PH = {
  park: ['주차 자리 없네', '또 한 바퀴 돌아야 하나...', '이중주차 좀 어떻게 안 되나'],
  parkOk: ['주차장이 널널하네', '차 대기 편하다'],
  clean: ['단지에 쓰레기가 너무 많아', '분리수거장 냄새나…', '청소 좀 해주세요!'],
  cleanOk: ['분리수거장 깔끔하다', '단지가 깨끗해서 기분 좋네'],
  elev: ['엘베가 느려!', '또 엘리베이터 고장이야?', '계단으로 걸어 올라가야 하네…'],
  safety: ['밤길이 좀 무서운데…', '경비 아저씨 어디 계시지?'],
  safetyOk: ['경비 아저씨 든든하다', '치안이 좋아서 안심돼요'],
  amen: ['놀이터가 없어서 심심해요', '화단 좀 가꿔주세요', '나무 한 그루 없네…'],
  amenOk: ['화단이 예쁘네', '나무 그늘 시원하다', '놀이터가 있어서 좋아요'],
  service: ['관리사무소는 뭐 하나', '민원 넣었는데 답이 없네'],
  fac: ['시설이 너무 낡았어', '수압이 약해졌어요'],
  happy: ['여기 살기 좋다~', '관리소장님 수고하세요!', '오늘도 평화로운 단지'],
};
const SEASON_PH = [
  ['꽃구경하기 좋은 날씨네', '벚꽃이 예쁘다'],
  ['날이 푹푹 찌네…', '매미 소리 시끄럽다'],
  ['단풍이 곱다', '선선해서 산책하기 딱이야'],
  ['으 추워…', '눈 오니까 아이들 신났네'],
];

export class Game {
  grid = new Int16Array(N * N);
  buildings: Building[] = [];
  residents: Resident[] = [];
  staff: Staff[] = [];
  events: GEvent[] = [];
  litter: Litter[] = [];
  funds = 2500;
  day = 0; dayFrac = 0.3;
  speed = 1;
  complaints = 6; sat = 70; shock = 0;
  state: 'play' | 'fired' | 'won' = 'play';
  endReason = '';
  rank = 0; hold = 0; stars = 1;
  scores!: Scores;
  tiers: { star: number; items: { label: string; ok: boolean }[] }[] = [];
  history: MonthReport[] = [];
  lowSatDays = 0;
  patrol = 0;
  nextId = 1;
  litterAcc = 0;
  scoreT = 0;
  stats = { resolved: 0, failed: 0, outsourced: 0 };
  lastFundToast = -99;
  onToast: (t: string, k: ToastKind) => void = () => {};
  income = 0; expense = 0;
  diff: Diff = 'normal'; rainy = false;
  buffs: { sat: number; fee: number; days: number; label: string }[] = [];
  proposal: { title: string; desc: string; options: { label: string; cost: number; tip: string; fn: () => void }[] } | null = null;
  propSpeed = 1;
  onSfx: (n: string) => void = () => {};

  constructor(diff: Diff = 'normal') {
    this.diff = diff; this.funds = DIFFS[diff].funds;
    this.setupStart();
    this.computeScores();
    for (const r of this.residents) r.sat = this.personalTarget(r);
    this.updateSat();
  }

  // ───────── 급여/수수료/보정 ─────────
  salaryOf(s: Staff) { return Math.round(ROLES[s.role].salary * (1 + 0.15 * (s.lv - 1))); }
  feeRate() { return FEE_PER_HH * DIFFS[this.diff].fee * (1 + this.buffs.reduce((a, b) => a + b.fee, 0)); }
  monthlyIncome(hh: number) { return hh * this.feeRate() * (0.75 + 0.25 * this.sat / 100); }
  train(s: Staff) {
    if (s.lv >= MAX_LV) { this.toast('이미 최고 레벨이에요', 'warn'); return; }
    if (this.funds < 100) { this.toast('교육비가 부족해요 (100만원)', 'warn'); return; }
    this.funds -= 100; this.gainXp(s, 40); this.toast(`📚 ${s.name} 교육 이수 (+40 XP)`, 'good');
  }
  private gainXp(s: Staff, n: number) {
    if (s.lv >= MAX_LV) return;
    s.xp += n;
    while (s.lv < MAX_LV && s.xp >= xpNeed(s.lv)) {
      s.xp -= xpNeed(s.lv); s.lv++;
      this.toast(`⬆ ${s.name} 레벨 ${s.lv}! 일이 더 빨라졌어요 (월급 ${this.salaryOf(s)}만원)`, 'good');
      this.onSfx('level');
    }
  }

  // ───────── 저장/불러오기 ─────────
  serialize(): string {
    const d = {
      v: 1, diff: this.diff, buffs: this.buffs, funds: this.funds, day: this.day, dayFrac: this.dayFrac, complaints: this.complaints, sat: this.sat, shock: this.shock,
      rank: this.rank, hold: this.hold, history: this.history, lowSatDays: this.lowSatDays, patrol: this.patrol, nextId: this.nextId, stats: this.stats,
      buildings: this.buildings.map(b => ({ ...b, fixer: 0 })),
      residents: this.residents.map(r => ({ ...r, path: [] })),
      staff: this.staff.map(s => ({ ...s, path: [], task: null, state: 'idle', carried: false, workT: 0, think: 0.2, idleT: 0 })),
      events: this.events.map(e => ({ ...e, worker: 0 })),
      litter: this.litter.map(l => ({ ...l, claim: 0 })),
    };
    return JSON.stringify(d);
  }
  loadSave(json: string): boolean {
    try {
      const d = JSON.parse(json);
      if (!d || d.v !== 1 || !Array.isArray(d.buildings) || !d.buildings.some((b: Building) => b.type === 'office')) return false;
      this.buildings = d.buildings; this.grid.fill(0);
      for (const b of this.buildings) for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) this.grid[j * N + i] = b.id;
      this.residents = d.residents; this.staff = d.staff; this.events = d.events; this.litter = d.litter;
      for (const k of ['funds', 'day', 'dayFrac', 'complaints', 'sat', 'shock', 'rank', 'hold', 'history', 'lowSatDays', 'patrol', 'nextId', 'stats'] as const) (this as any)[k] = d[k];
      this.diff = d.diff ?? 'normal'; this.buffs = d.buffs ?? [];
      for (const st of this.staff) { st.xp ??= 0; st.lv ??= 1; }
      this.state = 'play'; this.endReason = ''; this.speed = 1;
      this.computeScores(); this.updateSat();
      return true;
    } catch { return false; }
  }

  // ───────── 시간/날짜 ─────────
  get monthIdx() { return Math.floor(this.day / MONTH_DAYS); }
  get dayOfMonth() { return (this.day % MONTH_DAYS) + 1; }
  get season() { return seasonOf(this.monthIdx); }
  get month() { return monthNumber(this.monthIdx); }
  get year() { return 2027 + Math.floor((this.monthIdx + 2) / 12); }
  get t() { return this.day + this.dayFrac; }
  get hour() { return Math.floor(this.dayFrac * 24); }
  get isNight() { const h = this.dayFrac * 24; return h < 6 || h >= 19.5; }

  toast(t: string, k: ToastKind = 'info') { this.onToast(t, k); }
  bById(id: number) { return this.buildings.find(b => b.id === id); }
  households() { return this.buildings.reduce((s, b) => s + (b.type === 'apt' ? b.occ : 0), 0); }
  capacity() { return this.buildings.reduce((s, b) => s + (b.type === 'apt' ? APT_HH[b.level] : 0), 0); }
  office() { return this.buildings.find(b => b.type === 'office')!; }
  staffCap() { return this.office().level >= 2 ? 10 : 6; }
  count(t: BType) { return this.buildings.filter(b => b.type === t).length; }

  // ───────── 초기 배치 ─────────
  private setupStart() {
    this.place('office', 5, 19, 2, 2, true);
    const a1 = this.place('apt', 7, 7, 3, 2, true)!; a1.level = 2; a1.occ = 26;
    const a2 = this.place('apt', 13, 9, 3, 2, true)!; a2.level = 1; a2.occ = 15;
    this.place('parking', 14, 16, 2, 2, true);
    this.place('recycle', 9, 14, 2, 1, true);
    this.place('guard', 2, 21, 1, 1, true);
    this.place('garden', 9, 12, 1, 1, true);
    this.place('garden', 4, 13, 1, 1, true);
    this.place('tree', 12, 13, 1, 1, true);
    this.place('tree', 4, 17, 1, 1, true);
    this.spawnStaff('guard'); this.spawnStaff('cleaner'); this.spawnStaff('tech');
    for (const s of this.staff) { const d = this.accessTile(this.office(), 3, N - 1); if (d) { s.x = d.x + 0.5; s.y = d.y + 0.5; } }
    this.syncResidents();
    for (let i = 0; i < 5; i++) this.addLitter();
  }

  // ───────── 길찾기 ─────────
  walkable(x: number, y: number) { return x >= 0 && y >= 0 && x < N && y < N && this.grid[y * N + x] === 0; }
  tileOf(e: { x: number; y: number }): P { return { x: clamp(Math.floor(e.x), 0, N - 1), y: clamp(Math.floor(e.y), 0, N - 1) }; }

  private bfs(sx: number, sy: number) {
    const dist = new Int16Array(N * N).fill(-1), prev = new Int16Array(N * N).fill(-1);
    const q = new Int16Array(N * N); let h = 0, t = 0;
    const s = sy * N + sx; dist[s] = 0; prev[s] = s; q[t++] = s;
    while (h < t) {
      const c = q[h++]; const cx = c % N, cy = (c / N) | 0;
      for (const d of DIRS) {
        const nx = cx + d[0], ny = cy + d[1];
        if (!this.walkable(nx, ny)) continue;
        const ni = ny * N + nx; if (dist[ni] >= 0) continue;
        dist[ni] = dist[c] + 1; prev[ni] = c; q[t++] = ni;
      }
    }
    return { dist, prev };
  }
  private pathFrom(r: { prev: Int16Array }, sx: number, sy: number, tx: number, ty: number): P[] {
    const out: P[] = []; let c = ty * N + tx; const s = sy * N + sx; let guard = 0;
    while (c !== s && guard++ < 1000) { out.push({ x: c % N, y: (c / N) | 0 }); c = r.prev[c]; if (c < 0) return []; }
    return out.reverse();
  }
  perim(b: Building): P[] {
    const out: P[] = [];
    for (let x = b.x; x < b.x + b.w; x++) { out.push({ x, y: b.y - 1 }, { x, y: b.y + b.h }); }
    for (let y = b.y; y < b.y + b.h; y++) { out.push({ x: b.x - 1, y }, { x: b.x + b.w, y }); }
    return out.filter(p => this.walkable(p.x, p.y));
  }
  accessTile(b: Building, fx: number, fy: number): P | null {
    let best: P | null = null, bd = 1e9;
    for (const p of this.perim(b)) { const d = (p.x - fx) ** 2 + (p.y - fy) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  /** 이동체 e → 건물/타일 경로. 도달 불가 시 null */
  route(e: Mover, goal: { b?: Building; x?: number; y?: number }, randomize = false): { path: P[]; tile: P } | null {
    const s = this.tileOf(e);
    const r = this.bfs(s.x, s.y);
    let cands: P[];
    if (goal.b) cands = this.perim(goal.b);
    else cands = [{ x: goal.x!, y: goal.y! }];
    cands = cands.filter(c => r.dist[c.y * N + c.x] >= 0);
    if (!cands.length) return null;
    let tile: P;
    if (randomize) tile = pick(cands);
    else tile = cands.reduce((a, c) => (r.dist[c.y * N + c.x] < r.dist[a.y * N + a.x] ? c : a));
    return { path: this.pathFrom(r, s.x, s.y, tile.x, tile.y), tile };
  }
  private moveEnt(e: Mover, speed: number, dt: number): boolean {
    let step = speed * dt; let moved = false;
    while (step > 0 && e.path.length) {
      const t = e.path[0]; const tx = t.x + 0.5, ty = t.y + 0.5;
      const dx = tx - e.x, dy = ty - e.y; const d = Math.hypot(dx, dy);
      moved = true;
      if (d <= step) { e.x = tx; e.y = ty; e.path.shift(); step -= d; }
      else { e.x += dx / d * step; e.y += dy / d * step; step = 0; }
      const sdx = dx - dy; if (Math.abs(sdx) > 0.01) e.dir = sdx > 0 ? 1 : -1;
    }
    if (moved) e.anim += dt * 9;
    return moved && e.path.length === 0;
  }

  // ───────── 건설 ─────────
  canPlace(type: BType, x: number, y: number, w: number, h: number, free = false): { ok: boolean; why: string } {
    const d = BDEFS[type];
    if (x < 0 || y < 0 || x + w > N || y + h > N - 1) return { ok: false, why: '맵 밖이에요' };
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.grid[j * N + i] !== 0) return { ok: false, why: '이미 건물이 있어요' };
    if (!free) {
      if (type === 'office') return { ok: false, why: '관리사무소는 지을 수 없어요' };
      if (this.funds < d.cost) return { ok: false, why: '자금이 부족해요' };
    }
    // 통로 막힘 검사
    const saved: number[] = [];
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { saved.push(this.grid[j * N + i]); this.grid[j * N + i] = -1; }
    const r = this.bfs(3, N - 1);
    const reach = (b: { x: number; y: number; w: number; h: number }) => {
      for (let i = b.x; i < b.x + b.w; i++) for (const yy of [b.y - 1, b.y + b.h]) if (this.walkable(i, yy) && r.dist[yy * N + i] >= 0) return true;
      for (let j = b.y; j < b.y + b.h; j++) for (const xx of [b.x - 1, b.x + b.w]) if (this.walkable(xx, j) && r.dist[j * N + xx] >= 0) return true;
      return false;
    };
    let ok = reach({ x, y, w, h });
    if (ok) for (const b of this.buildings) if (!reach(b)) { ok = false; break; }
    let k = 0;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.grid[j * N + i] = saved[k++];
    return ok ? { ok: true, why: '' } : { ok: false, why: '통로가 막혀서 지을 수 없어요' };
  }
  place(type: BType, x: number, y: number, w: number, h: number, free = false): Building | null {
    const c = this.canPlace(type, x, y, w, h, free);
    if (!c.ok) { if (!free) this.toast(c.why, 'warn'); return null; }
    const d = BDEFS[type];
    if (!free) this.funds -= d.cost;
    const aptNum = 101 + this.buildings.filter(b => b.type === 'apt').length;
    const b: Building = { id: this.nextId++, type, x, y, w, h, level: 1, hp: 100, num: type === 'apt' ? aptNum : 0, occ: 0, broken: false, frozen: false, tint: this.buildings.length % 4, fixer: 0 };
    this.buildings.push(b);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.grid[j * N + i] = b.id;
    if (!free) { this.afterMapChange(); this.toast(`${d.name} 건설 완료!`, 'good'); }
    return b;
  }
  moveFee(b: Building) { return b.type === 'office' ? 100 : Math.round(BDEFS[b.type].cost * 0.1); }
  canMove(b: Building, x: number, y: number, w: number, h: number): { ok: boolean; why: string } {
    const idx = this.buildings.indexOf(b); if (idx < 0) return { ok: false, why: '건물이 없어요' };
    const setGrid = (v: number) => { for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) this.grid[j * N + i] = v; };
    this.buildings.splice(idx, 1); setGrid(0);
    const r = this.canPlace(b.type, x, y, w, h, true);
    this.buildings.splice(idx, 0, b); setGrid(b.id);
    return r;
  }
  moveBuilding(b: Building, x: number, y: number, w: number, h: number): boolean {
    const c = this.canMove(b, x, y, w, h);
    if (!c.ok) { this.toast(c.why, 'warn'); return false; }
    if (x === b.x && y === b.y && w === b.w && h === b.h) return false;
    const fee = this.moveFee(b);
    if (this.funds < fee) { this.toast(`이전 비용이 부족해요 (${fee}만원)`, 'warn'); return false; }
    for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) this.grid[j * N + i] = 0;
    b.x = x; b.y = y; b.w = w; b.h = h;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.grid[j * N + i] = b.id;
    this.funds -= fee;
    for (const ev of this.events) if (ev.bid === b.id) { ev.x = Math.floor(b.x + b.w / 2); ev.y = Math.floor(b.y + b.h / 2); }
    this.afterMapChange();
    this.toast(`${BDEFS[b.type].name} 이전 완료 (수수료 ${fee}만원)`, 'good');
    return true;
  }
  upgrade(b: Building) {
    const d = BDEFS[b.type];
    if (b.level >= d.maxLevel) return;
    const cost = d.up[b.level - 1];
    if (this.funds < cost) { this.toast('자금이 부족해요', 'warn'); return; }
    this.funds -= cost; b.level++; b.hp = 100;
    this.toast(`${d.name} 업그레이드 완료! (Lv.${b.level})`, 'good');
    this.computeScores();
  }
  demolish(b: Building) {
    if (b.type === 'office') { this.toast('관리사무소는 철거할 수 없어요', 'warn'); return; }
    this.funds += Math.floor(BDEFS[b.type].cost * 0.5);
    this.buildings = this.buildings.filter(x => x !== b);
    for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) this.grid[j * N + i] = 0;
    for (const ev of [...this.events]) if (ev.bid === b.id) this.removeEvent(ev);
    for (const r of this.residents) if (r.home === b.id) r.home = 0;
    this.afterMapChange();
    this.syncResidents();
    this.toast(`${BDEFS[b.type].name} 철거 (50% 환급)`, 'info');
  }
  private afterMapChange() {
    const push = (e: Mover) => {
      const t = this.tileOf(e);
      if (!this.walkable(t.x, t.y)) {
        const r = this.bfs(3, N - 1); let best: P | null = null, bd = 1e9;
        for (let i = 0; i < N * N; i++) if (r.dist[i] >= 0) { const d = (i % N - t.x) ** 2 + (((i / N) | 0) - t.y) ** 2; if (d < bd) { bd = d; best = { x: i % N, y: (i / N) | 0 }; } }
        if (best) { e.x = best.x + 0.5; e.y = best.y + 0.5; }
      }
      e.path = [];
    };
    for (const r of this.residents) { push(r); r.wait = 0.1; }
    for (const s of this.staff) {
      if (s.carried) continue;
      push(s);
      if (s.task && s.task.k !== 'return') { const task = s.task; s.task = null; s.state = 'idle'; if (task.k === 'event') task.ev.worker = 0; if (task.k === 'litter') task.l.claim = 0; if (task.k === 'maint') task.b.fixer = 0; s.think = 0.1; }
      else { s.task = null; s.state = 'idle'; s.think = 0.1; }
    }
    this.litter = this.litter.filter(l => this.walkable(Math.floor(l.x), Math.floor(l.y)));
    this.computeScores();
  }

  // ───────── 직원 ─────────
  hire(role: Role) {
    const d = ROLES[role];
    if (this.staff.length >= this.staffCap()) { this.toast(`직원 정원이 찼어요 (${this.staffCap()}명). 관리사무소를 업그레이드하세요.`, 'warn'); return; }
    if (this.funds < d.hire) { this.toast('채용 비용이 부족해요', 'warn'); return; }
    this.funds -= d.hire;
    this.spawnStaff(role);
    this.toast(`${d.name} 채용 완료`, 'good');
    this.computeScores();
  }
  private spawnStaff(role: Role) {
    const used = this.staff.filter(s => s.role === role).length;
    const names = STAFF_NAMES[role];
    const s: Staff = {
      id: this.nextId++, role, name: names[used % names.length], x: 3.5, y: N - 0.5, path: [], dir: 1, anim: 0,
      state: 'idle', task: null, workT: 0, workNeed: 0, think: 0.2, post: null, carried: false, status: '출근', idleT: 0, xp: 0, lv: 1,
    };
    this.staff.push(s);
  }
  fire(s: Staff) {
    this.releaseTask(s);
    this.staff = this.staff.filter(x => x !== s);
    this.toast(`${s.name}님이 퇴사했어요`, 'info');
    this.computeScores();
  }
  releaseTask(s: Staff) {
    const t = s.task;
    if (t) {
      if (t.k === 'event' && t.ev.worker === s.id) t.ev.worker = 0;
      if (t.k === 'litter' && t.l.claim === s.id) t.l.claim = 0;
      if (t.k === 'maint' && t.b.fixer === s.id) t.b.fixer = 0;
    }
    s.task = null; s.state = 'idle'; s.path = [];
  }
  pickUp(s: Staff) { this.releaseTask(s); s.carried = true; s.status = '들려 있음'; }
  /** 플레이어가 직원을 집어서 (tx,ty)에 내려놓음 → 해당 구역에 배치 */
  dropStaff(s: Staff, tx: number, ty: number) {
    s.carried = false;
    let t: P = { x: clamp(tx, 0, N - 1), y: clamp(ty, 0, N - 1) };
    if (!this.walkable(t.x, t.y)) {
      const r = this.bfs(3, N - 1); let best: P | null = null, bd = 1e9;
      for (let i = 0; i < N * N; i++) if (r.dist[i] >= 0) { const d = (i % N - t.x) ** 2 + (((i / N) | 0) - t.y) ** 2; if (d < bd) { bd = d; best = { x: i % N, y: (i / N) | 0 }; } }
      if (best) t = best;
    }
    s.x = t.x + 0.5; s.y = t.y + 0.5; s.path = [];
    s.post = { x: t.x + 0.5, y: t.y + 0.5 };
    s.status = '배치됨'; s.think = 0.05;
    // 근처 민원 즉시 배정
    let near: GEvent | null = null, nd = 3.2;
    for (const ev of this.events) { const d = Math.hypot(ev.x + 0.5 - s.x, ev.y + 0.5 - s.y); if (d < nd) { nd = d; near = ev; } }
    if (near) {
      if (near.role === s.role) {
        const other = this.staff.find(o => o.id === near!.worker);
        if (other && other !== s) this.releaseTask(other);
        this.beginTask(s, { k: 'event', ev: near });
      } else {
        this.toast(`${ROLES[s.role].name}은(는) '${EV[near.key].title}'을(를) 처리할 수 없어요 (담당: ${ROLES[near.role].name})`, 'warn');
      }
    }
  }
  clearPost(s: Staff) { s.post = null; s.status = '자유 근무'; }

  private beginTask(s: Staff, task: Task): boolean {
    let goal: { b?: Building; x?: number; y?: number } | null = null;
    let need = 1;
    switch (task.k) {
      case 'event': { const ev = task.ev; goal = ev.bid ? { b: this.bById(ev.bid) } : { x: ev.x, y: ev.y }; need = ev.work; break; }
      case 'litter': goal = { x: Math.floor(task.l.x), y: Math.floor(task.l.y) }; need = 1.2; break;
      case 'maint': goal = { b: task.b }; need = 3.5; break;
      case 'visit': goal = { b: task.b }; need = 2; break;
      case 'patrol': case 'return': return false;
    }
    if (goal.b === undefined && goal.x === undefined) return false;
    const r = this.route(s, goal);
    if (!r) return false;
    s.path = r.path; s.task = task; s.workT = 0; s.workNeed = need * (1 - 0.1 * (s.lv - 1));
    s.state = r.path.length ? 'walk' : 'work';
    if (task.k === 'event') { task.ev.worker = s.id; s.status = `${EV[task.ev.key].title} 처리`; }
    if (task.k === 'litter') { task.l.claim = s.id; s.status = '청소 중'; }
    if (task.k === 'maint') { task.b.fixer = s.id; s.status = `${BDEFS[task.b.type].name} 정비`; }
    if (task.k === 'visit') s.status = '단지 순회 상담';
    return true;
  }
  private beginWalk(s: Staff, task: Task, tx: number, ty: number, label: string, need: number): boolean {
    const r = this.route(s, { x: tx, y: ty });
    if (!r) return false;
    s.path = r.path; s.task = task; s.workT = 0; s.workNeed = need * (1 - 0.1 * (s.lv - 1)); s.status = label;
    s.state = r.path.length ? 'walk' : (task.k === 'return' ? 'idle' : 'work');
    if (task.k === 'return' && !r.path.length) s.task = null;
    return true;
  }

  private assign(s: Staff) {
    const inR = (x: number, y: number) => !s.post || Math.hypot(x - s.post.x, y - s.post.y) <= POST_R;
    const st = this.tileOf(s);
    // 1) 민원 우선
    let best: GEvent | null = null, bd = 1e9;
    for (const ev of this.events) {
      if (ev.role !== s.role || ev.worker) continue;
      if (!inR(ev.x + 0.5, ev.y + 0.5)) continue;
      const d = Math.abs(ev.x - st.x) + Math.abs(ev.y - st.y);
      if (d < bd) { bd = d; best = ev; }
    }
    if (best && this.beginTask(s, { k: 'event', ev: best })) return;
    // 2) 역할별 일과
    if (s.role === 'cleaner') {
      let bl: Litter | null = null; bd = 1e9;
      for (const l of this.litter) { if (l.claim) continue; if (!inR(l.x, l.y)) continue; const d = Math.abs(l.x - s.x) + Math.abs(l.y - s.y); if (d < bd) { bd = d; bl = l; } }
      if (bl && this.beginTask(s, { k: 'litter', l: bl })) return;
    } else if (s.role === 'tech') {
      let bb: Building | null = null; let bh = 82;
      for (const b of this.buildings) { if (b.fixer || b.type === 'garden' || b.type === 'tree') continue; if (!inR(b.x + b.w / 2, b.y + b.h / 2)) continue; if (b.hp < bh) { bh = b.hp; bb = b; } }
      if (bb && this.beginTask(s, { k: 'maint', b: bb })) return;
    } else if (s.role === 'guard') {
      if (s.idleT > 2) {
        const pts: P[] = [];
        for (const b of this.buildings) if (['apt', 'parking', 'guard', 'playground'].includes(b.type) && inR(b.x + b.w / 2, b.y + b.h / 2)) { const a = this.accessTile(b, st.x, st.y); if (a) pts.push(a); }
        if (!s.post) pts.push({ x: 3, y: N - 2 });
        if (pts.length) { const p = pick(pts); if (this.beginWalk(s, { k: 'patrol' }, p.x, p.y, '단지 순찰 중', 2.5)) { s.idleT = 0; return; } }
      }
    } else if (s.role === 'manager') {
      if (s.idleT > 6) {
        const apts = this.buildings.filter(b => b.type === 'apt' && inR(b.x + b.w / 2, b.y + b.h / 2));
        if (apts.length) { const b = pick(apts); if (this.beginTask(s, { k: 'visit', b })) { s.idleT = 0; return; } }
      }
    }
    // 3) 복귀
    const home = s.post ? { x: Math.floor(s.post.x), y: Math.floor(s.post.y) } : this.accessTile(this.office(), st.x, st.y);
    if (home) {
      const far = Math.abs(home.x - st.x) + Math.abs(home.y - st.y);
      if (far > (s.post ? 1 : 3) && s.idleT > 1.5) { if (this.beginWalk(s, { k: 'return' }, home.x, home.y, s.post ? '배치 구역 복귀' : '사무소 복귀', 0)) return; }
    }
    s.status = s.post ? '배치 구역 대기' : '대기';
  }

  private updateStaff(s: Staff, dt: number) {
    if (s.carried) return;
    // 작업 유효성
    const t = s.task;
    if (t) {
      let valid = true;
      if (t.k === 'event') valid = this.events.includes(t.ev);
      else if (t.k === 'litter') valid = this.litter.includes(t.l);
      if (!valid) { s.task = null; s.state = 'idle'; s.path = []; s.think = 0.1; }
    }
    if (!s.task && s.state !== 'walk') {
      s.idleT += dt; s.think -= dt;
      if (s.think <= 0) { s.think = 0.6; this.assign(s); }
    }
    if (s.state === 'walk') {
      const arrived = this.moveEnt(s, 2.1 * (1 + 0.08 * (s.lv - 1)), dt);
      if (arrived || s.path.length === 0) {
        if (!s.task || s.task.k === 'return') { s.task = null; s.state = 'idle'; s.idleT = 0; }
        else { s.state = 'work'; s.workT = 0; }
      }
    } else if (s.state === 'work' && s.task) {
      s.workT += dt;
      if (s.workT >= s.workNeed) this.finishTask(s);
    }
  }
  private finishTask(s: Staff) {
    const t = s.task!;
    s.task = null; s.state = 'idle'; s.idleT = 0; s.think = 0.2;
    this.gainXp(s, { event: 12, litter: 2, maint: 4, visit: 3, patrol: 2, return: 0 }[t.k]);
    switch (t.k) {
      case 'event': {
        const ev = t.ev; const def = EV[ev.key];
        if (!this.events.includes(ev)) return;
        if (this.funds < def.cost) {
          ev.worker = 0; s.think = 4; s.status = '자금 부족!';
          if (this.t - this.lastFundToast > 1.5) { this.lastFundToast = this.t; this.toast(`자금이 부족해서 '${def.title}'을(를) 처리할 수 없어요 (필요 ${def.cost}만원)`, 'bad'); }
          return;
        }
        this.funds -= def.cost;
        this.resolveEvent(ev, `${s.name}이(가) 해결`);
        break;
      }
      case 'litter': this.litter = this.litter.filter(l => l !== t.l); break;
      case 'maint': t.b.fixer = 0; t.b.hp = Math.min(100, t.b.hp + 35); break;
      case 'visit': this.complaints = Math.max(0, this.complaints - 1.5); break;
      case 'patrol': this.patrol = Math.min(0.2, this.patrol + 0.03); break;
    }
  }

  // ───────── 입주민 ─────────
  syncResidents() {
    const apts = this.buildings.filter(b => b.type === 'apt');
    const total = apts.reduce((s, b) => s + Math.ceil(b.occ / 3), 0);
    const scale = total > 40 ? 40 / total : 1;
    const kinds: Kind[] = ['adult', 'mom', 'kid', 'elder', 'adult', 'kid'];
    for (const b of apts) {
      const want = Math.round(Math.ceil(b.occ / 3) * scale);
      const mine = this.residents.filter(r => r.home === b.id);
      for (let i = mine.length; i < want; i++) this.spawnResident(b, kinds[(this.residents.length + i) % kinds.length]);
      for (let i = mine.length; i > want; i--) { const r = mine[i - 1]; this.residents = this.residents.filter(x => x !== r); }
    }
    this.residents = this.residents.filter(r => r.home === 0 || this.bById(r.home));
  }
  private spawnResident(home: Building, kind: Kind) {
    const suffix = { adult: '씨', mom: '님', kid: ' 어린이', elder: ' 어르신' }[kind];
    const r: Resident = {
      id: this.nextId++, kind, look: rint(0, 5), home: home.id,
      name: `${home.num}동 ${rint(2, home.level === 1 ? 5 : home.level === 2 ? 7 : 10)}0${rint(1, 4)}호 ${pick(NAMES)}${suffix}`,
      x: 3.5, y: N - 0.5, path: [], dir: 1, anim: 0, wait: rnd(0.2, 3), sat: 70, off: rnd(-7, 7),
      bubble: '', bubbleT: 0, bubbleNeg: false, nextBubble: rnd(2, 8), dest: '막 이사 옴', destKey: 'wander',
    };
    // 신규 입주는 입구에서 시작, 기존 시작 상태는 단지 안에서 시작
    if (this.day === 0 && this.dayFrac < 0.4) { const t = this.randomWalkable(home.x + 1, home.y + 1, 6); if (t) { r.x = t.x + 0.5; r.y = t.y + 0.5; } }
    this.residents.push(r);
  }
  randomWalkable(cx: number, cy: number, rad: number): P | null {
    for (let i = 0; i < 40; i++) {
      const x = Math.round(cx + rnd(-rad, rad)), y = Math.round(cy + rnd(-rad, rad));
      if (this.walkable(x, y) && y < N - 1) return { x, y };
    }
    return null;
  }
  groundNear(key: string): { x: number; y: number; bid: number } | null {
    const anchors = this.buildings.filter(b => b.type === 'apt' || b.type === 'garden' || b.type === 'tree' || b.type === 'office');
    if (!anchors.length) return null;
    for (let i = 0; i < 40; i++) {
      const a = pick(anchors); const x = Math.round(a.x + a.w / 2 + rnd(-4, 4)), y = Math.round(a.y + a.h / 2 + rnd(-4, 4));
      if (this.walkable(x, y) && y < N - 1 && !this.events.some(e => e.key === key && Math.abs(e.x - x) + Math.abs(e.y - y) < 3)) return { x, y, bid: 0 };
    }
    return null;
  }
  private chooseDest(r: Resident) {
    const W: Record<Kind, [string, number][]> = {
      adult: [['entrance', 3], ['parking', 3], ['recycle', 1], ['apt', 2], ['wander', 1], ['garden', 1], ['community', 2]],
      mom: [['playground', 4], ['recycle', 2], ['garden', 2], ['wander', 1], ['apt', 1], ['entrance', 1], ['community', 2]],
      kid: [['playground', 6], ['garden', 1], ['wander', 3], ['tree', 1]],
      elder: [['garden', 4], ['tree', 3], ['guard', 1], ['wander', 2], ['apt', 1], ['community', 2]],
    };
    const opts = W[r.kind].filter(([k]) => ['entrance', 'wander', 'apt'].includes(k) || this.buildings.some(b => b.type === k));
    let tot = opts.reduce((s, o) => s + o[1], 0), x = Math.random() * tot, key = 'wander';
    for (const o of opts) { x -= o[1]; if (x <= 0) { key = o[0]; break; } }
    let res: { path: P[]; tile: P } | null = null;
    const names: Record<string, string> = { entrance: '단지 밖으로 외출', parking: '주차장으로', recycle: '분리수거 하러', apt: '집으로', wander: '산책 중', garden: '화단 구경', tree: '나무 그늘로', playground: '놀이터로', guard: '경비실로', community: '커뮤니티센터로' };
    if (key === 'entrance') res = this.route(r, { x: 3 + rint(0, 3), y: N - 1 }, true);
    else if (key === 'wander') { const t = this.randomWalkable(r.x, r.y, 6); if (t) res = this.route(r, t); }
    else if (key === 'apt') { const h = this.bById(r.home) ?? pick(this.buildings.filter(b => b.type === 'apt')); if (h) res = this.route(r, { b: h }, true); }
    else { const bs = this.buildings.filter(b => b.type === key); if (bs.length) res = this.route(r, { b: pick(bs) }, true); }
    r.dest = names[key];
    r.destKey = key;
    if (res) { r.path = res.path; r.wait = 0; if (!res.path.length) this.onArrive(r); } else r.wait = rnd(1, 3);
  }
  private onArrive(r: Resident) {
    r.wait = rnd(2.5, 6);
    const key = r.destKey;
    if (r.bubbleT > 0) return;
    if (Math.random() < 0.55) {
      let text = '', neg = false;
      const S = this.scores;
      if (key === 'playground' && (r.kind === 'kid' || r.kind === 'mom')) { text = r.kind === 'kid' ? '와 놀이터다!' : '아이랑 놀기 딱 좋네'; }
      else if (key === 'recycle') { if (S.clean < 0.6) { text = pick(PH.clean); neg = true; } else { text = pick(PH.cleanOk); } }
      else if (key === 'parking') { if (S.park < 0.8) { text = pick(PH.park); neg = true; } else text = pick(PH.parkOk); }
      else if (key === 'garden' || key === 'tree') { text = S.amen > 0.6 ? pick(PH.amenOk) : pick(PH.amen); neg = S.amen <= 0.6; }
      else if (key === 'community') { text = pick(['헬스장 운동하고 가야지 💪', '독서실이 조용해서 좋아', '작은도서관 책 빌려가야지', '커뮤니티센터 최고!']); }
      else if (key === 'guard') { text = S.safety > 0.6 ? pick(PH.safetyOk) : pick(PH.safety); neg = S.safety <= 0.6; }
      if (text) this.say(r, text, neg);
    }
  }
  say(r: Resident, text: string, neg: boolean) { r.bubble = text; r.bubbleNeg = neg; r.bubbleT = 4.2; }
  private thought(r: Resident) {
    const S = this.scores; const c: { w: number; t: string; neg: boolean }[] = [];
    const home = this.bById(r.home);
    if (home?.broken || this.buildings.some(b => b.broken)) c.push({ w: home?.broken ? 6 : 2, t: pick(PH.elev), neg: true });
    if (home && this.events.some(e => e.key === 'noise' && e.bid === home.id)) c.push({ w: 6, t: pick(['윗집 쿵쿵거려서 잠을 못 자겠어', '층간소음 때문에 미치겠네']), neg: true });
    if (home?.frozen) c.push({ w: 6, t: '수도가 꽁꽁 얼었어요!', neg: true });
    if (this.events.some(e => e.key === 'doublepark')) c.push({ w: 4, t: '이중주차 때문에 차를 못 빼겠어!', neg: true });
    if (this.events.some(e => e.key === 'mowing')) c.push({ w: 3, t: '풀이 너무 자라서 벌레가 꼬여요', neg: true });
    if (this.events.some(e => e.key === 'snow')) c.push({ w: 3, t: '길이 빙판이라 미끄러워요!', neg: true });
    if (this.events.some(e => e.key === 'leaves')) c.push({ w: 2, t: '낙엽이 수북이 쌓였네', neg: true });
    if (this.events.some(e => e.key === 'trash')) c.push({ w: 3, t: '분리수거장이 넘쳐요!', neg: true });
    if (this.events.some(e => e.key === 'blackout')) c.push({ w: 5, t: '정전이에요! 냉장고 다 녹겠네', neg: true });
    if (this.events.some(e => e.key === 'leak')) c.push({ w: 4, t: '천장에서 물이 새요!', neg: true });
    if (this.events.some(e => e.key === 'parcel')) c.push({ w: 3, t: '택배가 없어졌어요. 경비실 CCTV 좀 봐주세요', neg: true });
    if (this.events.some(e => e.key === 'council')) c.push({ w: 3, t: '주민회의에서 따져야겠어', neg: true });
    if (this.events.some(e => e.key === 'typhoon')) c.push({ w: 3, t: '태풍에 낙하물 위험해요!', neg: true });
    if (this.events.some(e => e.key === 'drill')) c.push({ w: 2, t: '소방훈련… 귀찮지만 해야지', neg: false });
    if (this.rainy) c.push({ w: 2, t: pick(['비 오는 날엔 파전이지', '우산 챙길 걸…', '빗소리 좋다']), neg: false });
    if (this.events.some(e => e.key === 'pest')) c.push({ w: 2, t: '모기가 너무 많아요', neg: true });
    if (S.park < 0.8) c.push({ w: (1 - S.park) * 8, t: pick(PH.park), neg: true });
    if (S.clean < 0.7) c.push({ w: (1 - S.clean) * 8, t: pick(PH.clean), neg: true });
    if (S.facility < 0.75) c.push({ w: (1 - S.facility) * 6, t: pick(PH.fac), neg: true });
    if (S.safety < 0.6) c.push({ w: (1 - S.safety) * 6, t: pick(PH.safety), neg: true });
    if (S.amen < 0.55) c.push({ w: (1 - S.amen) * 5, t: pick(PH.amen), neg: true });
    if (!S.hasMgr) c.push({ w: 1.5, t: pick(PH.service), neg: true });
    if (S.clean > 0.85) c.push({ w: 2, t: pick(PH.cleanOk), neg: false });
    if (S.park > 0.95) c.push({ w: 1, t: pick(PH.parkOk), neg: false });
    if (S.safety > 0.8) c.push({ w: 1.5, t: pick(PH.safetyOk), neg: false });
    if (S.amen > 0.8) c.push({ w: 2, t: pick(PH.amenOk), neg: false });
    if (r.sat > 70) c.push({ w: 2.5, t: pick(PH.happy), neg: false });
    c.push({ w: 1.2, t: pick(SEASON_PH[this.season]), neg: false });
    const tot = c.reduce((s, x) => s + x.w, 0); let x = Math.random() * tot;
    for (const o of c) { x -= o.w; if (x <= 0) return o; }
    return c[0];
  }
  /** 클릭 시 보여줄 불만/만족 요인 */
  reasons(r: Resident): { bad: string[]; good: string[] } {
    const S = this.scores; const bad: [number, string][] = []; const good: string[] = [];
    const tw = TRAIT[r.kind];
    const add = (key: string, s: number, badText: string, goodText: string) => {
      const w = BASE_W[key] * tw[key];
      if (s < 0.75) bad.push([w * (1 - s), badText]); else if (s > 0.85) good.push(goodText);
    };
    add('clean', S.clean, `단지에 쓰레기가 널려 있어요 (${S.litterN}개)`, '단지가 깨끗해요');
    add('facility', S.facility, S.broken ? `승강기·배관 고장 ${S.broken}건, 시설 정비도 ${Math.round(S.avgHp)}%` : `시설이 노후했어요 (정비도 ${Math.round(S.avgHp)}%)`, '시설 관리가 잘 돼 있어요');
    add('park', S.park, `주차 공간이 부족해요 (차량 ${S.demand}대 / 주차면 ${S.parkCap}면)`, '주차 걱정이 없어요');
    add('safety', S.safety, `치안이 불안해요 (경비원 ${S.guards}명, 경비실 ${S.posts}곳)`, '경비가 든든해요');
    add('amen', S.amen, S.pg < 0.5 ? '놀이터가 부족해요' : '조경이 삭막해요 (화단·나무가 부족)', '놀이터·조경이 마음에 들어요');
    add('service', S.service, S.hasMgr ? '민원 처리가 지연되고 있어요' : '관리주임이 없어 민원 접수가 느려요', '관리사무소 응대가 좋아요');
    const home = this.bById(r.home);
    for (const e of this.events) if (e.bid === home?.id || e.bid === 0) bad.push([0.1, `진행 중 민원: ${EV[e.key].title}`]);
    if (this.shock > 3) bad.push([0.05, '최근 해결되지 않은 민원 때문에 신뢰가 떨어졌어요']);
    bad.sort((a, b) => b[0] - a[0]);
    return { bad: bad.slice(0, 4).map(x => x[1]), good: good.slice(0, 3) };
  }
  personalTarget(r: Resident): number {
    const S = this.scores; const tw = TRAIT[r.kind];
    const vals: Record<string, number> = { clean: S.clean, facility: S.facility, park: S.park, safety: S.safety, amen: S.amen, service: S.service };
    let ws = 0, sum = 0;
    for (const k in vals) { const w = BASE_W[k] * tw[k]; ws += w; sum += w * vals[k]; }
    let v = 100 * sum / ws;
    let pen = 0;
    for (const e of this.events) {
      const def = EV[e.key]; const frac = clamp((this.t - e.spawnT) / (e.deadlineT - e.spawnT), 0, 1);
      pen += (1.2 + 5 * frac * frac) * (e.bid && e.bid === r.home ? 2 : 1);
    }
    v -= Math.min(30, pen) + this.shock;
    v += this.buffs.reduce((a, b) => a + b.sat, 0);
    return clamp(v + r.off, 0, 100);
  }
  private updateResident(r: Resident, dt: number) {
    r.sat += (this.personalTarget(r) - r.sat) * Math.min(1, dt * 0.15);
    if (r.bubbleT > 0) r.bubbleT -= dt;
    if (r.path.length) { if (this.moveEnt(r, r.kind === 'kid' ? 1.5 : r.kind === 'elder' ? 0.8 : 1.1, dt)) this.onArrive(r); }
    else { r.wait -= dt; if (r.wait <= 0) this.chooseDest(r); }
    r.nextBubble -= dt;
    if (r.nextBubble <= 0) {
      r.nextBubble = rnd(7, 16);
      if (r.bubbleT <= 0) { const th = this.thought(r); this.say(r, th.t, th.neg); }
    }
  }
  updateSat() {
    if (!this.residents.length) { this.sat = 70; return; }
    this.sat = this.residents.reduce((s, r) => s + r.sat, 0) / this.residents.length;
  }

  // ───────── 점수/등급 ─────────
  computeScores() {
    const hh = this.households();
    const guards = this.staff.filter(s => s.role === 'guard').length;
    const posts = this.count('guard');
    let hpSum = 0, wSum = 0, broken = 0;
    for (const b of this.buildings) {
      if (b.type === 'garden' || b.type === 'tree') continue;
      const w = b.type === 'apt' ? 1 : 0.5; hpSum += b.hp * w; wSum += w;
      if (b.broken || b.frozen) broken++;
    }
    const avgHp = wSum ? hpSum / wSum : 100;
    const parkCap = this.buildings.reduce((s, b) => s + (b.type === 'parking' ? PARK_SLOTS[b.level] : 0), 0);
    const demand = Math.ceil(hh * 0.45);
    const pgW = this.buildings.reduce((s, b) => s + (b.type === 'playground' ? (b.level === 2 ? 1.6 : 1) : 0), 0);
    const landW = this.count('garden') + 1.5 * this.count('tree');
    const commW = this.buildings.reduce((a, b) => a + (b.type === 'community' ? (b.level === 2 ? 1.5 : 1) : 0), 0);
    const pg = clamp(pgW / Math.max(0.5, hh / 50), 0, 1);
    const land = clamp(landW / Math.max(2, hh / 6), 0, 1);
    const hasMgr = this.staff.some(s => s.role === 'manager');
    this.scores = {
      clean: clamp(1 - this.litter.length / (8 + hh * 0.2), 0, 1),
      facility: clamp(avgHp / 100 - 0.12 * broken, 0, 1),
      park: demand ? clamp((parkCap + 6) / demand, 0, 1) : 1,
      safety: clamp(0.2 + 0.22 * Math.min(posts, 2) + 0.18 * Math.min(guards, 3) + this.patrol + 0.07 * Math.min(4, this.count('cctv')), 0, 1),
      amen: Math.min(1, 0.45 * pg + 0.55 * land + 0.2 * clamp(commW / Math.max(0.5, hh / 70), 0, 1)),
      service: clamp((hasMgr ? 1 : 0.55) * (1 - this.complaints / 160), 0, 1),
      litterN: this.litter.length, parkCap, demand, guards, posts, broken, avgHp, pg, land, hasMgr,
    };
    this.evalStars();
  }
  private evalStars() {
    const S = this.scores; const hh = this.households(); const sat = this.sat;
    const care = this.count('garden') + this.count('tree');
    const pgs = this.count('playground');
    const nStaff = this.staff.length;
    const tiers = [
      { star: 2, items: [{ label: '입주민 만족도 50% 이상', ok: sat >= 50 }, { label: `입주 세대 40세대 이상 (현재 ${hh})`, ok: hh >= 40 }] },
      { star: 3, items: [{ label: '입주민 만족도 62% 이상', ok: sat >= 62 }, { label: `입주 세대 60세대 이상 (현재 ${hh})`, ok: hh >= 60 }, { label: '놀이터 1곳 이상', ok: pgs >= 1 }, { label: `화단·조경수 5개 이상 (현재 ${care})`, ok: care >= 5 }, { label: '경비실 1곳 이상', ok: S.posts >= 1 }] },
      { star: 4, items: [{ label: '입주민 만족도 75% 이상', ok: sat >= 75 }, { label: `입주 세대 85세대 이상 (현재 ${hh})`, ok: hh >= 85 }, { label: '주차 수요 충족 (주차 점수 95%+)', ok: S.park >= 0.95 }, { label: `화단·조경수 10개 이상 (현재 ${care})`, ok: care >= 10 }, { label: `직원 5명 이상 (현재 ${nStaff})`, ok: nStaff >= 5 }, { label: '놀이터 2곳 이상', ok: pgs >= 2 }] },
      { star: 5, items: [{ label: '입주민 만족도 85% 이상', ok: sat >= 85 }, { label: `입주 세대 110세대 이상 (현재 ${hh})`, ok: hh >= 110 }, { label: `화단·조경수 14개 이상 (현재 ${care})`, ok: care >= 14 }, { label: '경비실 2곳 이상', ok: S.posts >= 2 }, { label: '분리수거장 2곳 이상', ok: this.count('recycle') >= 2 }, { label: `직원 7명 이상 (현재 ${nStaff})`, ok: nStaff >= 7 }, { label: '시설 정비도 80% 이상 · 고장 0건', ok: S.avgHp >= 80 && S.broken === 0 }] },
    ];
    this.tiers = tiers;
    let st = 1;
    for (const t of tiers) { if (t.items.every(i => i.ok)) st = t.star; else break; }
    this.stars = st;
  }

  // ───────── 민원/이벤트 ─────────
  private spawnEvent() {
    if (this.events.length >= 6) return;
    const list = Object.values(EV).filter(d => !d.seasons || d.seasons.includes(this.season));
    // 후보를 가중 랜덤 순서로 시도
    const pool = [...list];
    while (pool.length) {
      const tot = pool.reduce((s, d) => s + d.weight, 0); let r = Math.random() * tot; let idx = 0;
      for (let i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) { idx = i; break; } }
      const def = pool.splice(idx, 1)[0];
      const loc = def.pick(this);
      if (!loc) continue;
      const ev: GEvent = { id: this.nextId++, key: def.key, x: loc.x, y: loc.y, bid: loc.bid, spawnT: this.t, deadlineT: this.t + def.days, worker: 0, role: def.role, work: def.work };
      this.events.push(ev);
      def.onOpen?.(this, ev);
      const b = this.bById(ev.bid);
      this.toast(`📢 ${def.title}${b && b.type === 'apt' ? ` (${b.num}동)` : ''} 발생! ${def.days}일 안에 해결하세요`, 'warn');
      return;
    }
  }
  removeEvent(ev: GEvent) {
    this.events = this.events.filter(e => e !== ev);
    for (const s of this.staff) if (s.task && s.task.k === 'event' && s.task.ev === ev) { s.task = null; s.state = 'idle'; s.path = []; s.think = 0.1; }
  }
  private resolveEvent(ev: GEvent, how: string) {
    const def = EV[ev.key];
    const frac = clamp((this.t - ev.spawnT) / (ev.deadlineT - ev.spawnT), 0, 1);
    this.removeEvent(ev);
    def.onClose?.(this, ev, true);
    this.complaints = Math.max(0, this.complaints - (4 + 4 * (1 - frac)));
    this.shock = Math.max(0, this.shock - 2);
    this.stats.resolved++;
    this.toast(`✅ ${def.title} 해결! (${how})`, 'good');
    this.computeScores();
  }
  outsource(ev: GEvent) {
    const def = EV[ev.key];
    if (this.funds < def.out) { this.toast('외주 비용이 부족해요', 'warn'); return; }
    this.funds -= def.out; this.stats.outsourced++;
    this.resolveEvent(ev, '외주업체');
  }
  private failEvent(ev: GEvent) {
    const def = EV[ev.key];
    this.removeEvent(ev);
    def.onClose?.(this, ev, false);
    const fl = def.fail * DIFFS[this.diff].fail; this.complaints += fl; this.shock += fl * 0.6; this.stats.failed++;
    this.toast(`❌ '${def.title}' 기한 초과! 민원 폭발 +${def.fail}`, 'bad');
    this.computeScores();
  }

  // ───────── 쓰레기 ─────────
  private addLitter() {
    const apts = this.buildings.filter(b => b.type === 'apt');
    if (!apts.length || this.litter.length >= 50) return;
    const a = pick(apts); const t = this.randomWalkable(a.x + a.w / 2, a.y + a.h / 2, 4);
    if (t) this.litter.push({ x: t.x + rnd(0.25, 0.75), y: t.y + rnd(0.25, 0.75), k: rint(0, 3), claim: 0 });
  }

  // ───────── 메인 루프 ─────────
  update(realDt: number) {
    if (this.state !== 'play' || this.speed === 0) return;
    let dt = realDt * this.speed;
    while (dt > 0 && this.state === 'play') { const s = Math.min(dt, 0.1); this.step(s); dt -= s; }
  }
  private step(dt: number) {
    this.dayFrac += dt / DAY_SEC;
    while (this.dayFrac >= 1) { this.dayFrac -= 1; this.onDay(); if (this.state !== 'play') return; }
    for (const r of this.residents) this.updateResident(r, dt);
    for (const s of this.staff) this.updateStaff(s, dt);
    // 기한 초과
    for (const ev of [...this.events]) if (this.t >= ev.deadlineT) this.failEvent(ev);
    // 쓰레기
    const hh = this.households();
    const red = Math.min(0.75, this.buildings.reduce((s, b) => s + (b.type === 'recycle' ? 0.3 * b.level : 0), 0));
    this.litterAcc += dt * (hh * 0.05 / DAY_SEC) * (1 - red);
    while (this.litterAcc >= 1) { this.litterAcc -= 1; this.addLitter(); }
    this.scoreT -= dt;
    if (this.scoreT <= 0) { this.scoreT = 0.5; this.computeScores(); }
    this.updateSat();
    this.income = this.monthlyIncome(hh);
    this.expense = this.buildings.reduce((s, b) => s + BDEFS[b.type].upkeep, 0) + this.staff.reduce((s, x) => s + this.salaryOf(x), 0);
    // 게임오버 조건
    if (this.complaints >= 100) this.end('fired', '민원 게이지가 폭발했습니다. 입주자대표회의가 관리소장 해임을 의결했어요.');
  }
  private end(s: 'fired' | 'won', why: string) { this.state = s; this.endReason = why; this.speed = 0; }

  private onDay() {
    this.day++;
    const prevSeason = seasonOf(Math.floor((this.day - 1) / MONTH_DAYS));
    // 시설 노후
    for (const b of this.buildings) { if (b.type === 'garden' || b.type === 'tree') continue; b.hp = Math.max(0, b.hp - (b.type === 'apt' ? 0.9 : 0.35)); }
    // 입주/퇴거
    const hh0 = this.households();
    for (const b of this.buildings) {
      if (b.type !== 'apt') continue;
      const cap = APT_HH[b.level];
      if (this.sat >= 55 && b.occ < cap && Math.random() < 0.55) b.occ++;
      else if (this.sat < 35 && b.occ > cap * 0.4 && Math.random() < 0.2) b.occ--;
    }
    if (this.households() !== hh0 && this.day % 3 === 0) this.syncResidents();
    // 민원 게이지
    const ds = this.sat;
    this.complaints += Math.max(0, 65 - ds) / 65 * 2.5;
    if (ds >= 65) this.complaints -= 0.25;
    if (this.staff.some(s => s.role === 'manager')) this.complaints -= 0.3;
    this.complaints = clamp(this.complaints, 0, 100);
    this.shock = Math.max(0, this.shock - 0.5);
    this.buffs = this.buffs.map(b => ({ ...b, days: b.days - 1 })).filter(b => b.days > 0);
    this.rainy = Math.random() < [0.2, 0.35, 0.15, 0][this.season];
    this.patrol *= 0.9;
    // 낮은 만족도 지속
    if (ds < 20) this.lowSatDays++; else this.lowSatDays = 0;
    if (this.lowSatDays >= 15) { this.end('fired', '입주민 만족도가 바닥에서 벗어나지 못했습니다. 관리소장 해임!'); return; }
    // 이벤트 발생
    if (this.day >= 5) {
      const p = (0.14 + Math.min(0.2, this.households() / 450)) * DIFFS[this.diff].ev;
      if (Math.random() < p) this.spawnEvent();
    }
    // 월 정산 & 계절
    if (this.day % MONTH_DAYS === 0) this.settleMonth(prevSeason);
    // 승격
    this.progressRank();
    this.computeScores();
  }
  private settleMonth(prevSeason: number) {
    const hh = this.households();
    const income = Math.round(this.monthlyIncome(hh));
    const upkeep = this.buildings.reduce((s, b) => s + BDEFS[b.type].upkeep, 0);
    const salary = this.staff.reduce((s, x) => s + this.salaryOf(x), 0);
    const net = income - upkeep - salary;
    this.funds += net;
    const mi = this.monthIdx - 1;
    this.history.unshift({ label: `${monthNumber(mi)}월`, income, upkeep, salary, net, sat: Math.round(this.sat) });
    if (this.history.length > 12) this.history.pop();
    this.toast(`💰 ${monthNumber(mi)}월 정산: 수입 ${fmt(income)} - 지출 ${fmt(upkeep + salary)} = ${net >= 0 ? '+' : ''}${fmt(net)}만원`, net >= 0 ? 'good' : 'bad');
    if (mi % 12 === 11) {
      const ins = Math.round(100 + hh * 2); this.funds -= ins;
      this.toast(`🧾 연간 법정 점검(승강기·소방·전기) 비용 ${fmt(ins)}만원이 지출됐어요`, 'warn');
    }
    if (this.monthIdx >= 2 && !this.proposal && Math.random() < 0.55) this.makeProposal();
    if (this.funds < -2000) { this.end('fired', '관리비 적자가 누적되어 단지 재정이 파탄났습니다. 관리소장 해임!'); return; }
    if (this.season !== prevSeason) {
      const msg = ['🌸 봄이 왔어요. 해충 방역 철입니다.', '☀️ 여름입니다. 예초 작업과 폭염에 대비하세요!', '🍁 가을이에요. 낙엽 청소가 늘어납니다.', '❄️ 겨울입니다! 동파와 빙판길을 조심하세요.'][this.season];
      this.toast(msg, 'info');
    }
  }
  // ───────── 주민 제안(선택형 이벤트) ─────────
  private makeProposal() {
    const buff = (sat: number, fee: number, days: number, label: string) => () => { this.buffs.push({ sat, fee, days, label }); };
    const list: NonNullable<Game['proposal']>[] = [
      { title: '놀이터 안전매트 교체 요청', desc: '어린이집 학부모들이 놀이터 바닥이 낡아 위험하다며 교체를 요청했어요.', options: [
        { label: '교체해 드린다', cost: 300, tip: '만족도 +6% (40일)', fn: buff(6, 0, 40, '안전매트 교체') },
        { label: '다음 예산에 반영', cost: 0, tip: '민원 게이지 +5', fn: () => { this.complaints += 5; } } ] },
      { title: 'CCTV·보안등 확충 요구', desc: '최근 단지 주변 침입 소문으로 입주민들이 CCTV와 보안등 추가를 요구합니다.', options: [
        { label: '즉시 설치', cost: 200, tip: '치안 보너스 + 만족도 +4% (40일)', fn: () => { this.patrol = Math.min(0.2, this.patrol + 0.12); this.buffs.push({ sat: 4, fee: 0, days: 40, label: '보안 강화' }); } },
        { label: '예산 부족을 설명', cost: 0, tip: '신뢰도 하락 (패널티 +4)', fn: () => { this.shock += 4; } } ] },
      { title: '관리비 인상 제안', desc: '물가 상승으로 관리 용역비가 올랐어요. 관리비를 올릴지 입주자대표회의가 묻습니다.', options: [
        { label: '인상 수락', cost: 0, tip: '관리비 +10% (60일), 만족도 -4%', fn: buff(-4, 0.1, 60, '관리비 인상') },
        { label: '설득 간담회 (소규모 인상)', cost: 80, tip: '관리비 +5% (60일), 만족도 -1%', fn: buff(-1, 0.05, 60, '소폭 인상') },
        { label: '동결 유지', cost: 0, tip: '변화 없음', fn: () => {} } ] },
      { title: '경로당 어르신 행사 지원 요청', desc: '경로당에서 어버이날 행사 비용 지원을 요청해 왔어요.', options: [
        { label: '지원한다', cost: 250, tip: '만족도 +5% (40일)', fn: buff(5, 0, 40, '경로당 지원') },
        { label: '정중히 거절', cost: 0, tip: '민원 게이지 +4', fn: () => { this.complaints += 4; } } ] },
      { title: '입주민 장터(벼룩시장) 개최', desc: '부녀회가 단지 안에서 벼룩시장을 열고 싶어 해요.', options: [
        { label: '장소·텐트 지원', cost: 150, tip: '만족도 +5% (20일), 민원 -5', fn: () => { this.complaints = Math.max(0, this.complaints - 5); this.buffs.push({ sat: 5, fee: 0, days: 20, label: '벼룩시장' }); } },
        { label: '이번엔 미룬다', cost: 0, tip: '변화 없음', fn: () => {} } ] },
      { title: '주차 단속 강화 요청', desc: '이중주차와 불법주차 때문에 불편하다며 단속을 강화해 달라는 요청이에요.', options: [
        { label: '단속 강화 안내', cost: 0, tip: '민원 -3, 만족도 -1% (30일)', fn: () => { this.complaints = Math.max(0, this.complaints - 3); this.buffs.push({ sat: -1, fee: 0, days: 30, label: '단속 강화' }); } },
        { label: '유예 기간 부여', cost: 0, tip: '민원 게이지 +3', fn: () => { this.complaints += 3; } } ] },
    ];
    this.proposal = pick(list);
    this.propSpeed = this.speed || 1; this.speed = 0;
    this.toast('📝 입주민 제안이 도착했어요!', 'warn');
  }
  resolveProposal(i: number) {
    const pr = this.proposal; if (!pr) return;
    const o = pr.options[i]; if (!o) return;
    if (this.funds < o.cost) { this.toast('자금이 부족해요', 'warn'); return; }
    this.funds -= o.cost; o.fn();
    this.proposal = null; this.speed = this.state === 'play' ? this.propSpeed : 0;
    this.toast(`📝 '${o.label}' 선택 → ${o.tip}`, 'info');
    this.computeScores();
  }
  private progressRank() {
    if (this.rank >= RANKS.length - 1) return;
    const goal = RANKS[this.rank + 1];
    if (this.stars >= goal.need && this.sat >= goal.minSat) this.hold++; else this.hold = Math.max(0, this.hold - 1);
    if (this.hold >= goal.days) {
      this.rank++; this.hold = 0;
      if (this.rank === RANKS.length - 1) {
        this.end('won', `${goal.title} 달성! 단지가 '명품 5성급 아파트'로 선정되었습니다.`);
        this.toast(`🏆 ${goal.title} 달성!`, 'good');
      } else {
        const bonus = 800 * this.rank; this.funds += bonus;
        this.toast(`🎉 승진! ${goal.title}으로 승진했습니다. 성과급 ${fmt(bonus)}만원`, 'good');
      }
    }
  }
}
