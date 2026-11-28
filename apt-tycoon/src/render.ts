import { N, BDEFS, BType, APT_FLOORS, PARK_SLOTS, POST_R, ROLES } from './data';
import { Game, Building, Resident, Staff, GEvent, EV, P } from './game';

export interface View {
  camX: number; camY: number; S: number;
  hover: P | null;
  tool: BType | 'demolish' | null;
  rot: boolean;
  selected: { kind: 'resident' | 'staff' | 'building' | 'event'; id: number } | null;
  carrying: Staff | null;
  mouse: { x: number; y: number };
  placeStaff: Staff | null;
  moveB: Building | null;
  ghostOk: boolean;
}

type Ctx = CanvasRenderingContext2D;
const px = (x: number, y: number, z = 0): [number, number] => [(x - y) * 16, (x + y) * 8 - z];

function poly(c: Ctx, pts: [number, number][], fill: string, stroke?: string) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
}
function box(c: Ctx, x: number, y: number, w: number, h: number, z0: number, H: number, top: string, left: string, right: string) {
  poly(c, [px(x, y + h, z0), px(x + w, y + h, z0), px(x + w, y + h, z0 + H), px(x, y + h, z0 + H)], left);
  poly(c, [px(x + w, y + h, z0), px(x + w, y, z0), px(x + w, y, z0 + H), px(x + w, y + h, z0 + H)], right);
  poly(c, [px(x, y, z0 + H), px(x + w, y, z0 + H), px(x + w, y + h, z0 + H), px(x, y + h, z0 + H)], top);
}
function face(c: Ctx, ox: number, oy: number, slope: number, fn: () => void) {
  c.save(); c.translate(ox, oy); c.transform(1, slope, 0, 1, 0, 0); fn(); c.restore();
}
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}
function hash(a: number, b = 0) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

const GROUND = [
  { a: '#7cc060', b: '#72b857', d: ['#9ad46f', '#5fa04a', '#f0a8c8'] },
  { a: '#5fae4a', b: '#56a443', d: ['#78c35a', '#3f8a38', '#f0e060'] },
  { a: '#b6a54e', b: '#ab9a45', d: ['#cf8a3c', '#8a7a38', '#e0c070'] },
  { a: '#e2eaf0', b: '#d6e0e8', d: ['#ffffff', '#bccbd6', '#c8d8e8'] },
];
const APT_COL = [
  { wall: '#e9dfc2', accent: '#c8504a' },
  { wall: '#d7dce2', accent: '#3f78c0' },
  { wall: '#efe4aa', accent: '#3f9a62' },
  { wall: '#cfdcea', accent: '#d89a2a' },
];
const CAR = ['#d8483c', '#3d6fc0', '#e8e8e8', '#2c2f38', '#e0b030', '#4aa070'];
const SHIRT = ['#d2584a', '#4a86c8', '#58a868', '#d8a038', '#8a62b8', '#e07aa0'];
const HAIR = ['#2a1d14', '#5a3a22', '#1a1a1a', '#8a5a2a', '#3a2a40', '#6a4a30'];

export function nightAlpha(h: number): number {
  if (h >= 19.5 || h < 5) return 0.4;
  if (h >= 17.5) return (h - 17.5) / 2 * 0.4;
  if (h < 7) return (7 - h) / 2 * 0.4;
  return 0;
}

interface Particle { x: number; y: number; vx: number; vy: number; c: string; s: number }
export interface Marker { x: number; y: number; r: number; evId: number }

export class Renderer {
  world: HTMLCanvasElement; over: HTMLCanvasElement;
  c: Ctx; o: Ctx;
  Wl = 0; Hl = 0; ox = 0; oy = 0; S = 2; cssW = 0; cssH = 0; dpr = 1;
  tiles: HTMLCanvasElement[][] = [];
  road: HTMLCanvasElement[] = [];
  parts: Particle[] = [];
  markers: Marker[] = [];
  time = 0;

  constructor(world: HTMLCanvasElement, over: HTMLCanvasElement) {
    this.world = world; this.over = over;
    this.c = world.getContext('2d')!; this.o = over.getContext('2d')!;
    for (let s = 0; s < 4; s++) { this.tiles.push([]); for (let v = 0; v < 8; v++) this.tiles[s].push(this.makeTile(s, v)); }
    for (let v = 0; v < 2; v++) this.road.push(this.makeRoad(v));
  }

  private diamond(c: Ctx, fill: string, noise?: { d: string[]; seed: number }) {
    for (let r = 0; r < 16; r++) {
      const w = r < 8 ? 4 * r + 4 : 4 * (15 - r) + 4;
      c.fillStyle = fill; c.fillRect((32 - w) / 2, r, w, 1);
    }
    if (noise) {
      for (let i = 0; i < 9; i++) {
        const r = Math.floor(hash(noise.seed, i) * 14) + 1;
        const w = r < 8 ? 4 * r + 4 : 4 * (15 - r) + 4;
        const x = (32 - w) / 2 + Math.floor(hash(noise.seed, i + 50) * (w - 2));
        c.fillStyle = noise.d[Math.floor(hash(noise.seed, i + 99) * (i % 4 === 0 ? 3 : 2))];
        c.fillRect(x, r, 1, 1);
        if (i % 3 === 0) c.fillRect(x + 1, r, 1, 1);
      }
    }
  }
  private makeTile(s: number, v: number) {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 16;
    const c = cv.getContext('2d')!;
    const g = GROUND[s];
    this.diamond(c, v % 2 ? g.a : g.b, { d: g.d, seed: s * 31 + v });
    return cv;
  }
  private makeRoad(v: number) {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 16;
    const c = cv.getContext('2d')!;
    this.diamond(c, v ? '#565c68' : '#4f5561', { d: ['#6a707c', '#434853', '#5e6470'], seed: 900 + v });
    return cv;
  }

  resize(S: number) {
    this.S = S;
    const w = window.innerWidth, h = window.innerHeight;
    this.Wl = Math.ceil(w / S); this.Hl = Math.ceil(h / S);
    this.world.width = this.Wl; this.world.height = this.Hl;
    this.world.style.width = this.Wl * S + 'px'; this.world.style.height = this.Hl * S + 'px';
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = w; this.cssH = h;
    this.over.width = Math.round(w * this.dpr); this.over.height = Math.round(h * this.dpr);
    this.over.style.width = w + 'px'; this.over.style.height = h + 'px';
  }

  // ───────── 좌표 변환 ─────────
  /** 타일좌표(실수) → CSS 픽셀 */
  toScreen(x: number, y: number, z = 0): [number, number] {
    const [wx, wy] = px(x, y, z);
    return [(wx + this.ox) * this.S, (wy + this.oy) * this.S];
  }
  /** CSS 픽셀 → 타일좌표(실수) */
  toTile(sx: number, sy: number): P {
    const wx = sx / this.S - this.ox, wy = sy / this.S - this.oy;
    return { x: (wy / 8 + wx / 16) / 2, y: (wy / 8 - wx / 16) / 2 };
  }

  // ───────── 메인 그리기 ─────────
  draw(g: Game, v: View, dt: number) {
    this.time += dt;
    const c = this.c;
    this.ox = Math.round(this.Wl / 2 - v.camX);
    this.oy = Math.round(this.Hl / 2 - v.camY);
    const tsec = this.time;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#1b2631'; c.fillRect(0, 0, this.Wl, this.Hl);
    const season = g.season;
    const nA = nightAlpha(g.dayFrac * 24);

    // 지면
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const sx = (i - j) * 16 - 16 + this.ox, sy = (i + j) * 8 + this.oy;
      if (sx < -32 || sy < -16 || sx > this.Wl || sy > this.Hl) continue;
      if (j === N - 1) c.drawImage(this.road[(i + j) % 2], sx, sy);
      else c.drawImage(this.tiles[season][(i * 7 + j * 13 + ((i * j) % 5)) % 8], sx, sy);
    }
    c.save(); c.translate(this.ox, this.oy);
    this.drawSlab(c);
    // 도로 차선
    c.fillStyle = '#e8d058';
    for (let i = 0; i < N; i++) { const [a, b] = px(i + 0.3, N - 0.5); c.fillRect(a - 1, b, 3, 1); const [a2, b2] = px(i + 0.65, N - 0.5); c.fillRect(a2 - 1, b2, 2, 1); }
    // 지면 데칼 (예초/제설/낙엽/쓰레기)
    for (const ev of g.events) this.drawDecal(c, ev, season);
    for (const l of g.litter) { const [a, b] = px(l.x, l.y); c.fillStyle = ['#f0f0f0', '#d85a4a', '#6ab0e0', '#c9b25a'][l.k]; c.fillRect(Math.round(a) - 1, Math.round(b) - 1, 2, 2); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(Math.round(a), Math.round(b) + 1, 2, 1); }
    // 선택 표시(바닥)
    this.drawSelectionGround(c, g, v);

    // 건물 + 인물 painter
    const items = g.buildings.slice().sort((a, b) => (a.x + a.y + a.w + a.h) - (b.x + b.y + b.h + b.w) || a.x - b.x);
    const gates = [{ x: 2.55, y: N - 0.85 }, { x: 5.2, y: N - 0.85 }];
    const slots: (Resident | Staff)[][] = items.map(() => []);
    const pre: (Resident | Staff)[] = [];
    const people: (Resident | Staff)[] = [...g.residents, ...g.staff.filter(s => !s.carried)];
    for (const p of people) {
      let idx = -1;
      for (let i = 0; i < items.length; i++) { const B = items[i]; if (p.x >= B.x + B.w || p.y >= B.y + B.h) idx = i; }
      (idx < 0 ? pre : slots[idx]).push(p);
    }
    const drawPeople = (arr: (Resident | Staff)[]) => { arr.sort((a, b) => (a.x + a.y) - (b.x + b.y)); for (const p of arr) this.drawPerson(c, p, g, v, tsec); };
    drawPeople(pre);
    this.drawGate(c, gates);
    items.forEach((b, i) => { this.drawBuilding(c, b, g, season, nA, tsec, 1); drawPeople(slots[i]); });

    // 고스트
    this.drawGhost(c, g, v, season, nA, tsec);
    c.restore();

    // 밤 색조
    if (nA > 0) { c.fillStyle = `rgba(14,24,72,${nA})`; c.fillRect(0, 0, this.Wl, this.Hl); }
    // 날씨 파티클
    this.drawParticles(c, season, dt);

    this.drawOverlay(g, v);
  }

  private drawSlab(c: Ctx) {
    const a = px(0, N), b = px(N, N), d = px(N, 0);
    poly(c, [a, b, [b[0], b[1] + 10], [a[0], a[1] + 10]], '#6b4f35');
    poly(c, [b, d, [d[0], d[1] + 10], [b[0], b[1] + 10]], '#54402b');
    c.fillStyle = '#3d2f20';
    c.fillRect(a[0], a[1] + 9, b[0] - a[0], 1);
  }

  private drawDecal(c: Ctx, ev: GEvent, season: number) {
    const [a, b] = px(ev.x + 0.5, ev.y + 0.5);
    const cx = Math.round(a), cy = Math.round(b);
    if (ev.key === 'mowing') {
      for (let i = 0; i < 9; i++) { const dx = Math.round((hash(ev.id, i) - 0.5) * 18), dy = Math.round((hash(ev.id, i + 20) - 0.5) * 8); c.fillStyle = i % 2 ? '#2f7a2f' : '#4a9a3a'; c.fillRect(cx + dx, cy + dy - 3, 1, 4); c.fillRect(cx + dx + 1, cy + dy - 2, 1, 3); }
    } else if (ev.key === 'snow') {
      poly(c, [[cx - 12, cy], [cx, cy - 6], [cx + 12, cy], [cx, cy + 6]], '#f4f9ff');
      poly(c, [[cx - 7, cy], [cx, cy - 3], [cx + 7, cy], [cx, cy + 3]], '#bfe0f5');
    } else if (ev.key === 'leaves') {
      for (let i = 0; i < 12; i++) { const dx = Math.round((hash(ev.id, i) - 0.5) * 20), dy = Math.round((hash(ev.id, i + 30) - 0.5) * 9); c.fillStyle = ['#c9702a', '#a8481c', '#d8a030'][i % 3]; c.fillRect(cx + dx, cy + dy, 2, 2); }
    } else if (ev.key === 'pest') {
      for (let i = 0; i < 6; i++) { const dx = Math.round(Math.sin(this.time * 3 + i * 2) * 8), dy = Math.round(Math.cos(this.time * 2.3 + i) * 4) - 4; c.fillStyle = '#222'; c.fillRect(cx + dx, cy + dy, 1, 1); }
    }
  }

  private drawSelectionGround(c: Ctx, g: Game, v: View) {
    const sel = v.selected;
    if (!sel) return;
    if (sel.kind === 'building') {
      const b = g.bById(sel.id); if (!b) return;
      c.strokeStyle = '#fff6a0'; c.lineWidth = 1; c.beginPath();
      const pts = [px(b.x, b.y), px(b.x + b.w, b.y), px(b.x + b.w, b.y + b.h), px(b.x, b.y + b.h)];
      c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]); c.closePath(); c.stroke();
    } else if (sel.kind === 'staff') {
      const s = g.staff.find(x => x.id === sel.id); if (!s) return;
      if (s.post) {
        c.strokeStyle = 'rgba(255,230,90,.85)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath();
        for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; const [x, y] = px(s.post.x + Math.cos(a) * POST_R, s.post.y + Math.sin(a) * POST_R); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.stroke(); c.setLineDash([]);
        const [fx, fy] = px(s.post.x, s.post.y);
        c.fillStyle = '#6a4a2a'; c.fillRect(Math.round(fx), Math.round(fy) - 12, 1, 12);
        c.fillStyle = '#ff5a4a'; c.fillRect(Math.round(fx) + 1, Math.round(fy) - 12, 6, 4);
      }
    }
  }

  private drawGate(c: Ctx, gates: { x: number; y: number }[]) {
    for (const gt of gates) box(c, gt.x, gt.y, 0.3, 0.3, 0, 20, '#e9e3d0', '#cfc7ae', '#b4ab92');
    const [a, b] = px(gates[0].x + 0.15, gates[0].y + 0.15, 20), [d, e] = px(gates[1].x + 0.15, gates[1].y + 0.15, 20);
    c.strokeStyle = '#3a6f9a'; c.lineWidth = 3; c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke();
    c.strokeStyle = '#f0e8c8'; c.lineWidth = 1; c.beginPath(); c.moveTo(a, b - 1); c.lineTo(d, e - 1); c.stroke();
  }

  // ───────── 건물 ─────────
  drawBuilding(c: Ctx, b: Building, g: Game, season: number, nA: number, t: number, alpha: number) {
    if (alpha < 1) c.globalAlpha = alpha;
    switch (b.type) {
      case 'apt': this.drawApt(c, b, nA, t); break;
      case 'office': this.drawOffice(c, b, nA); break;
      case 'guard': this.drawGuard(c, b, nA); break;
      case 'parking': this.drawParking(c, b, g); break;
      case 'playground': this.drawPlayground(c, b); break;
      case 'recycle': this.drawRecycle(c, b, g); break;
      case 'garden': this.drawGarden(c, b, season); break;
      case 'tree': this.drawTree(c, b, season); break;
    }
    c.globalAlpha = 1;
  }
  private windows(c: Ctx, ox: number, oy: number, slope: number, width: number, floors: number, fh: number, lit: boolean, seed: number, glass: string) {
    face(c, ox, oy, slope, () => {
      const cols = Math.max(1, Math.floor((width - 4) / 9));
      const cw = (width - 4) / cols;
      for (let f = 0; f < floors; f++) {
        for (let k = 0; k < cols; k++) {
          const on = lit && hash(seed, f * 17 + k) > 0.45;
          c.fillStyle = on ? '#ffe6a0' : glass;
          c.fillRect(Math.round(2 + k * cw + 1.5), -(f + 1) * fh + 2, 4, fh - 4);
        }
        c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, -f * fh - 1, width, 1);
      }
    });
  }
  private drawApt(c: Ctx, b: Building, nA: number, t: number) {
    const floors = APT_FLOORS[b.level], fh = 7, H = floors * fh;
    const col = APT_COL[b.tint % 4];
    const worn = b.hp < 40;
    const wall = worn ? shade(col.wall, 0.88) : col.wall;
    box(c, b.x, b.y, b.w, b.h, 0, H, shade(col.wall, 1.08), shade(wall, 0.92), shade(wall, 0.72));
    const lit = nA > 0.12;
    const gl = '#6f97bd';
    const [lx, ly] = px(b.x, b.y + b.h, 0);
    const [rx, ry] = px(b.x + b.w, b.y + b.h, 0);
    this.windows(c, lx, ly, 0.5, b.w * 16, floors, fh, lit, b.id, gl);
    this.windows(c, rx, ry, -0.5, b.h * 16, floors, fh, lit, b.id + 7, gl);
    // 상단 컬러 띠
    face(c, lx, ly - H, 0.5, () => { c.fillStyle = col.accent; c.fillRect(0, 0, b.w * 16, 4); });
    face(c, rx, ry - H, -0.5, () => { c.fillStyle = shade(col.accent, 0.78); c.fillRect(0, 0, b.h * 16, 4); c.fillStyle = 'rgba(255,255,255,.85)'; c.font = 'bold 8px monospace'; c.fillText(String(b.num), b.h * 16 - 22, 12); });
    // 1층 로비 캐노피
    face(c, lx, ly, 0.5, () => { c.fillStyle = '#5a4a3a'; c.fillRect(b.w * 8 - 5, -9, 10, 9); c.fillStyle = '#c9e0f0'; c.fillRect(b.w * 8 - 4, -8, 8, 7); c.fillStyle = col.accent; c.fillRect(b.w * 8 - 6, -11, 12, 2); });
    // 옥상 기계실
    box(c, b.x + b.w / 2 - 0.5, b.y + b.h / 2 - 0.3, 1, 0.6, H, 6, '#c9c4b4', '#a8a393', '#8b8677');
    // 고장 경고등
    if (b.broken || b.frozen) {
      const [tx, ty] = px(b.x + b.w / 2, b.y + b.h / 2, H + 8);
      c.fillStyle = Math.floor(t * 4) % 2 ? '#ff3b30' : '#7a1d18'; c.fillRect(Math.round(tx) - 1, Math.round(ty) - 2, 3, 3);
    }
  }
  private drawOffice(c: Ctx, b: Building, nA: number) {
    const H = b.level === 2 ? 26 : 20;
    box(c, b.x, b.y, b.w, b.h, 0, H, '#7aa6c0', '#efe6cf', '#cfc4a6');
    box(c, b.x - 0.1, b.y - 0.1, b.w + 0.2, b.h + 0.2, H, 3, '#4f7f9a', '#3f6a82', '#35596e');
    const [lx, ly] = px(b.x, b.y + b.h, 0), [rx, ry] = px(b.x + b.w, b.y + b.h, 0);
    const lit = nA > 0.12;
    this.windows(c, lx, ly, 0.5, b.w * 16, b.level === 2 ? 3 : 2, 9, lit, 5, '#8fb4d0');
    this.windows(c, rx, ry, -0.5, b.h * 16, b.level === 2 ? 3 : 2, 9, lit, 6, '#8fb4d0');
    face(c, lx, ly, 0.5, () => { c.fillStyle = '#6b4a2b'; c.fillRect(b.w * 8 - 4, -10, 8, 10); c.fillStyle = '#3a6f9a'; c.fillRect(2, -H + 4, 22, 5); c.fillStyle = '#fff'; c.fillRect(4, -H + 6, 4, 1); c.fillRect(10, -H + 6, 4, 1); c.fillRect(16, -H + 6, 4, 1); });
    // 깃발
    const [fx, fy] = px(b.x + 0.2, b.y + 0.2, H + 3);
    c.fillStyle = '#ddd'; c.fillRect(Math.round(fx), Math.round(fy) - 14, 1, 14);
    c.fillStyle = '#e0443a'; c.fillRect(Math.round(fx) + 1, Math.round(fy) - 14, 6, 4);
    c.fillStyle = '#3a6fc0'; c.fillRect(Math.round(fx) + 1, Math.round(fy) - 10, 6, 2);
  }
  private drawGuard(c: Ctx, b: Building, nA: number) {
    box(c, b.x + 0.12, b.y + 0.12, 0.76, 0.76, 0, 12, '#d9d2b8', '#cfc8ac', '#b3ab90');
    box(c, b.x, b.y, 1, 1, 12, 2, '#2e5ea8', '#244a86', '#1c3a6a');
    const [lx, ly] = px(b.x + 0.12, b.y + 0.88, 0);
    face(c, lx, ly, 0.5, () => { c.fillStyle = nA > 0.12 ? '#ffe6a0' : '#9ec4e0'; c.fillRect(3, -9, 8, 5); });
  }
  private drawParking(c: Ctx, b: Building, g: Game) {
    const slots = PARK_SLOTS[b.level], cols = 4, rows = slots / cols;
    poly(c, [px(b.x, b.y, 0.5), px(b.x + b.w, b.y, 0.5), px(b.x + b.w, b.y + b.h, 0.5), px(b.x, b.y + b.h, 0.5)], '#4f5561', '#3a3f48');
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; c.beginPath();
    for (let k = 1; k < cols; k++) { const a = px(b.x + (b.w / cols) * k, b.y, 0.5), d = px(b.x + (b.w / cols) * k, b.y + b.h, 0.5); c.moveTo(a[0], a[1]); c.lineTo(d[0], d[1]); }
    c.stroke();
    const S = g.scores; const nCars = S && S.parkCap ? Math.min(slots, Math.round(slots * Math.min(1, S.demand / S.parkCap))) : 0;
    const cw = b.w / cols, rh = b.h / rows;
    const sorted: number[] = []; for (let k = 0; k < slots; k++) sorted.push(k);
    sorted.sort((p, q) => ((p % cols) / 1 + Math.floor(p / cols) * 0.1) - ((q % cols) + Math.floor(q / cols) * 0.1));
    sorted.sort((p, q) => (Math.floor(p / cols) + (p % cols)) - (Math.floor(q / cols) + (q % cols)));
    for (const k of sorted) {
      if (k >= nCars) continue;
      const col = k % cols, row = Math.floor(k / cols);
      const cx = b.x + (col + 0.5) * cw, cy = b.y + (row + 0.5) * rh;
      const colr = CAR[(b.id + k * 3) % CAR.length];
      const lw = cw * 0.64, ld = rh * 0.74;
      box(c, cx - lw / 2, cy - ld / 2, lw, ld, 0.5, 3, shade(colr, 1.1), shade(colr, 0.9), shade(colr, 0.7));
      box(c, cx - lw / 2 + 0.03, cy - ld / 2 + ld * 0.22, lw - 0.06, ld * 0.5, 3.5, 2, '#9cc4de', '#7fa8c4', '#6a92ae');
    }
    if (b.level === 2) {
      for (const [dx, dy] of [[0.05, 0.05], [b.w - 0.1, 0.05], [0.05, b.h - 0.1], [b.w - 0.1, b.h - 0.1]]) box(c, b.x + dx, b.y + dy, 0.06, 0.06, 0, 15, '#aab', '#99a', '#889');
      c.globalAlpha = 0.6;
      poly(c, [px(b.x, b.y, 16), px(b.x + b.w, b.y, 16), px(b.x + b.w, b.y + b.h, 16), px(b.x, b.y + b.h, 16)], '#7fa0c0', '#4a6a8a');
      c.globalAlpha = 1;
    }
  }
  private drawPlayground(c: Ctx, b: Building) {
    poly(c, [px(b.x, b.y, 0.5), px(b.x + b.w, b.y, 0.5), px(b.x + b.w, b.y + b.h, 0.5), px(b.x, b.y + b.h, 0.5)], '#e7d6a0', '#b59a5a');
    // 미끄럼틀
    box(c, b.x + 0.25, b.y + 0.2, 0.4, 0.4, 0.5, 10, '#f2c94c', '#d8b038', '#b8921f');
    poly(c, [px(b.x + 0.3, b.y + 0.6, 10), px(b.x + 0.6, b.y + 0.6, 10), px(b.x + 0.6, b.y + 1.5, 1), px(b.x + 0.3, b.y + 1.5, 1)], '#e0524a', '#a83a34');
    // 그네
    const s0 = [b.x + 1.1, b.y + 0.4], s1 = [b.x + 1.1, b.y + 1.6], s2 = [b.x + 1.8, b.y + 0.4], s3 = [b.x + 1.8, b.y + 1.6];
    c.strokeStyle = '#4a86c8'; c.lineWidth = 1; c.beginPath();
    for (const s of [s0, s1, s2, s3]) { const a = px(s[0], s[1], 0.5), d = px(s[0], s[1], 13); c.moveTo(a[0], a[1]); c.lineTo(d[0], d[1]); }
    const t0 = px(s0[0], s0[1], 13), t1 = px(s1[0], s1[1], 13), t2 = px(s2[0], s2[1], 13), t3 = px(s3[0], s3[1], 13);
    c.moveTo(t0[0], t0[1]); c.lineTo(t1[0], t1[1]); c.moveTo(t2[0], t2[1]); c.lineTo(t3[0], t3[1]);
    c.stroke();
    const sw = Math.sin(this.time * 2.2) * 2;
    for (const f of [0.35, 0.7]) { const m = px(b.x + 1.1, b.y + 0.4 + 1.2 * f, 13); c.fillStyle = '#c0c0c0'; c.fillRect(Math.round(m[0]), Math.round(m[1]), 1, 7); c.fillStyle = '#e0524a'; c.fillRect(Math.round(m[0]) - 1 + Math.round(sw * 0.5), Math.round(m[1]) + 7, 3, 2); }
    if (b.level === 2) {
      const d = px(b.x + 1.6, b.y + 1.2, 0.5);
      c.fillStyle = '#e0524a'; c.beginPath(); c.arc(d[0] + 3, d[1] - 4, 7, Math.PI, 0); c.fill();
      c.fillStyle = '#f2c94c'; c.beginPath(); c.arc(d[0] + 3, d[1] - 4, 4, Math.PI, 0); c.fill();
    }
  }
  private drawRecycle(c: Ctx, b: Building, g: Game) {
    poly(c, [px(b.x, b.y, 0.5), px(b.x + b.w, b.y, 0.5), px(b.x + b.w, b.y + b.h, 0.5), px(b.x, b.y + b.h, 0.5)], '#9aa0a8', '#6c727a');
    const n = b.level === 2 ? 4 : 3, bw = b.w / n; const cols = ['#3d78c8', '#e0b030', '#3d9a55', '#d8503f'];
    for (let k = 0; k < n; k++) box(c, b.x + k * bw + 0.05, b.y + 0.2, bw - 0.1, 0.6, 0.5, 9, shade(cols[k], 1.15), shade(cols[k], 0.95), shade(cols[k], 0.72));
    for (const [dx, dy] of [[0.05, 0.05], [b.w - 0.1, 0.05], [0.05, b.h - 0.1], [b.w - 0.1, b.h - 0.1]]) box(c, b.x + dx, b.y + dy, 0.06, 0.06, 0, 15, '#8a96a2', '#7a8692', '#6a7682');
    box(c, b.x - 0.05, b.y - 0.05, b.w + 0.1, b.h + 0.1, 15, 2, '#3a9a90', '#2f7f78', '#276a64');
    if (g.events.some(e => e.key === 'trash' && e.bid === b.id)) {
      for (let k = 0; k < 6; k++) { const p = px(b.x + 0.2 + k * (b.w - 0.4) / 6, b.y + b.h + 0.15 + (k % 2) * 0.12, 0.5); c.fillStyle = k % 2 ? '#f0f0f0' : '#38404a'; c.fillRect(Math.round(p[0]) - 2, Math.round(p[1]) - 4, 4, 4); }
    }
  }
  private drawGarden(c: Ctx, b: Building, season: number) {
    box(c, b.x + 0.1, b.y + 0.1, 0.8, 0.8, 0, 3, '#6b4a2b', '#7a5530', '#5a3c22');
    const fl = [['#f08ab8', '#f0e060', '#fff'], ['#e8403a', '#f08030', '#fff'], ['#e0802a', '#a050c0', '#f0d040'], ['#d0dae0', '#a8b8c4', '#fff']][season];
    for (let k = 0; k < 8; k++) {
      const x = b.x + 0.2 + hash(b.id, k) * 0.6, y = b.y + 0.2 + hash(b.id, k + 9) * 0.6; const p = px(x, y, 3);
      c.fillStyle = season === 3 ? '#8a7a5a' : '#3f9a45'; c.fillRect(Math.round(p[0]), Math.round(p[1]) - 3, 1, 3);
      c.fillStyle = fl[k % 3]; c.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - 5, 3, 2);
    }
  }
  private drawTree(c: Ctx, b: Building, season: number) {
    box(c, b.x + 0.4, b.y + 0.4, 0.2, 0.2, 0, 10, '#8a6a42', '#7a5a35', '#5f4527');
    const p = px(b.x + 0.5, b.y + 0.5, 18);
    const base = ['#69b957', '#3f9a45', '#d8872f', '#e8f0f4'][season];
    const cx = Math.round(p[0]), cy = Math.round(p[1]);
    const blob = (dx: number, dy: number, r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(cx + dx, cy + dy, r, 0, 7); c.fill(); };
    blob(0, 2, 9, shade(base, 0.78)); blob(-3, 0, 7, base); blob(3, -1, 7, shade(base, 1.08)); blob(0, -4, 5, shade(base, 1.15));
    if (season === 0) { c.fillStyle = '#f8c0d8'; for (let k = 0; k < 6; k++) c.fillRect(cx + Math.round((hash(b.id, k) - 0.5) * 14), cy + Math.round((hash(b.id, k + 5) - 0.5) * 12), 2, 2); }
    if (season === 3) { c.fillStyle = '#7a6a58'; c.fillRect(cx - 1, cy + 2, 2, 8); c.fillRect(cx - 5, cy - 2, 1, 5); c.fillRect(cx + 4, cy - 3, 1, 5); }
  }

  // ───────── 사람 ─────────
  private drawPerson(c: Ctx, p: Resident | Staff, g: Game, v: View, t: number) {
    const [a, b] = px(p.x, p.y);
    const x = Math.round(a), y = Math.round(b);
    const isStaff = 'role' in p;
    const walking = isStaff ? (p as Staff).state === 'walk' : p.path.length > 0;
    const working = isStaff && (p as Staff).state === 'work';
    const step = walking ? Math.floor(p.anim) % 2 : 0;
    const bob = walking ? (Math.floor(p.anim * 2) % 2) : (working ? Math.floor(t * 6) % 2 : 0);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x - 3, y - 1, 7, 2);
    let shirt = '#888', hair = '#222', pants = '#3a4050', skin = '#f0c8a0', kid = false, elder = false;
    if (isStaff) {
      const s = p as Staff;
      shirt = ROLES[s.role].color; pants = '#2a2f3a'; hair = '#1a1a1a';
    } else {
      const r = p as Resident;
      shirt = SHIRT[r.look % SHIRT.length]; hair = HAIR[(r.look + 2) % HAIR.length];
      pants = ['#3a4560', '#4a4a4a', '#6a5a3a'][r.look % 3];
      kid = r.kind === 'kid'; elder = r.kind === 'elder';
      if (elder) hair = '#d8d8d8';
    }
    const hgt = kid ? 0 : 2;
    // 다리
    c.fillStyle = pants;
    c.fillRect(x - 2, y - 3 - bob, 2, 3 - (step ? 1 : 0));
    c.fillRect(x, y - 3 - bob, 2, 3 - (step ? 0 : 1));
    // 몸통
    const bodyTop = y - 8 + (kid ? 3 : 0) - bob;
    c.fillStyle = shirt; c.fillRect(x - 2, bodyTop, 4, kid ? 2 : 5);
    c.fillStyle = shade(shirt, 0.75); c.fillRect(x - 3, bodyTop, 1, kid ? 2 : 3); c.fillRect(x + 2, bodyTop, 1, kid ? 2 : 3);
    // 머리
    const headY = bodyTop - 4;
    c.fillStyle = skin; c.fillRect(x - 2, headY, 4, 4);
    c.fillStyle = hair; c.fillRect(x - 2, headY - 1 + (elder ? 1 : 0), 4, 2);
    if (!isStaff && (p as Resident).kind === 'mom') { c.fillRect(x - 2 + (p.dir > 0 ? 0 : 3), headY, 1, 5); }
    c.fillStyle = '#222'; c.fillRect(x + (p.dir > 0 ? 0 : -1), headY + 2, 1, 1);
    if (isStaff) {
      const s = p as Staff;
      if (s.role === 'tech') { c.fillStyle = '#f2c84b'; c.fillRect(x - 2, headY - 2, 4, 2); c.fillRect(x + (p.dir > 0 ? 1 : -3), headY - 1, 2, 1); c.fillStyle = '#fff3'; }
      if (s.role === 'guard') { c.fillStyle = '#16304a'; c.fillRect(x - 2, headY - 2, 4, 2); c.fillRect(x + (p.dir > 0 ? 1 : -3), headY - 1, 2, 1); c.fillStyle = '#f2d84b'; c.fillRect(x, bodyTop + 1, 1, 1); }
      if (s.role === 'manager') { c.fillStyle = '#fff'; c.fillRect(x, bodyTop, 1, 3); c.fillStyle = '#d83a3a'; c.fillRect(x, bodyTop + 1, 1, 2); }
      if (s.role === 'cleaner') {
        c.fillStyle = '#e8e0c0'; c.fillRect(x - 2, headY - 1, 4, 1);
        const sw = working ? Math.round(Math.sin(t * 12) * 2) : 0;
        c.fillStyle = '#8a6a3a'; c.fillRect(x + (p.dir > 0 ? 3 : -4) + sw, bodyTop - 2, 1, 12);
        c.fillStyle = '#d8b84a'; c.fillRect(x + (p.dir > 0 ? 2 : -5) + sw, y - 1, 3, 1);
      }
      if (s.role === 'tech' && working) { c.fillStyle = '#ddd'; c.fillRect(x + (p.dir > 0 ? 3 : -4), bodyTop + 2, 2, 1); if (Math.floor(t * 8) % 2) { c.fillStyle = '#ffd84a'; c.fillRect(x + (p.dir > 0 ? 5 : -6), bodyTop + 1, 1, 1); } }
    }
    if (elder) { c.fillStyle = '#7a5a30'; c.fillRect(x + (p.dir > 0 ? 3 : -4), bodyTop + 2, 1, 6); }
    void hgt; void g; void v;
  }

  // ───────── 고스트/파티클 ─────────
  private drawGhost(c: Ctx, g: Game, v: View, season: number, nA: number, t: number) {
    if (v.moveB && v.hover) {
      const b = v.moveB; const w = v.rot ? b.h : b.w, h = v.rot ? b.w : b.h; const hx = v.hover.x, hy = v.hover.y;
      poly(c, [px(b.x, b.y), px(b.x + b.w, b.y), px(b.x + b.w, b.y + b.h), px(b.x, b.y + b.h)], 'rgba(255,230,90,.35)', '#ffe45a');
      if (hx >= 0 && hy >= 0 && hx + w <= N && hy + h <= N) this.drawBuilding(c, { ...b, x: hx, y: hy, w, h }, g, season, nA, t, 0.7);
      poly(c, [px(hx, hy), px(hx + w, hy), px(hx + w, hy + h), px(hx, hy + h)], v.ghostOk ? 'rgba(80,255,120,.35)' : 'rgba(255,70,60,.4)', v.ghostOk ? '#7dff9a' : '#ff6a5a');
      return;
    }
    if (v.tool && v.tool !== 'demolish' && v.hover) {
      const d = BDEFS[v.tool]; const w = v.rot ? d.h : d.w, h = v.rot ? d.w : d.h;
      const hx = v.hover.x, hy = v.hover.y;
      const ok = v.ghostOk;
      const fake: Building = { id: -1, type: v.tool, x: hx, y: hy, w, h, level: 1, hp: 100, num: 100 + g.count('apt') + 1, occ: 0, broken: false, frozen: false, tint: g.buildings.length % 4, fixer: 0 };
      if (hx >= 0 && hy >= 0 && hx + w <= N && hy + h <= N) this.drawBuilding(c, fake, g, season, nA, t, 0.7);
      poly(c, [px(hx, hy), px(hx + w, hy), px(hx + w, hy + h), px(hx, hy + h)], ok ? 'rgba(80,255,120,.35)' : 'rgba(255,70,60,.4)', ok ? '#7dff9a' : '#ff6a5a');
    } else if (v.hover) {
      const hx = v.hover.x, hy = v.hover.y;
      if (hx >= 0 && hy >= 0 && hx < N && hy < N) {
        const b = g.buildings.find(bb => hx >= bb.x && hx < bb.x + bb.w && hy >= bb.y && hy < bb.y + bb.h);
        const col = v.tool === 'demolish' ? 'rgba(255,70,60,.45)' : 'rgba(255,255,255,.22)';
        if (b) poly(c, [px(b.x, b.y), px(b.x + b.w, b.y), px(b.x + b.w, b.y + b.h), px(b.x, b.y + b.h)], col);
        else poly(c, [px(hx, hy), px(hx + 1, hy), px(hx + 1, hy + 1), px(hx, hy + 1)], col);
      }
    }
    if (v.carrying && v.hover) {
      const hx = v.hover.x, hy = v.hover.y;
      if (hx >= 0 && hy >= 0 && hx < N && hy < N) poly(c, [px(hx, hy), px(hx + 1, hy), px(hx + 1, hy + 1), px(hx, hy + 1)], 'rgba(255,230,90,.45)', '#ffe45a');
    }
  }
  private drawParticles(c: Ctx, season: number, dt: number) {
    const want = season === 3 ? 70 : season === 2 ? 22 : season === 0 ? 18 : 0;
    while (this.parts.length < want) {
      const col = season === 3 ? '#ffffff' : season === 2 ? ['#d8872f', '#c0541c', '#e0b040'][Math.floor(Math.random() * 3)] : '#f8b8d0';
      this.parts.push({ x: Math.random() * this.Wl, y: Math.random() * this.Hl, vx: (Math.random() - 0.3) * 8 + (season === 3 ? 0 : 6), vy: 8 + Math.random() * 14, c: col, s: season === 3 ? 1 : 2 });
    }
    if (this.parts.length > want) this.parts.length = want;
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > this.Hl) { p.y = -2; p.x = Math.random() * this.Wl; }
      if (p.x > this.Wl) p.x = 0;
      c.fillStyle = p.c; c.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
  }

  // ───────── 오버레이(말풍선/마커) ─────────
  private bubble(o: Ctx, x: number, y: number, text: string, neg: boolean, alpha: number) {
    o.font = '600 12px "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
    const w = Math.ceil(o.measureText(text).width) + 14, h = 20;
    let bx = Math.round(x - w / 2), by = Math.round(y - h - 7);
    bx = Math.max(4, Math.min(this.cssW - w - 4, bx));
    o.globalAlpha = alpha;
    o.fillStyle = '#1a1a1a'; o.fillRect(bx - 1, by - 1, w + 2, h + 2);
    o.fillStyle = neg ? '#ffe0dc' : '#ffffff'; o.fillRect(bx, by, w, h);
    o.fillStyle = '#1a1a1a'; o.beginPath(); o.moveTo(x - 4, by + h + 1); o.lineTo(x + 4, by + h + 1); o.lineTo(x, by + h + 7); o.fill();
    o.fillStyle = neg ? '#ffe0dc' : '#ffffff'; o.beginPath(); o.moveTo(x - 3, by + h); o.lineTo(x + 3, by + h); o.lineTo(x, by + h + 5); o.fill();
    o.fillStyle = neg ? '#b32a1c' : '#1d2b3a'; o.textBaseline = 'middle'; o.textAlign = 'left';
    o.fillText(text, bx + 7, by + h / 2 + 1);
    o.globalAlpha = 1;
  }
  private drawOverlay(g: Game, v: View) {
    const o = this.o; o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    o.clearRect(0, 0, this.cssW, this.cssH);
    const S = this.S; this.markers = [];
    const head = (e: { x: number; y: number }, off: number): [number, number] => { const [sx, sy] = this.toScreen(e.x, e.y); return [sx, sy - off * S]; };
    // 선택 이름표
    const sel = v.selected;
    // 말풍선
    for (const r of g.residents) {
      if (r.bubbleT <= 0 || !r.bubble) continue;
      const [sx, sy] = head(r, (r.kind === 'kid' ? 12 : 14));
      if (sx < -50 || sx > this.cssW + 50 || sy < -30 || sy > this.cssH + 30) continue;
      this.bubble(o, sx, sy, r.bubble, r.bubbleNeg, Math.min(1, r.bubbleT / 0.6));
    }
    // 직원 아이콘 + 진행바
    for (const s of g.staff) {
      if (s.carried) continue;
      const [sx, sy] = head(s, 15);
      o.font = '13px sans-serif'; o.textAlign = 'center'; o.textBaseline = 'middle';
      o.fillStyle = 'rgba(0,0,0,.55)'; o.beginPath(); o.arc(sx, sy - 7, 9, 0, 7); o.fill();
      o.fillStyle = '#fff'; o.fillText(ROLES[s.role].icon, sx, sy - 6);
      if (s.state === 'work' && s.workNeed > 0) { const f = Math.min(1, s.workT / s.workNeed); o.fillStyle = '#000'; o.fillRect(sx - 12, sy + 4, 24, 5); o.fillStyle = '#6fe08a'; o.fillRect(sx - 11, sy + 5, 22 * f, 3); }
      if (sel && sel.kind === 'staff' && sel.id === s.id) { o.strokeStyle = '#ffe45a'; o.lineWidth = 2; o.beginPath(); o.arc(sx, sy - 7, 12, 0, 7); o.stroke(); }
    }
    if (sel && sel.kind === 'resident') { const r = g.residents.find(x => x.id === sel.id); if (r) { const [sx, sy] = head(r, 17); o.fillStyle = '#ffe45a'; o.beginPath(); o.moveTo(sx - 6, sy - 10); o.lineTo(sx + 6, sy - 10); o.lineTo(sx, sy - 2); o.fill(); o.strokeStyle = '#000'; o.lineWidth = 1; o.stroke(); } }
    // 민원 마커
    for (const ev of g.events) {
      const def = EV[ev.key]; const b = g.bById(ev.bid);
      let sx: number, sy: number;
      if (b) { [sx, sy] = this.toScreen(b.x + b.w / 2, b.y + b.h / 2, b.type === 'apt' ? APT_FLOORS[b.level] * 7 + 16 : 30); }
      else { [sx, sy] = this.toScreen(ev.x + 0.5, ev.y + 0.5, 14); }
      const bob = Math.sin(this.time * 4 + ev.id) * 3;
      sy += bob;
      const left = ev.deadlineT - g.t, tot = def.days; const frac = Math.max(0, left / tot);
      const urgent = frac < 0.35;
      o.fillStyle = urgent ? '#d8321f' : '#e8a020'; o.beginPath(); o.arc(sx, sy, 15, 0, 7); o.fill();
      o.strokeStyle = '#fff'; o.lineWidth = 2; o.beginPath(); o.arc(sx, sy, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); o.stroke();
      o.strokeStyle = '#000'; o.lineWidth = 1; o.beginPath(); o.arc(sx, sy, 16.5, 0, 7); o.stroke();
      o.font = '15px sans-serif'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff'; o.fillText(def.icon, sx, sy + 1);
      o.font = 'bold 11px sans-serif'; o.fillStyle = '#000'; o.fillRect(sx - 13, sy + 17, 26, 14);
      o.fillStyle = urgent ? '#ff9a8a' : '#fff'; o.fillText(`${Math.max(0, left).toFixed(1)}일`, sx, sy + 24.5);
      if (ev.worker) { o.font = '11px sans-serif'; o.fillStyle = '#6fe08a'; o.fillText('🛠', sx + 16, sy - 12); }
      if (sel && sel.kind === 'event' && sel.id === ev.id) { o.strokeStyle = '#ffe45a'; o.lineWidth = 3; o.beginPath(); o.arc(sx, sy, 20, 0, 7); o.stroke(); }
      this.markers.push({ x: sx, y: sy, r: 20, evId: ev.id });
    }
    // 들고 있는 직원
    if (v.carrying) {
      const s = v.carrying; const m = v.mouse;
      o.fillStyle = 'rgba(0,0,0,.3)'; o.beginPath(); o.ellipse(m.x, m.y + 4, 12, 5, 0, 0, 7); o.fill();
      o.fillStyle = ROLES[s.role].color; o.beginPath(); o.arc(m.x, m.y - 26, 15, 0, 7); o.fill(); o.strokeStyle = '#fff'; o.lineWidth = 2; o.stroke();
      o.font = '17px sans-serif'; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff'; o.fillText(ROLES[s.role].icon, m.x, m.y - 25);
      o.font = '600 11px "Malgun Gothic",sans-serif'; o.fillStyle = '#000'; o.fillRect(m.x - 34, m.y - 50, 68, 15); o.fillStyle = '#ffe45a'; o.fillText(`${s.name} 배치`, m.x, m.y - 42);
    }
  }

  // ───────── 히트 테스트 ─────────
  hit(g: Game, sx: number, sy: number): { kind: 'resident' | 'staff' | 'building' | 'event'; id: number } | null {
    for (const m of this.markers) if (Math.hypot(sx - m.x, sy - m.y) <= m.r) return { kind: 'event', id: m.evId };
    const S = this.S; const rad = Math.max(11, 6 * S);
    let best: { kind: 'resident' | 'staff'; id: number } | null = null, bd = 1e9;
    for (const s of g.staff) { if (s.carried) continue; const [x, y] = this.toScreen(s.x, s.y); const d = Math.hypot(sx - x, sy - (y - 7 * S)); if (d < rad + 3 && d < bd) { bd = d; best = { kind: 'staff', id: s.id }; } }
    for (const r of g.residents) { const [x, y] = this.toScreen(r.x, r.y); const d = Math.hypot(sx - x, sy - (y - 6 * S)); if (d < rad && d < bd) { bd = d; best = { kind: 'resident', id: r.id }; } }
    if (best) return best;
    const t = this.toTile(sx, sy); const tx = Math.floor(t.x), ty = Math.floor(t.y);
    // 건물은 높이가 있으므로 화면상 위쪽 타일도 검사
    for (let k = 0; k < 6; k++) {
      const q = this.toTile(sx, sy + k * 8 * S); const qx = Math.floor(q.x), qy = Math.floor(q.y);
      const id = qx >= 0 && qy >= 0 && qx < N && qy < N ? g.grid[qy * N + qx] : 0;
      if (id > 0) { const b = g.bById(id); if (b && (b.type !== 'garden' || k === 0)) return { kind: 'building', id }; }
    }
    void tx; void ty;
    return null;
  }
}
