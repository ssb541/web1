/* ==========================================================================
 * game.js - 핵심 루프
 *   맵 전환 / 근무 시계(주간→야간 당직→정산) / 세대 방문 민원 / 야간 내방·전화 민원 /
 *   이동·자동이동·AUTO / 스폰 / 스킬 / 이벤트 / 보상 / 레벨업 / 전직 / 렌더
 * ========================================================================== */
(function () {
  'use strict';
  const PJ = window.PJ;
  const { RANKS, SKILLS, OBJECTS, ASSETS, MAPS, ITEMS, EVENTS, EVENT, FEVER, SPEECH, TIME, VISIT, NIGHT, NPCS, Gfx, Audio, Input } = PJ;
  const T = ASSETS.tile, VW = 30 * T, VH = 20 * T;
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  const MAX_SKILL_LV = 15, CARS = ['carRed', 'carBlue', 'carGray'], REACH = 22;
  const CX = MAPS.complex;
  let MAP = CX;

  const st = (PJ.state = {
    save: null, time: 0, paused: false,
    player: { x: 0, y: 0, dir: 'down', step: 0, stepT: 0, moving: false, atk: 0, atkDir: 0 },
    objs: [], parts: [], floats: [], rings: [], slashes: [], spins: [], sched: [], orbs: [], bubbles: [], marks: [],
    cd: {}, cdMax: {}, gcd: 0, spawnT: {}, shake: 0, flash: 0, flashColor: '#fff', hitstop: 0,
    combo: 0, comboT: 0, target: null, hint: null, saveT: 0, capToast: false,
    nav: null, auto: false, autoT: 0, fever: 0, event: null, evT: EVENT.first, bubbleCd: 0, pickT: 0, trailT: 0,
    // 다중 맵 / 근무 사이클
    mapId: 'complex', fade: null, pressAtMap: 0, ret: { x: 88, y: 90 },
    min: TIME.start, phase: 'day', day: 1, visits: [], visitT: VISIT.first, unitVisit: null, unitBld: null,
    night: { t: NIGHT.first, idx: 0, active: null }, npcs: [], visitor: null, ringT: 0, shift: null, settling: false,
  });
  let cv, ctx, S = 2, spots = { grass: [], paved: [], path: [], parking: [] }, reach = null;
  const layers = {}, lightCv = document.createElement('canvas');
  lightCv.width = VW; lightCv.height = VH;
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const rectPx = (r) => ({ x: r[0] * T, y: r[1] * T, w: r[2] * T, h: r[3] * T });
  const getRc = (it) => it.rc || (it.rc = rectPx(it.rect));
  function distRect(px, py, rc) {
    const dx = Math.max(rc.x - px, 0, px - (rc.x + rc.w)), dy = Math.max(rc.y - py, 0, py - (rc.y + rc.h));
    return Math.hypot(dx, dy);
  }
  const newShift = () => ({ weed: 0, snow: 0, complaint: 0, visit: 0, night: 0, nightFail: 0, gold: 0, exp: 0, nightPay: 0 });

  /* ------------------------------ 규칙 계산 -------------------------------- */
  const R = (PJ.Rules = {
    rank: () => RANKS[st.save.rank],
    needExp: (lv) => Math.round(20 * Math.pow(lv, 1.5)),
    maxSkillLv: () => Math.min(MAX_SKILL_LV, 2 + Math.floor(st.save.level / 2)),
    skillLv: (id) => st.save.skills[id] || 1,
    isUnlocked: (id) => st.save.level >= SKILLS[id].unlockLv,
    upgradeCost: (id) => Math.round(SKILLS[id].baseCost * Math.pow(1.4, R.skillLv(id) - 1)),
    item: (id) => (st.save.items && st.save.items[id]) || 0,
    speed: () => R.rank().speed * (1 + 0.05 * R.item('earmuff')) * (st.fever > 0 ? FEVER.speed : 1),
    matches: (sk, o) => (Array.isArray(sk.target) ? sk.target.includes(o.type) : sk.target === o.type),
    skillStats(id) {
      const sk = SKILLS[id], lv = R.skillLv(id), rk = R.rank();
      const weed = sk.target === 'weed' ? 1 + 0.1 * R.item('quietMower') : 1;
      return {
        lv,
        dmg: sk.dmg * (1 + 0.15 * (lv - 1)) * rk.power * (1 + 0.02 * (st.save.level - 1)) * weed,
        cd: sk.cd * Math.max(0.4, 1 - 0.03 * (lv - 1) - 0.04 * R.item('coffee')),
        radius: (sk.radius || 0) + 3 * (lv - 1) + rk.reachBonus,
        reach: (sk.reach || 0) + rk.reachBonus,
        bonus: sk.bonus ? 1 + (sk.bonus - 1) * (1 + 0.1 * (lv - 1)) : 1,
      };
    },
    objHp: (o) => (o.hp || OBJECTS[o.type].hp) * R.rank().hpMult,
    comboMult: () => 1 + Math.min(0.5, 0.05 * Math.max(0, st.combo - 1)),
    reward(o, bonus) {
      const d = o.def || OBJECTS[o.type], rk = R.rank(), lv = st.save.level, cm = R.comboMult();
      let exp = d.exp * (1 + 0.18 * (lv - 1)) * rk.expMult * bonus * cm;
      let gold = d.gold * (1 + 0.12 * (lv - 1)) * rk.goldMult * bonus * cm;
      if (o.type === 'snow') { const m = 1 + 0.1 * R.item('hotpack'); exp *= m; gold *= m; }
      if (o.type === 'complaint' || o.type === 'event') gold *= 1 + 0.1 * R.item('catSnack');
      return { exp: Math.max(1, Math.round(exp)), gold: Math.max(1, Math.round(gold)) };
    },
    itemsOwned: () => ITEMS.filter((i) => R.item(i.id) > 0).length,
    promoteInfo() {
      const next = RANKS[st.save.rank + 1];
      if (!next) return null;
      const q = next.promote, s = st.save;
      const checks = [
        { label: `레벨 ${q.lv} 달성`, now: s.level, need: q.lv },
        { label: '골드', now: s.gold, need: q.gold },
        { label: '잡초 처리', now: s.stats.weed, need: q.tasks.weed },
        { label: '눈 처리', now: s.stats.snow, need: q.tasks.snow },
        { label: '민원 처리', now: s.stats.complaint, need: q.tasks.complaint },
      ];
      if (q.bosses) checks.push({ label: '이중주차 빌런 퇴치', now: s.stats.boss, need: q.bosses });
      if (q.items) checks.push({ label: '장비 도감 수집', now: R.itemsOwned(), need: q.items });
      checks.forEach((c) => { c.ok = c.now >= c.need; });
      return { next, checks, ok: checks.every((c) => c.ok) };
    },
  });
  const toast = (m, kind) => PJ.UI && PJ.UI.toast(m, kind);
  const changed = () => PJ.UI && PJ.UI.refresh();
  const save = () => st.save && PJ.Save.write(st.save);

  /* ------------------------------- 진행 ------------------------------------ */
  function addExp(n) {
    const s = st.save, rk = R.rank();
    s.exp += n; st.shift && (st.shift.exp += n);
    let up = false;
    while (s.level < rk.maxLv && s.exp >= R.needExp(s.level)) {
      s.exp -= R.needExp(s.level); s.level++; up = true;
      Object.values(SKILLS).forEach((k) => { if (!k.hidden && k.unlockLv === s.level && s.level > 1) toast(`${k.icon} '${k.name}' 해금!`, 'good'); });
    }
    if (s.level >= rk.maxLv) {
      s.exp = Math.min(s.exp, R.needExp(s.level));
      if (!st.capToast && RANKS[s.rank + 1]) { st.capToast = true; toast('🎖️ 최고 레벨 도달! 메뉴의 전직 탭에서 조건을 확인하세요', 'good'); }
    }
    if (up) {
      const p = st.player;
      Audio.play('level'); st.flash = 0.5; st.flashColor = '#fff6a8';
      st.rings.push({ x: p.x, y: p.y - 6, r0: 4, r1: 46, life: 0.7, max: 0.7, color: '#ffd24a' });
      st.floats.push({ x: p.x, y: p.y - 26, text: `LEVEL UP! Lv.${s.level}`, color: '#ffd24a', life: 1.6, max: 1.6, size: 9 });
      burst(p.x, p.y - 8, 22, ['#ffd24a', '#fff', '#7fd3ff'], 70, 0.8, '★');
      save();
    }
  }
  function grant(rw) { st.save.gold += rw.gold; st.shift.gold += rw.gold; addExp(rw.exp); }
  function bumpCombo() { st.combo = st.comboT > 0 ? st.combo + 1 : 1; st.comboT = 3; }
  function comboFx() {
    if ([5, 10, 20, 30].includes(st.combo)) {
      st.floats.push({ x: st.player.x, y: st.player.y - 40, text: `COMBO x${st.combo}!`, color: '#ffe066', life: 1.2, max: 1.2, size: 9 });
      st.shake = Math.max(st.shake, 3); Audio.play('crit');
    }
  }
  function promote() {
    const info = R.promoteInfo();
    if (!info || !info.ok) { Audio.play('error'); return false; }
    const s = st.save;
    s.gold -= info.next.promote.gold; s.rank++; s.exp = 0; st.capToast = false;
    const p = st.player;
    Audio.play('promote'); st.flash = 0.9; st.flashColor = '#ffffff'; st.shake = 6;
    for (let i = 0; i < 3; i++) st.rings.push({ x: p.x, y: p.y - 6, r0: 4, r1: 40 + i * 30, life: 0.8 + i * 0.2, max: 0.8 + i * 0.2, color: i % 2 ? '#7fd3ff' : '#ffd24a' });
    burst(p.x, p.y - 8, 40, ['#ffd24a', '#fff', '#ff8bd0', '#7fd3ff'], 110, 1.1, '★');
    st.floats.push({ x: p.x, y: p.y - 30, text: `전직! ${info.next.name}`, color: '#ffd24a', life: 2.2, max: 2.2, size: 11 });
    toast(`🎉 ${info.next.name}(으)로 전직! 「${info.next.title}」`, 'good');
    save(); changed();
    if (info.next.hidden && !s.ending) { s.ending = true; save(); setTimeout(() => PJ.UI.showEnding(), 900); }
    return true;
  }
  function upgrade(id) {
    const s = st.save, sk = SKILLS[id];
    if (!sk || sk.hidden || !R.isUnlocked(id)) return false;
    const lv = R.skillLv(id), cost = R.upgradeCost(id);
    if (lv >= R.maxSkillLv() || s.gold < cost) { Audio.play('error'); return false; }
    s.gold -= cost; s.skills[id] = lv + 1;
    Audio.play('buy'); save(); changed();
    return true;
  }

  /* ----------------------------- 이펙트 ------------------------------------ */
  function burst(x, y, n, colors, spd, life, ch) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = spd * (0.35 + Math.random() * 0.65);
      st.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.3, life: life * (0.6 + Math.random() * 0.4), max: life,
        color: colors[(Math.random() * colors.length) | 0], size: 1 + ((Math.random() * 2) | 0), g: 140, ch });
    }
  }
  function orbs(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = 50 + Math.random() * 60;
      st.orbs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: -Math.random() * 0.08, color, size: 2 });
    }
  }
  const HIT_COL = { weed: ['#57b13f', '#3f8f2f', '#8bd36a', '#6a4a2a'], snow: ['#ffffff', '#dfeaff', '#b9d0f0'], complaint: ['#ffd24a', '#ff8b8b', '#ffffff'], event: ['#ff5a5a', '#ffd24a', '#ffffff'], task: ['#ffd24a', '#fff', '#8fd0ff'] };

  /* --------------------------- 말풍선(겉/속마음) ---------------------------- */
  function speak(kind, force) {
    if (!force && (st.bubbleCd > 0 || Math.random() > 0.35)) return;
    st.bubbleCd = 3.2;
    const th = SPEECH.think;
    const say = kind === 'boss' ? pick(SPEECH.bossSay) : kind === 'event' ? pick(SPEECH.event) : kind === 'night' ? pick(SPEECH.nightSay) : kind === 'visit' ? pick(SPEECH.visitSay) : pick(SPEECH.say);
    const pool = (th[kind] || []).concat(th.any);
    say_(say, pick(pool));
  }
  function say_(sayText, thinkText) {
    st.bubbleCd = 3.2;
    st.bubbles = [{ k: 'say', text: sayText, life: 2.4, max: 2.4, delay: 0 }, { k: 'think', text: thinkText, life: 2.8, max: 2.8, delay: 0.55 }];
  }

  /* ----------------------- 스폰 구역 / 길찾기 ------------------------------- */
  const walkIn = (m, x, y) => !m.solid(x, y);
  function buildReach() {
    reach = Array.from({ length: 20 }, () => Array(30).fill(false));
    const q = [[CX.spawn.x, CX.spawn.y]]; reach[CX.spawn.y][CX.spawn.x] = true;
    while (q.length) {
      const [x, y] = q.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (walkIn(CX, nx, ny) && !reach[ny][nx]) { reach[ny][nx] = true; q.push([nx, ny]); }
      });
    }
  }
  // 오브젝트가 놓일 수 있는 타일: 이동 가능 + 도달 가능 + 장식(차량 등) 없음 + 막다른 틈 아님
  function spawnable(x, y, grass) {
    if (x < 1 || y < 1 || x >= 29 || y >= 19) return false;
    if (!walkIn(CX, x, y) || !reach[y][x]) return false;
    if (CX.deco[y][x]) return false;
    if (grass && y <= 4) return false; // 상단 건물 띠(건물 사이 틈) 제외
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => walkIn(CX, x + dx, y + dy)).length >= 3;
  }
  function buildSpots() {
    buildReach();
    spots = { grass: [], paved: [], path: [], parking: [] };
    for (let y = 1; y < 19; y++) for (let x = 1; x < 29; x++) {
      const g = CX.ground[y][x], isGrass = g === 'grass' || g === 'grass2';
      if (!spawnable(x, y, isGrass)) continue;
      if (isGrass) spots.grass.push([x, y]);
      else if (g === 'path') { spots.path.push([x, y]); spots.paved.push([x, y]); }
      else if (g === 'parking' || g === 'parkLine') {
        if (CARS.includes(CX.deco[y][x])) continue;
        spots.paved.push([x, y]); spots.parking.push([x, y]);
      }
    }
  }
  // BFS: 조건(pred)을 만족하는 가장 가까운 타일까지의 경로 (현재 맵 기준)
  function findPathTo(sx, sy, pred) {
    const key = (x, y) => y * 30 + x, prev = new Map(); prev.set(key(sx, sy), null);
    const q = [[sx, sy]];
    let goal = pred(sx, sy) ? [sx, sy] : null;
    for (let i = 0; i < q.length && !goal; i++) {
      const [x, y] = q[i];
      for (let dy = -1; dy <= 1 && !goal; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!walkIn(MAP, nx, ny) || prev.has(key(nx, ny))) continue;
        if (dx && dy && (!walkIn(MAP, x + dx, y) || !walkIn(MAP, x, y + dy))) continue;
        prev.set(key(nx, ny), [x, y]); q.push([nx, ny]);
        if (pred(nx, ny)) { goal = [nx, ny]; break; }
      }
    }
    if (!goal) return null;
    const path = []; let c = goal;
    while (c && !(c[0] === sx && c[1] === sy)) { path.push(c); c = prev.get(key(c[0], c[1])); }
    return path.reverse();
  }
  const playerTile = () => [Math.floor(st.player.x / T), Math.floor((st.player.y - 3) / T)];
  const findPath = (sx, sy, tx, ty) => (walkIn(MAP, tx, ty) ? findPathTo(sx, sy, (x, y) => x === tx && y === ty) : null);

  /* ----------------------------- 맵 전환 ----------------------------------- */
  function buildLayer(m) {
    const c = document.createElement('canvas'); c.width = VW; c.height = VH;
    const g = c.getContext('2d');
    for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) {
      g.drawImage(Gfx.tile(m.ground[y][x]), x * T, y * T);
      if (m.deco[y][x]) g.drawImage(Gfx.tile(m.deco[y][x]), x * T, y * T);
    }
    return c;
  }
  const layerOf = (m) => layers[m.id] || (layers[m.id] = buildLayer(m));
  function goMap(id, px, py, dir) {
    if (st.fade) return;
    st.fade = { t: 0, id, px, py, dir, sw: false }; st.nav = null; Audio.play('door');
  }
  function switchMap(id, px, py, dir) {
    MAP = MAPS[id]; st.mapId = id;
    const p = st.player; p.x = px; p.y = py; p.dir = dir || 'down'; p.moving = false;
    st.nav = null; st.marks = []; st.target = null; st.hint = null;
    st.pressAtMap = Input.press; st.gcd = 0.3; st.autoT = 0.3;
    if (id === 'unit' && !st.unitVisit) toast('이 동에는 접수된 방문 민원이 없습니다');
    if (id === 'unit' && st.unitVisit) toast(`🏠 ${st.unitVisit.b}동 ${st.unitVisit.unit}호 — ${st.unitVisit.steps[st.unitVisit.step].label}`);
    if (id === 'office' && st.phase === 'night' && !st.night.active) toast('🌙 야간 당직 근무 중 — 민원을 기다리는 중…');
  }
  function useDoor(it) {
    const from = st.mapId;
    if (from === 'complex') {
      const rc = getRc(it); st.ret = { x: rc.x + rc.w / 2, y: 5 * T + 10 };
      if (it.to === 'unit') {
        st.unitBld = it.bld; st.unitVisit = st.visits.find((v) => v.b === it.bld && !v.done) || null;
        const sp = MAPS.unit.spawn; goMap('unit', sp.x * T + 8, sp.y * T + 10, 'right');
      } else { const sp = MAPS.office.spawn; goMap('office', sp.x * T + 8, sp.y * T + 10, 'up'); }
    } else goMap('complex', st.ret.x, st.ret.y, 'down');
  }

  /* ----------------------------- 오브젝트 ---------------------------------- */
  const countOf = (type) => st.objs.filter((o) => o.type === type).length;
  const maxOf = (type) => OBJECTS[type].max + st.save.rank * (type === 'complaint' ? 1 : 2);
  const free = (x, y) => !st.objs.some((o) => Math.hypot(o.x - x, o.y - y) < 15);
  function spawn(type, silent) {
    if (countOf(type) >= maxOf(type)) return false;
    const list = spots[OBJECTS[type].zone], p = st.player, here = st.mapId === 'complex';
    if (!list.length) return false;
    for (let tries = 0; tries < 30; tries++) {
      const [tx, ty] = list[(Math.random() * list.length) | 0];
      if (!spawnable(tx, ty, OBJECTS[type].zone === 'grass')) continue;
      const x = tx * T + 8, y = ty * T + 8;
      if (!silent && here && Math.hypot(x - p.x, y - (p.y - 6)) < 36) continue;
      if (!free(x, y)) continue;
      const hp = R.objHp({ type });
      st.objs.push({ type, x, y, hp, maxHp: hp, shake: 0, age: silent ? 1 : 0, ttl: OBJECTS[type].ttl || 0, bob: Math.random() * 6 });
      if (!silent && here) burst(x, y, 6, ['#fff', '#ffe9a0'], 30, 0.4);
      return true;
    }
    return false;
  }
  function nearestObj(reachPx, sk) {
    if (st.mapId !== 'complex') return null;
    const p = st.player, cx = p.x, cy = p.y - 6;
    let best = null, bd = reachPx + 8;
    st.objs.forEach((o) => {
      if (sk && !R.matches(sk, o)) return;
      const d = Math.hypot(o.x - cx, o.y - cy) - 8 * (o.scale || 1);
      if (d <= reachPx && d < bd) { bd = d; best = o; }
    });
    return best;
  }
  const faceTo = (x, y) => {
    const p = st.player, dx = x - p.x, dy = y - (p.y - 6);
    p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  };
  const basicId = (o) => (o.type === 'weed' ? 'weedPull' : o.type === 'snow' ? 'shovel' : o.type === 'complaint' ? 'answer' : 'urgent');

  function damage(o, dmg, info) {
    const crit = Math.random() < 0.12;
    if (crit) dmg *= 1.6;
    o.hp -= dmg; o.shake = 0.18;
    burst(o.x, o.y, crit ? 9 : 5, HIT_COL[o.type], crit ? 70 : 50, 0.45);
    Audio.play(crit ? 'crit' : 'hit');
    if (o.boss) st.shake = Math.max(st.shake, 2);
    if (crit) st.floats.push({ x: o.x, y: o.y - 10, text: 'CRIT!', color: '#ffe066', life: 0.6, max: 0.6, size: 7 });
    if (o.hp <= 0) kill(o, info);
  }
  function dropItem(o, x, y) {
    const chance = o.type === 'event' ? (o.boss ? 1 : 0.4) : o.type === 'complaint' ? 0.12 : 0.06;
    if (Math.random() > chance) return;
    const it = pick(ITEMS), lv = R.item(it.id);
    Audio.play('item');
    if (lv >= PJ.ITEM_MAX) {
      const g = 150 * (st.save.level + 1); st.save.gold += g;
      toast(`${it.icon} ${it.name} 중복! 판매 +${g}G`);
    } else {
      st.save.items[it.id] = lv + 1;
      toast(`🎁 ${it.icon} ${it.name} ${lv ? '→ Lv.' + (lv + 1) : '획득!'} (도감)`, 'good');
      st.floats.push({ x, y: y - 28, text: `🎁 ${it.name}!`, color: '#ff9bd0', life: 1.6, max: 1.6, size: 8 });
    }
  }
  function kill(o, info) {
    const i = st.objs.indexOf(o); if (i < 0) return;
    st.objs.splice(i, 1);
    const isEv = o.type === 'event';
    bumpCombo();
    const bonus = isEv ? EVENT.mult : (info && info.bonus) || 1;
    const rw = R.reward(o, bonus);
    st.save.stats[o.type]++; if (o.boss) st.save.stats.boss++;
    if (o.type === 'weed' || o.type === 'snow' || o.type === 'complaint') st.shift[o.type]++;
    burst(o.x, o.y, isEv ? 28 : 16, HIT_COL[o.type], isEv ? 120 : 90, 0.7, o.type === 'complaint' ? '♥' : null);
    orbs(o.x, o.y, Math.min(9, 3 + Math.floor(rw.exp / 25)), '#5ac8ff');
    orbs(o.x, o.y, Math.min(7, 2 + Math.floor(rw.gold / 25)), '#ffd24a');
    st.floats.push({ x: o.x - 6, y: o.y - 12, text: `+${rw.exp} EXP`, color: '#7fd3ff', life: 1.1, max: 1.1, size: 7 });
    st.floats.push({ x: o.x + 6, y: o.y - 4, text: `+${rw.gold}G`, color: '#ffd24a', life: 1.2, max: 1.2, size: 7 });
    if (isEv) st.floats.push({ x: o.x, y: o.y - 24, text: `긴급 보너스 x${EVENT.mult}!`, color: '#ff9b6b', life: 1.4, max: 1.4, size: 8 });
    else if (bonus > 1) st.floats.push({ x: o.x, y: o.y - 22, text: o.type === 'complaint' ? '친절 보너스!' : '고효율!', color: '#ff9bd0', life: 1.1, max: 1.1, size: 7 });
    comboFx();
    st.shake = Math.max(st.shake, isEv ? 5 : 2); st.hitstop = isEv ? 0.08 : 0.04;
    Audio.play('kill'); setTimeout(() => Audio.play('coin'), 120);
    dropItem(o, o.x, o.y);
    if (isEv) winEvent(o); else speak(o.type);
    grant(rw); changed(); save();
  }

  /* ------------------------ 돌발 이벤트 / 보스 (주간) ----------------------- */
  function startEvent() {
    const def = pick(EVENTS);
    let tx, ty;
    if (def.zone === 'parking') {
      const list = spots.parking.filter(([x, y]) => x >= 19 && y >= 9 && y <= 15);
      [tx, ty] = pick(list.length ? list : spots.parking);
    } else [tx, ty] = def.tile;
    const x = tx * T + 8, y = ty * T + 8;
    st.objs = st.objs.filter((q) => Math.hypot(q.x - x, q.y - y) > 18);
    const hp = def.hp * R.rank().hpMult;
    const o = { type: 'event', ev: def, def, x, y, hp, maxHp: hp, shake: 0, age: 0, ttl: def.ttl, maxTtl: def.ttl, bob: 0, boss: !!def.boss, scale: def.boss ? 1.7 : 1.25 };
    st.objs.push(o); st.event = { obj: o, def };
    Audio.play('alarm'); st.flash = 0.35; st.flashColor = '#ff3b3b';
    if (st.mapId === 'complex') burst(x, y, 14, ['#ff5a5a', '#ffd24a'], 80, 0.6);
    speak('event', true);
    PJ.UI && PJ.UI.refresh();
  }
  function winEvent(o) {
    st.event = null; st.evT = EVENT.interval;
    st.fever = FEVER.dur; Audio.play('fever');
    toast(`✅ ${o.ev.win} 🔥 FEVER ${FEVER.dur}초! (이속·공속 UP)`, 'good');
    speak(o.boss ? 'boss' : 'event', true);
  }
  function failEvent(o) {
    const i = st.objs.indexOf(o); if (i >= 0) st.objs.splice(i, 1);
    st.event = null; st.evT = EVENT.interval;
    burst(o.x, o.y, 12, ['#888', '#ccc'], 50, 0.6);
    toast('⏰ 시간 초과! 상황이 저절로 정리됐습니다...'); Audio.play('error');
  }

  /* ------------------ 세대 방문 민원 (주간) / 야간 내방·전화 ----------------- */
  function activeTasks() {
    if (st.mapId === 'unit' && st.unitVisit && !st.unitVisit.done) { const s = st.unitVisit.steps[st.unitVisit.step]; return s ? [s] : []; }
    if (st.mapId === 'office' && st.night.active) return [st.night.active.task];
    return [];
  }
  const doorOf = (b) => CX.inter.find((i) => i.id === 'door_' + b);
  function newVisit() {
    const b = pick(VISIT.buildings), f = 2 + ((Math.random() * 14) | 0), unit = `${f}0${1 + ((Math.random() * 4) | 0)}`;
    const typeId = pick(['fire', 'gas', 'leak']), def = VISIT.types[typeId];
    const steps = def.steps.map((sd) => {
      const hp = sd.hp * (1 + 0.15 * st.save.rank);
      return { kind: 'visit', def: sd, hp, maxHp: hp, rc: rectPx(MAPS.unit.targets[sd.id].rect), side: null, label: sd.label, verb: sd.verb };
    });
    const v = { b, unit, type: typeId, text: def.text(b, unit), ttl: VISIT.ttl, maxTtl: VISIT.ttl, steps, step: 0, done: false };
    steps.forEach((s) => { s.v = v; });
    st.visits.push(v);
    Audio.play('alarm'); toast(`🏠 ${v.text} — ${v.b}동 입구로!`, 'alert');
    speak('visit', true);
  }
  function workTask(t, dmg, tag) {
    const rc = getRc(t), cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2;
    t.hp -= dmg; t.shake = 0.15;
    burst(cx, cy, 5, HIT_COL.task, 50, 0.45);
    Audio.play('hit');
    if (Math.random() < 0.35) st.floats.push({ x: cx, y: cy - 12, text: t.verb || '작업 중…', color: '#cfe8ff', life: 0.7, max: 0.7, size: 6 });
    const p = st.player; p.atk = 0.2; faceTo(cx, cy);
    st.slashes.push({ x: p.x, y: p.y - 6, a: Math.atan2(cy - (p.y - 6), cx - p.x), life: 0.16, max: 0.16, color: '#cfe8ff' });
    if (tag === 'kind') t.kindUsed = true;
    if (t.hp <= 0) completeTask(t);
  }
  function completeTask(t) {
    const rc = getRc(t), cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2;
    Audio.play('kill'); setTimeout(() => Audio.play('coin'), 120);
    burst(cx, cy, 18, HIT_COL.task, 100, 0.7); st.shake = Math.max(st.shake, 3);
    if (t.kind === 'visit') {
      const v = t.v; v.step++;
      if (v.step < v.steps.length) { // 중간 단계
        const rw = R.reward({ type: 'complaint', def: { exp: 8, gold: 6 } }, 1);
        grant(rw); toast(`✔ ${t.def.done}`, 'good');
        st.floats.push({ x: cx, y: cy - 10, text: `+${rw.exp} EXP`, color: '#7fd3ff', life: 1.1, max: 1.1, size: 7 });
        orbs(cx, cy, 4, '#5ac8ff'); changed(); return;
      }
      v.done = true; st.visits = st.visits.filter((q) => q !== v);
      bumpCombo(); comboFx();
      const rw = R.reward({ type: 'complaint', def: { exp: VISIT.exp, gold: VISIT.gold } }, VISIT.mult * (t.kindUsed ? 1.3 : 1));
      st.save.stats.visit++; st.save.stats.complaint++; st.shift.visit++;
      grant(rw);
      orbs(cx, cy, 8, '#5ac8ff'); orbs(cx, cy, 6, '#ffd24a');
      st.floats.push({ x: cx, y: cy - 10, text: `+${rw.exp} EXP`, color: '#7fd3ff', life: 1.2, max: 1.2, size: 7 });
      st.floats.push({ x: cx, y: cy + 2, text: `+${rw.gold}G`, color: '#ffd24a', life: 1.3, max: 1.3, size: 7 });
      st.floats.push({ x: cx, y: cy - 24, text: `방문 민원 보너스 x${VISIT.mult}!`, color: '#ff9b6b', life: 1.4, max: 1.4, size: 8 });
      toast(`✅ ${t.def.done} 현관으로 나가 복귀하세요`, 'good');
      dropItem({ type: 'complaint' }, cx, cy); speak('visit', true); changed(); save();
    } else { // night
      const n = t.n;
      bumpCombo(); comboFx();
      const rw = R.reward({ type: 'complaint', def: { exp: NIGHT.exp, gold: NIGHT.gold } }, NIGHT.mult * (t.kindUsed ? 1.3 : 1));
      st.save.stats.night++; st.save.stats.complaint++; st.shift.night++; st.shift.nightPay += rw.gold;
      grant(rw);
      orbs(cx, cy, 8, '#5ac8ff'); orbs(cx, cy, 7, '#ffd24a');
      st.floats.push({ x: cx, y: cy - 10, text: `+${rw.exp} EXP`, color: '#7fd3ff', life: 1.2, max: 1.2, size: 7 });
      st.floats.push({ x: cx, y: cy + 2, text: `+${rw.gold}G 야간수당`, color: '#ffd24a', life: 1.3, max: 1.3, size: 7 });
      toast(`🌙 ${n.sub.title} 처리 완료! 야간수당 x${NIGHT.mult}`, 'good');
      dropItem({ type: 'complaint' }, cx, cy);
      endNight(true); speak('night', true); changed(); save();
    }
  }
  function spawnNight() {
    const n = st.night; n.idx++;
    const kind = n.idx % 2 ? 'walkin' : 'call', sub = pick(NIGHT[kind]), tg = MAPS.office.targets[sub.station];
    const hp = 6 * (1 + 0.15 * st.save.rank), ttl = NIGHT.ttl[kind];
    const task = { kind: 'night', hp, maxHp: hp, rc: rectPx(tg.rect), side: tg.side || null, label: sub.title, verb: sub.verb };
    n.active = { kind, sub, task, ttl, maxTtl: ttl };
    task.n = n.active;
    if (kind === 'walkin') {
      const v = MAPS.office.visitor;
      st.visitor = { idx: 2 + ((Math.random() * 3) | 0), x: v.x * T + 8, y: v.y * T + 10, text: sub.text };
      Audio.play('door'); toast(`🛎️ 내방 민원: ${sub.title}`, 'alert');
    } else { st.ringT = 0; toast(`📞 전화 민원: ${sub.title}`, 'alert'); }
  }
  function endNight(ok) {
    const n = st.night;
    n.active = null; st.visitor = null; n.t = NIGHT.gapMin + Math.random() * (NIGHT.gapMax - NIGHT.gapMin);
    if (!ok) { st.combo = 0; st.comboT = 0; }
  }
  function failNight() {
    const a = st.night.active; if (!a) return;
    st.shift.nightFail++; endNight(false);
    toast(a.kind === 'call' ? '⏰ 전화가 끊겼습니다… 민원 미처리' : '⏰ 민원인이 화를 내며 돌아갔습니다…'); Audio.play('error');
  }

  /* --------------------------- 근무 시계 / 정산 ----------------------------- */
  function colleaguesReset() {
    st.npcs = (MAPS.office.colleagues || []).map((c) => ({ i: c.i, x: c.x * T + 8, y: c.y * T + 10, state: 'sit', path: [], pi: 0, delay: 0, bubble: null, dir: 'down' }));
  }
  function beginNight() {
    st.phase = 'night'; st.night = { t: NIGHT.first, idx: 0, active: null };
    st.objs = []; st.event = null; st.visits = []; st.nav = null;
    if (st.unitVisit) st.unitVisit = null;
    toast('🌙 18:00 — 동료들이 퇴근합니다. 이제부터 박주임 혼자 야간 당직!', 'good');
    Audio.play('alarm');
    // 동료 퇴근 (관리사무소 맵 기준 길찾기)
    const save0 = MAP; MAP = MAPS.office;
    st.npcs.forEach((n, k) => {
      const sx = Math.floor(n.x / T), sy = Math.floor((n.y - 3) / T);
      n.path = findPathTo(sx, sy, (x, y) => x === 14 && y === 14) || []; n.pi = 0; n.delay = 1 + k * 1.6; n.state = 'leave';
    });
    MAP = save0;
    if (st.mapId !== 'office') {
      st.sched.push({ t: 4, fn: () => {
        if (st.phase === 'night' && st.mapId !== 'office' && !st.fade) {
          toast('야간 당직 시작 — 관리사무소로 복귀합니다'); const sp = MAPS.office.spawn; goMap('office', sp.x * T + 8, sp.y * T + 10, 'up');
        }
      } });
    }
  }
  function endShift() {
    const s = st.shift, bonus = s.night * (25 + 2 * st.save.level);
    st.save.gold += bonus; st.save.day = (st.save.day || 1);
    const summary = Object.assign({ day: st.day, bonus }, s);
    st.settling = true; st.night.active = null; st.visitor = null;
    save(); st.paused = true; Input.reset();
    PJ.UI.showSettle(summary, () => { st.settling = false; st.paused = false; startDay(false); });
  }
  function startDay(first) {
    if (!first) st.day++;
    st.min = TIME.start; st.phase = 'day'; st.shift = newShift();
    st.objs = []; st.visits = []; st.event = null; st.evT = EVENT.first; st.visitT = VISIT.first;
    st.night = { t: NIGHT.first, idx: 0, active: null }; st.visitor = null; st.unitVisit = null; st.combo = 0;
    colleaguesReset();
    ['weed', 'snow', 'complaint'].forEach((t) => { const n = Math.ceil(OBJECTS[t].max / 2); for (let i = 0; i < n; i++) spawn(t, true); });
    if (!first) {
      toast(`☀️ ${st.day}일차 09:00 출근!`, 'good'); Audio.play('level');
      switchMap('complex', 5 * T + 8, 5 * T + 10, 'down');
    }
    changed();
  }
  function darkFactor() {
    const m = st.min;
    if (MAP.kind === 'office') {
      if (m < 1080 || m >= 1920) return 0;
      if (m < 1100) return (m - 1080) / 20;
      return m < 1900 ? 1 : 1 - (m - 1900) / 20;
    }
    if (m < 1020) return 0; if (m < 1140) return (m - 1020) / 120; if (m < 1800) return 1; if (m < 1920) return 1 - (m - 1800) / 120; return 0;
  }
  PJ.Clock = { text() { const m = Math.floor(st.min) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); } };

  /* ------------------------------- 스킬 ------------------------------------ */
  function startCd(id, s) { st.cd[id] = st.cdMax[id] = s; }
  function useSkill(id) {
    const sk = SKILLS[id], p = st.player;
    if (!R.isUnlocked(id)) { toast(`🔒 Lv.${sk.unlockLv} 에 해금됩니다`); Audio.play('error'); return false; }
    if ((st.cd[id] || 0) > 0) return false;
    const s = R.skillStats(id);
    if (id === 'kind' && st.mapId !== 'complex') { // 실내: 방문/야간 민원에 큰 처리량
      const t = findInter();
      if (t && (t.kind === 'visit' || t.kind === 'night')) { Audio.play('kind'); burst(p.x, p.y - 8, 10, ['#ff8bd0', '#ffd0e8'], 55, 0.8, '♥'); workTask(t, s.dmg, 'kind'); startCd(id, s.cd); return true; }
      toast('지금 안내할 대상이 없어요'); Audio.play('error'); return false;
    }
    if (sk.type === 'single') {
      const t = nearestObj(s.reach, sk);
      if (!t) { if (!sk.hidden && sk.key) { toast('근처에 대상이 없어요'); Audio.play('error'); } return false; }
      faceTo(t.x, t.y);
      p.atk = 0.2; p.atkDir = Math.atan2(t.y - (p.y - 6), t.x - p.x);
      st.slashes.push({ x: p.x, y: p.y - 6, a: p.atkDir, life: 0.18, max: 0.18, color: sk.group === 'snow' ? '#dff0ff' : sk.group === 'weed' ? '#d6ffb0' : '#ffd0e8' });
      Audio.play(id === 'kind' ? 'kind' : 'swing');
      if (id === 'kind') burst(t.x, t.y - 4, 10, ['#ff8bd0', '#ffd0e8'], 55, 0.8, '♥');
      damage(t, s.dmg, { bonus: s.bonus });
      startCd(id, s.cd);
    } else {
      if (st.mapId !== 'complex') { toast('범위 스킬은 야외에서만 쓸 수 있어요'); Audio.play('error'); return false; }
      const hits = st.objs.filter((o) => R.matches(sk, o) && Math.hypot(o.x - p.x, o.y - (p.y - 6)) <= s.radius + 6);
      if (!hits.length) { toast('범위 안에 대상이 없어요'); Audio.play('error'); return false; }
      startCd(id, s.cd);
      Audio.play(id === 'mower' ? 'mower' : 'blower');
      st.shake = Math.max(st.shake, 3);
      if (id === 'mower') st.spins.push({ life: 0.45, max: 0.45, r: s.radius, kind: 'mower' });
      else {
        st.rings.push({ x: p.x, y: p.y - 6, r0: 6, r1: s.radius, life: 0.5, max: 0.5, color: '#dff0ff', thick: 3 });
        burst(p.x, p.y - 6, 26, ['#fff', '#dfeaff'], 130, 0.7);
      }
      p.atk = 0.45;
      for (let k = 0; k < 3; k++) st.sched.push({ t: k * 0.13, fn: () => {
        st.objs.filter((o) => R.matches(sk, o) && Math.hypot(o.x - p.x, o.y - (p.y - 6)) <= s.radius + 6)
          .forEach((o) => damage(o, s.dmg / 3, { bonus: s.bonus }));
      } });
    }
    return true;
  }
  /* 상호작용 지점(문/미션/가구) 탐색: 현재 맵 기준, 사거리 안 + 방향 조건 */
  function inReach(it, extra) {
    const p = st.player, rc = getRc(it), cy = p.y - 6;
    if (it.side === 'N' && cy >= rc.y) return false;
    return distRect(p.x, cy, rc) <= REACH + (extra || 0);
  }
  function findInter() {
    const p = st.player, cx = p.x, cy = p.y - 6;
    let best = null, bd = 1e9;
    const test = (it, bias) => {
      if (!inReach(it)) return;
      const d = distRect(cx, cy, getRc(it)) - bias;
      if (d < bd) { bd = d; best = it; }
    };
    activeTasks().forEach((t) => test(t, 10));
    MAP.inter.forEach((it) => test(it, 0));
    return best;
  }
  function interact(it, viaNav) {
    if (it.kind === 'visit' || it.kind === 'night') {
      if ((st.cd.urgent || 0) > 0) return;
      const s = R.skillStats('urgent'); startCd('urgent', s.cd);
      workTask(it, s.dmg, null);
    } else if (it.kind === 'door') {
      if (!viaNav && Input.press <= st.pressAtMap) return; // 문은 '새로 누를 때'만
      useDoor(it);
    } else if (it.kind === 'flavor') {
      if (st.gcd > 0) return; st.gcd = 0.7; say_(it.say, it.think); Audio.play('swing');
    }
  }
  function basicAction() {
    if (st.paused || st.gcd > 0 || st.fade) return;
    const p = st.player, t = nearestObj(36);
    if (t) { if (useSkill(basicId(t))) st.gcd = 0.08; return; }
    const it = findInter();
    if (it) { interact(it, false); return; }
    st.gcd = 0.25; p.atk = 0.15; p.atkDir = { right: 0, down: 1.57, left: 3.14, up: -1.57 }[p.dir];
    st.slashes.push({ x: p.x, y: p.y - 6, a: p.atkDir, life: 0.14, max: 0.14, color: '#ffffff88' });
    Audio.play('swing');
  }
  function skillKey(n) { if (st.paused) return; useSkill(['mower', 'blower', 'kind'][n - 1]); }

  /* ------------------- 자동 이동(탭) / 자동 순찰(Auto) ---------------------- */
  const norm = (n) => (n ? n : null);
  function makeNavObj(o, auto) {
    const [sx, sy] = playerTile();
    const path = findPath(sx, sy, Math.floor(o.x / T), Math.floor(o.y / T));
    return path ? { obj: o, path, pi: 0, auto: !!auto } : null;
  }
  function makeNavTile(tx, ty, auto) {
    const [sx, sy] = playerTile(); const path = findPath(sx, sy, tx, ty);
    return path ? { path, pi: 0, auto: !!auto } : null;
  }
  function makeNavInter(it, auto) {
    const rc = getRc(it), [sx, sy] = playerTile();
    const pred = (x, y) => {
      if (MAP.solid(x, y)) return false;
      const by = y * T + 4;
      if (it.side === 'N' && by >= rc.y) return false;
      return distRect(x * T + 8, by, rc) <= REACH - 4;
    };
    const path = findPathTo(sx, sy, pred);
    return path ? { inter: it, path, pi: 0, auto: !!auto } : null;
  }
  const workReach = (o) => R.skillStats(basicId(o)).reach - 6;

  function tapAt(wx, wy) {
    if (st.paused || st.fade) return;
    Input.bump();
    let nav = null, mark = null;
    if (st.mapId === 'complex') {
      let best = null, bd = 15;
      st.objs.forEach((o) => { const d = Math.hypot(o.x - wx, o.y - wy) - (o.scale ? 4 : 0); if (d < bd) { bd = d; best = o; } });
      if (best) { nav = makeNavObj(best); mark = [best.x, best.y, '#fff']; }
      if (!nav) st.visits.forEach((v) => {
        const d = doorOf(v.b), rc = getRc(d);
        if (!nav && Math.hypot(rc.x + rc.w / 2 - wx, 5 * T + 8 - wy) < 14) { nav = makeNavInter(d); mark = [rc.x + rc.w / 2, 5 * T + 8, '#ffd24a']; }
      });
    }
    if (!nav) {
      const list = activeTasks().concat(MAP.inter);
      for (const it of list) {
        const rc = getRc(it);
        if (wx >= rc.x - 8 && wx <= rc.x + rc.w + 8 && wy >= rc.y - 8 && wy <= rc.y + rc.h + 8) {
          nav = makeNavInter(it); mark = [rc.x + rc.w / 2, rc.y + rc.h / 2, '#ffd24a']; if (nav) break;
        }
      }
    }
    if (!nav) {
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      nav = makeNavTile(tx, ty); mark = [tx * T + 8, ty * T + 8, '#8fd0ff'];
    }
    if (nav) { st.nav = nav; st.marks.push({ x: mark[0], y: mark[1], life: 0.5, max: 0.5, color: mark[2] }); } else Audio.play('error');
  }
  function blocked(x, y) {
    const hw = 4;
    return MAP.solid(Math.floor((x - hw) / T), Math.floor((y - 6) / T)) || MAP.solid(Math.floor((x + hw) / T), Math.floor((y - 6) / T)) ||
      MAP.solid(Math.floor((x - hw) / T), Math.floor(y / T)) || MAP.solid(Math.floor((x + hw) / T), Math.floor(y / T));
  }
  function navUpdate(dt) {
    const p = st.player, n = st.nav;
    if (!n) return false;
    if (n.obj) {
      if (!st.objs.includes(n.obj) || st.mapId !== 'complex') { st.nav = null; return false; }
      const d = Math.hypot(n.obj.x - p.x, n.obj.y - (p.y - 6)) - 8 * (n.obj.scale || 1);
      if (d <= workReach(n.obj)) { faceTo(n.obj.x, n.obj.y); p.moving = false; useSkill(basicId(n.obj)); return true; }
    }
    if (n.inter) {
      const it = n.inter;
      if ((it.kind === 'visit' || it.kind === 'night') && !activeTasks().includes(it)) { st.nav = null; return false; }
      if (inReach(it, -2)) {
        const rc = getRc(it); faceTo(rc.x + rc.w / 2, rc.y + rc.h / 2); p.moving = false;
        interact(it, true);
        if (it.kind === 'door' || it.kind === 'flavor') st.nav = null;
        return true;
      }
    }
    if (n.pi >= n.path.length) { st.nav = null; return false; }
    const w = n.path[n.pi], wx = w[0] * T + 8, wy = w[1] * T + 10;
    const dx = wx - p.x, dy = wy - p.y, dist = Math.hypot(dx, dy);
    if (dist < 2) { n.pi++; return true; }
    const step = Math.min(dist, R.speed() * dt), ax = dx / dist, ay = dy / dist;
    const nx = p.x + ax * step, ny = p.y + ay * step;
    if (!blocked(nx, p.y)) p.x = nx;
    if (!blocked(p.x, ny)) p.y = ny;
    p.moving = true;
    if (!(p.atk > 0)) p.dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : (ay < 0 ? 'up' : 'down');
    p.stepT += dt; if (p.stepT > 0.16) { p.stepT = 0; p.step ^= 1; }
    return true;
  }
  function autoThink(dt) {
    if (!st.auto || st.fade || st.settling) return;
    st.autoT -= dt; if (st.autoT > 0) return; st.autoT = 0.25;
    const p = st.player, cx = p.x, cy = p.y - 6, cur = st.nav;
    if (st.mapId === 'complex') { // 자동 스킬
      ['mower', 'blower', 'kind'].forEach((id) => {
        if (!R.isUnlocked(id) || (st.cd[id] || 0) > 0) return;
        const sk = SKILLS[id], s = R.skillStats(id);
        if (sk.type === 'area') {
          const n = st.objs.filter((o) => R.matches(sk, o) && Math.hypot(o.x - cx, o.y - cy) <= s.radius + 6).length;
          const tgt = cur && cur.obj && R.matches(sk, cur.obj);
          if (n >= 2 || (n >= 1 && tgt)) useSkill(id);
        } else if (nearestObj(s.reach, sk)) useSkill(id);
      });
    } else if (st.mapId !== 'complex') { // 실내: 큰 처리량이 필요한 민원엔 친절한 안내
      const t = activeTasks()[0];
      if (t && R.isUnlocked('kind') && !(st.cd.kind > 0) && inReach(t)) useSkill('kind');
    }
    if (cur && !cur.auto) return;
    const goInter = (it) => {
      if (!it) return false;
      if (cur && cur.inter === it) return true;
      const nav = makeNavInter(it, true);
      if (nav) { st.nav = nav; return true; } return false;
    };
    const exitDoor = () => MAP.inter.find((i) => i.id === 'exit');
    if (st.mapId === 'complex') {
      if (st.phase === 'night') { goInter(doorOf('office') || CX.inter[0]); return; }
      let bv = null, bdv = 1e9;
      st.visits.forEach((v) => { const rc = getRc(doorOf(v.b)), d = Math.hypot(rc.x + rc.w / 2 - cx, rc.y - cy); if (d < bdv) { bdv = d; bv = v; } });
      if (bv && goInter(doorOf(bv.b))) return;
      if (cur && cur.obj && st.objs.includes(cur.obj) && cur.obj.type === 'event') return;
      let best = null, bs = 1e9;
      st.objs.forEach((o) => {
        const d = Math.hypot(o.x - cx, o.y - cy), sc = d - (o.type === 'event' ? 300 : o.type === 'complaint' ? 40 : 0);
        if (sc < bs) { bs = sc; best = o; }
      });
      if (!best || (cur && cur.obj === best)) return;
      if (cur && cur.obj && st.objs.includes(cur.obj)) {
        const cd = Math.hypot(cur.obj.x - cx, cur.obj.y - cy) - (cur.obj.type === 'complaint' ? 40 : 0);
        if (cur.obj.type !== 'event' && cd < bs + 24) return;
      }
      const nav = makeNavObj(best, true); if (nav) st.nav = nav;
    } else {
      const t = activeTasks()[0];
      if (t) { goInter(t); return; }
      if (st.mapId === 'unit' || st.phase === 'day') { goInter(exitDoor()); return; }
      if (!cur && Math.hypot(15 * T - cx, 9 * T + 8 - cy) > 20) { const nv = makeNavTile(14, 9, true); if (nv) st.nav = nv; } // 야간 대기: 데스크 뒤
    }
  }

  /* ------------------------------- 업데이트 -------------------------------- */
  function update(dt) {
    if (st.paused) return;
    if (st.fade) {
      const f = st.fade; f.t += dt;
      if (!f.sw && f.t >= 0.22) { f.sw = true; switchMap(f.id, f.px, f.py, f.dir); }
      if (f.t >= 0.44) st.fade = null;
    }
    if (st.hitstop > 0) { st.hitstop -= dt; return; }
    st.time += dt;
    // 근무 시계
    st.min += TIME.minPerSec * dt;
    if (st.phase === 'day' && st.min >= TIME.dusk) beginNight();
    else if (st.phase === 'night' && st.min >= TIME.end && !st.settling) { endShift(); return; }

    const rate = st.fever > 0 ? FEVER.rate : 1;
    st.gcd = Math.max(0, st.gcd - dt * rate);
    Object.keys(st.cd).forEach((k) => { if (st.cd[k] > 0) st.cd[k] = Math.max(0, st.cd[k] - dt * rate); });
    if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) st.combo = 0; }
    st.bubbleCd = Math.max(0, st.bubbleCd - dt);
    if (st.fever > 0) {
      st.fever = Math.max(0, st.fever - dt); st.trailT -= dt;
      if (st.trailT <= 0) { st.trailT = 0.05; burst(st.player.x, st.player.y - 2, 1, ['#ff9b3b', '#ffd24a'], 18, 0.35); }
    }

    // 이동: 수동 입력 > 자동이동 (전환 연출 중에는 잠금)
    const p = st.player, a = st.fade ? { x: 0, y: 0 } : Input.axis();
    p.moving = false;
    if (a.x || a.y) {
      st.nav = null;
      const sp = R.speed(), nx = p.x + a.x * sp * dt, ny = p.y + a.y * sp * dt;
      if (!blocked(nx, p.y)) p.x = nx;
      if (!blocked(p.x, ny)) p.y = ny;
      p.moving = true;
      if (!(p.atk > 0)) p.dir = Math.abs(a.x) > Math.abs(a.y) ? (a.x < 0 ? 'left' : 'right') : (a.y < 0 ? 'up' : 'down');
      p.stepT += dt; if (p.stepT > 0.16) { p.stepT = 0; p.step ^= 1; }
    } else if (st.nav && !st.fade) navUpdate(dt);
    if (!p.moving) { p.step = 0; p.stepT = 0; }
    p.atk = Math.max(0, p.atk - dt);
    if (Input.held.action && !st.fade) basicAction();
    autoThink(dt);

    // 주간: 스폰 / 돌발 이벤트 / 세대 방문 민원
    if (st.phase === 'day') {
      Object.keys(OBJECTS).forEach((type) => {
        st.spawnT[type] = (st.spawnT[type] || 0) - dt;
        if (st.spawnT[type] <= 0) {
          spawn(type);
          st.spawnT[type] = OBJECTS[type].interval * (1 - 0.1 * Math.min(3, st.save.rank)) * (0.7 + Math.random() * 0.6);
        }
      });
      if (!st.event) { st.evT -= dt; if (st.evT <= 0) startEvent(); }
      st.visitT -= dt;
      if (st.visitT <= 0) { if (st.visits.length < VISIT.max) newVisit(); st.visitT = VISIT.interval * (0.8 + Math.random() * 0.5); }
      for (let i = st.visits.length - 1; i >= 0; i--) {
        const v = st.visits[i]; v.ttl -= dt;
        if (v.ttl <= 0) {
          st.visits.splice(i, 1); if (st.unitVisit === v) st.unitVisit = null;
          toast(`⏰ ${v.text} — 다른 직원이 처리했습니다`); Audio.play('error');
        }
      }
    } else { // 야간 당직
      const n = st.night;
      if (!n.active) { n.t -= dt; if (n.t <= 0) spawnNight(); }
      else {
        n.active.ttl -= dt;
        if (n.active.kind === 'call') { st.ringT -= dt; if (st.ringT <= 0) { st.ringT = 1.5; Audio.play('ring'); } }
        if (n.active.ttl <= 0) failNight();
      }
    }
    for (let i = st.objs.length - 1; i >= 0; i--) {
      const o = st.objs[i];
      o.age += dt; o.shake = Math.max(0, o.shake - dt);
      if (o.ttl) {
        o.ttl -= dt;
        if (o.ttl <= 0) {
          if (o.type === 'event') failEvent(o);
          else { if (st.mapId === 'complex') burst(o.x, o.y, 8, ['#aaa', '#ddd'], 40, 0.5); st.objs.splice(i, 1); }
        }
      }
    }
    activeTasks().forEach((t) => { t.shake = Math.max(0, (t.shake || 0) - dt); });
    // 관리사무소 동료 NPC
    st.npcs.forEach((n) => {
      if (n.bubble) { n.bubble.life -= dt; if (n.bubble.life <= 0) n.bubble = null; }
      if (n.state === 'leave') {
        if (n.delay > 0) { n.delay -= dt; return; }
        if (n.pi < n.path.length) {
          const w = n.path[n.pi], wx = w[0] * T + 8, wy = w[1] * T + 10, dx = wx - n.x, dy = wy - n.y, d = Math.hypot(dx, dy);
          if (d < 2) n.pi++; else { n.x += (dx / d) * 44 * dt; n.y += (dy / d) * 44 * dt; n.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); }
        } else { n.state = 'out'; n.outT = 1.3; n.dir = 'down'; n.bubble = { text: '수고하세요~', life: 1.4 }; }
      } else if (n.state === 'out') { n.outT -= dt; if (n.outT <= 0) { n.state = 'gone'; if (st.mapId === 'office') Audio.play('door'); } }
    });
    for (let i = st.sched.length - 1; i >= 0; i--) { st.sched[i].t -= dt; if (st.sched[i].t <= 0) { const f = st.sched[i].fn; st.sched.splice(i, 1); f(); } }

    // 이펙트
    st.parts = st.parts.filter((q) => { q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; return q.life > 0; });
    const tx = p.x, ty = p.y - 6;
    st.pickT = Math.max(0, st.pickT - dt);
    st.orbs = st.orbs.filter((q) => {
      q.t += dt;
      if (q.t < 0) return true;
      if (q.t < 0.22) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; return true; }
      const dx = tx - q.x, dy = ty - q.y, d = Math.hypot(dx, dy), sp = (110 + (q.t - 0.22) * 700) * dt;
      if (d <= sp + 3) { if (st.pickT <= 0) { Audio.play('tick'); st.pickT = 0.05; } return false; }
      q.x += (dx / d) * sp; q.y += (dy / d) * sp; return true;
    });
    [st.floats, st.rings, st.slashes, st.spins, st.marks].forEach((arr) => { for (let i = arr.length - 1; i >= 0; i--) { arr[i].life -= dt; if (arr[i].life <= 0) arr.splice(i, 1); } });
    st.bubbles.forEach((b) => { if (b.delay > 0) b.delay -= dt; else b.life -= dt; });
    st.bubbles = st.bubbles.filter((b) => b.life > 0);
    st.floats.forEach((f) => { f.y -= 14 * dt; });
    st.shake = Math.max(0, st.shake - 20 * dt); st.flash = Math.max(0, st.flash - dt);

    st.target = nearestObj(36);
    st.hint = st.target ? null : (st.fade ? null : findInter());
    st.saveT += dt; if (st.saveT > 5) { st.saveT = 0; save(); }
  }

  /* ------------------------------- 렌더 ------------------------------------ */
  function text(g, t, x, y, color, size, align) {
    g.font = `bold ${size}px ${FONT}`; g.textAlign = align || 'center'; g.textBaseline = 'middle';
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(20,20,40,.85)'; g.lineJoin = 'round';
    g.strokeText(t, x, y); g.fillStyle = color; g.fillText(t, x, y);
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // 말풍선(겉대사). tailX: 꼬리가 향할 x, below: 꼬리를 위쪽에 둘지
  function drawSay(g, x, y, text_, tailX, below, border) {
    g.font = `bold 6px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text_).width + 10, bx = Math.max(w / 2 + 2, Math.min(VW - w / 2 - 2, x));
    g.fillStyle = '#fff'; g.strokeStyle = border || '#1b1b2b'; g.lineWidth = 1;
    rrect(g, bx - w / 2, y - 6, w, 12, 3); g.fill(); g.stroke();
    g.beginPath();
    if (below) { g.moveTo(tailX - 3, y - 6); g.lineTo(tailX, y - 10); g.lineTo(tailX + 3, y - 6); }
    else { g.moveTo(tailX - 3, y + 6); g.lineTo(tailX, y + 10); g.lineTo(tailX + 3, y + 6); }
    g.fillStyle = '#fff'; g.fill(); g.stroke();
    g.fillRect(tailX - 2, below ? y - 6.5 : y + 5.5, 4, 1.5);
    g.fillStyle = '#1b1b2b'; g.fillText(text_, bx, y + 0.5);
  }
  function drawBubbles(g) {
    const p = st.player, below = p.y < 62;
    let say = null, think = null;
    st.bubbles.forEach((b) => { if (b.delay > 0) return; if (b.k === 'say') say = b; else think = b; });
    g.font = `bold 6px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fade = (b) => Math.min(1, b.life / 0.4, (b.max - b.life) / 0.12 + 0.2);
    const sayY = below ? p.y + 14 : p.y - 40, thinkY = below ? p.y + 32 : p.y - 58;
    if (say) { g.globalAlpha = fade(say); drawSay(g, p.x, sayY, say.text, p.x, below); g.globalAlpha = 1; }
    if (think) {
      const w = g.measureText(think.text).width + 14, x = Math.max(w / 2 + 2, Math.min(VW - w / 2 - 2, p.x));
      g.globalAlpha = fade(think);
      const bumps = Math.max(4, Math.round(w / 14)), circles = [];
      for (let i = 0; i <= bumps; i++) { const bx = x - w / 2 + 6 + (w - 12) * (i / bumps); circles.push([bx, thinkY - 2.5, 6], [bx, thinkY + 2.5, 6]); }
      const cy1 = below ? thinkY - 10 : thinkY + 10, cy2 = below ? thinkY - 15 : thinkY + 15;
      circles.push([x * 0.15 + p.x * 0.85, cy1, 2.2], [x * 0.05 + p.x * 0.95, cy2, 1.4]);
      g.fillStyle = '#6a7098';
      circles.forEach(([cx, cy, r]) => { g.beginPath(); g.arc(cx, cy, r + 1, 0, 6.283); g.fill(); });
      g.fillStyle = '#eef2ff';
      circles.forEach(([cx, cy, r]) => { g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.fill(); });
      g.fillStyle = '#3a3f66'; g.fillText(think.text, x, thinkY + 0.5);
      g.globalAlpha = 1;
    }
  }
  function drawObj(g, o) {
    const type = o.type, sc = o.scale || 1;
    const key = type === 'event' ? o.ev.sprite : type, a = ASSETS.objects[key];
    const prog = 1 - o.hp / o.maxHp;
    const idx = type === 'complaint' ? (Math.floor(st.time * 3) % 2) : type === 'event' ? (Math.floor(st.time * 4) % 2) : Math.min(a.frames - 1, Math.floor(prog * a.frames));
    const pop = Math.min(1, o.age / 0.25), sx = o.shake > 0 ? Math.sin(o.shake * 80) * 1.5 : 0;
    const oy = type === 'complaint' ? Math.sin(st.time * 4 + o.bob) * 1.5 - 2 : 0;
    if (type === 'event') {
      const pl = 1 + Math.sin(st.time * 8) * 0.15;
      g.strokeStyle = o.boss ? '#ff3b3b' : '#ffb03b'; g.lineWidth = 1.5; g.globalAlpha = 0.8;
      g.beginPath(); g.ellipse(o.x, o.y + 5, 13 * sc * pl, 6 * sc * pl, 0, 0, 7); g.stroke(); g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(o.x, o.y + 6, 6 * pop * sc, 2 * sc, 0, 0, 7); g.fill();
    g.save(); g.translate(o.x + sx, o.y + oy + 8); g.scale(pop * sc, pop * sc);
    g.drawImage(Gfx.objectFrame(key, idx), -ASSETS.objects.anchor[0], -ASSETS.objects.anchor[1] - 8);
    g.restore();
    if (o.hp < o.maxHp || type === 'event') {
      const w = o.boss ? 28 : 14, f = Math.max(0, o.hp / o.maxHp), top = o.y - 15 - (sc - 1) * 10;
      g.fillStyle = '#1b1b2b'; g.fillRect(o.x - w / 2 - 1, top, w + 2, 4);
      g.fillStyle = f > 0.5 ? '#6adf5a' : f > 0.25 ? '#ffd24a' : '#ff6a5a'; g.fillRect(o.x - w / 2, top + 1, w * f, 2);
    }
    if (o.boss) text(g, o.ev.name, o.x, o.y - 30, '#ff8b8b', 6.5);
    if (o.ttl && o.ttl < 10 && type !== 'event' && Math.floor(st.time * 4) % 2) { g.fillStyle = '#ff6a5a'; g.fillRect(o.x - 1, o.y - 20, 2, 2); }
  }
  function drawChar(g, fr, x, y, dir, bob) {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y, 6, 2.2, 0, 0, 7); g.fill();
    g.save(); g.translate(Math.round(x), Math.round(y + (bob || 0)));
    if (dir === 'left') g.scale(-1, 1);
    g.drawImage(fr, -ASSETS.player.anchor[0], -ASSETS.player.anchor[1] - 1);
    g.restore();
  }
  function drawPlayer(g) {
    const p = st.player, rk = R.rank();
    const bob = p.moving ? (p.step ? -1 : 0) : Math.sin(st.time * 3) * 0.4;
    if (st.fever > 0) { g.fillStyle = 'rgba(255,150,40,.55)'; g.beginPath(); g.ellipse(p.x, p.y, 8, 2.8, 0, 0, 7); g.fill(); }
    drawChar(g, Gfx.playerFrame(st.save.rank, p.dir, p.step), p.x, p.y, p.dir, bob);
    const label = rk.name, w = label.length * 7 + 8;
    g.fillStyle = 'rgba(20,20,40,.85)'; g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 29), w, 9);
    g.fillStyle = rk.palette.a === '#ffffff' ? rk.palette.c : rk.palette.a; g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 29), 2, 9);
    text(g, label, p.x + 1, p.y - 24.3, '#fff', 6.5);
  }
  function drawDark(g) {
    const f = darkFactor(); if (f <= 0.01) return;
    const maxA = MAP.kind === 'outdoor' ? 0.64 : MAP.kind === 'office' ? 0.58 : 0;
    if (!maxA) return;
    const lg = lightCv.getContext('2d');
    lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, VW, VH);
    lg.fillStyle = `rgba(8,10,40,${maxA * f})`; lg.fillRect(0, 0, VW, VH);
    lg.globalCompositeOperation = 'destination-out';
    const hole = (cx, cy, r, a) => {
      const gr = lg.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.55})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr; lg.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    (MAP.lights || []).forEach(([tx, ty, r]) => hole(tx * T, ty * T, r, 0.95));
    hole(st.player.x, st.player.y - 6, 52, 0.85); // 손전등
    lg.globalCompositeOperation = 'source-over';
    g.drawImage(lightCv, 0, 0);
    if (MAP.kind === 'office') { // 책상 스탠드 따뜻한 빛
      g.save(); g.globalCompositeOperation = 'lighter';
      (MAP.lights || []).slice(0, 3).forEach(([tx, ty, r]) => {
        const gr = g.createRadialGradient(tx * T, ty * T, 0, tx * T, ty * T, r);
        gr.addColorStop(0, `rgba(255,200,110,${0.22 * f})`); gr.addColorStop(1, 'rgba(255,200,110,0)');
        g.fillStyle = gr; g.fillRect(tx * T - r, ty * T - r, r * 2, r * 2);
      });
      g.restore();
    }
  }
  function drawTaskMarkers(g) {
    activeTasks().forEach((t) => {
      const rc = getRc(t), cx = rc.x + rc.w / 2, cy = rc.y + rc.h / 2, pl = 1 + Math.sin(st.time * 7) * 0.12;
      const col = t.kind === 'night' ? '#ffd24a' : '#ff6a5a';
      g.strokeStyle = col; g.lineWidth = 1.5; g.globalAlpha = 0.85;
      g.strokeRect(rc.x - 1 - pl, rc.y - 1 - pl, rc.w + 2 + pl * 2, rc.h + 2 + pl * 2); g.globalAlpha = 1;
      const f = Math.max(0, t.hp / t.maxHp), w = Math.max(16, rc.w), top = rc.y - 8;
      g.fillStyle = '#1b1b2b'; g.fillRect(cx - w / 2 - 1, top, w + 2, 4);
      g.fillStyle = f > 0.5 ? '#6adf5a' : f > 0.25 ? '#ffd24a' : '#ff6a5a'; g.fillRect(cx - w / 2, top + 1, w * f, 2);
      text(g, t.label, cx, top - 5, '#fff', 6);
      if (t.kind === 'night' && t.n.kind === 'call') { // 울리는 전화
        const sh = Math.sin(st.time * 40) * 1.2;
        text(g, '📞', cx + sh, rc.y - 22, '#fff', 9);
        drawSay(g, cx, rc.y - 36, t.n.sub.text, cx, false, '#e23b3b');
      }
    });
    if (st.visitor && st.mapId === 'office') drawSay(g, st.visitor.x, st.visitor.y - 30, st.visitor.text, st.visitor.x, false, '#2a7a3a');
  }
  function drawVisitMarkers(g) {
    st.visits.forEach((v) => {
      const rc = getRc(doorOf(v.b)), x = rc.x + rc.w / 2, y = 5 * T + 8 + Math.sin(st.time * 5) * 1.5;
      g.drawImage(Gfx.objectFrame('complaint', Math.floor(st.time * 3) % 2), x - 8, y - 8);
      text(g, `${v.b}동 ${v.unit}호`, x, y - 12, '#ffd24a', 5.8);
      const f = Math.max(0, v.ttl / v.maxTtl);
      g.fillStyle = '#1b1b2b'; g.fillRect(x - 10, y + 9, 20, 3); g.fillStyle = f > 0.3 ? '#ffd24a' : '#ff6a5a'; g.fillRect(x - 9, y + 10, 18 * f, 1);
    });
  }
  function render() {
    const g = ctx; g.setTransform(S, 0, 0, S, 0, 0); g.imageSmoothingEnabled = false;
    const sh = st.shake > 0 ? [(Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake] : [0, 0];
    g.save(); g.translate(sh[0], sh[1]);
    g.drawImage(layerOf(MAP), 0, 0);
    MAP.labels.forEach((l) => text(g, l.text, l.x * T, l.y * T, l.color || '#fff', 6.5));
    if (st.mapId === 'unit') text(g, st.unitVisit ? `${st.unitVisit.b}동 ${st.unitVisit.unit}호` : `${st.unitBld}동 세대 (접수된 민원 없음)`, VW / 2, 46, '#ffd24a', 8);
    if (st.mapId === 'office') text(g, st.phase === 'night' ? '🌙 야간 당직 — 박주임 혼자 근무' : '☀️ 주간 근무 — 동료와 함께', VW / 2, 46, st.phase === 'night' ? '#9fb4ff' : '#ffd24a', 8);

    st.marks.forEach((m) => {
      const k = 1 - m.life / m.max; g.globalAlpha = 1 - k; g.strokeStyle = m.color; g.lineWidth = 1.5;
      g.beginPath(); g.arc(m.x, m.y, 3 + k * 9, 0, 6.283); g.stroke(); g.globalAlpha = 1;
    });
    if (st.nav && st.nav.obj && st.objs.includes(st.nav.obj) && st.mapId === 'complex') {
      const o = st.nav.obj; g.strokeStyle = st.nav.auto ? '#ffd24a' : '#8fd0ff'; g.lineWidth = 1; g.setLineDash([1.5, 1.5]);
      g.beginPath(); g.moveTo(st.player.x, st.player.y - 6); g.lineTo(o.x, o.y); g.stroke(); g.setLineDash([]);
    }
    if (st.target) {
      const t = st.target, pulse = 1 + Math.sin(st.time * 8) * 0.12;
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 1; g.setLineDash([2, 2]);
      g.beginPath(); g.ellipse(t.x, t.y + 5, 9 * pulse, 4 * pulse, 0, 0, 7); g.stroke(); g.setLineDash([]);
    }

    const list = [];
    if (st.mapId === 'complex') st.objs.forEach((o) => list.push({ y: o.y + 6, d: () => drawObj(g, o) }));
    if (st.mapId === 'office') {
      st.npcs.forEach((n) => { if (n.state === 'gone') return; list.push({ y: n.y, d: () => {
        drawChar(g, Gfx.npcFrame(n.i, n.dir, n.state === 'leave' && n.delay <= 0 && n.pi < n.path.length ? (Math.floor(st.time * 6) % 2) : 0), n.x, n.y, n.dir, 0);
        text(g, NPCS[n.i].name, n.x, n.y - 21, '#cfd6ff', 5.5);
        if (n.bubble) drawSay(g, n.x, n.y - 34, n.bubble.text, n.x, false);
      } }); });
      if (st.visitor) { const v = st.visitor; list.push({ y: v.y, d: () => { drawChar(g, Gfx.npcFrame(v.idx, 'up', 0), v.x, v.y, 'up', 0); text(g, NPCS[v.idx].name, v.x, v.y - 21, '#9fe8b0', 5.5); } }); }
    }
    list.push({ y: st.player.y, d: () => drawPlayer(g) });
    list.sort((a, b) => a.y - b.y).forEach((e) => e.d());

    st.rings.forEach((r) => {
      const k = 1 - r.life / r.max, rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2));
      g.globalAlpha = Math.max(0, 1 - k); g.strokeStyle = r.color; g.lineWidth = r.thick || 2;
      g.beginPath(); g.arc(r.x, r.y, rad, 0, 6.283); g.stroke(); g.globalAlpha = 1;
    });
    st.spins.forEach((sp) => {
      const p = st.player, k = 1 - sp.life / sp.max, ang = k * 22;
      g.globalAlpha = 0.9 * (1 - k * 0.5); g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = ang + i * 2.094; g.strokeStyle = i ? '#cfd6e0' : '#ffd24a';
        g.beginPath(); g.moveTo(p.x, p.y - 6); g.lineTo(p.x + Math.cos(a) * sp.r, p.y - 6 + Math.sin(a) * sp.r); g.stroke();
      }
      g.globalAlpha = 0.35; g.strokeStyle = '#d6ffb0'; g.lineWidth = 1;
      g.beginPath(); g.arc(p.x, p.y - 6, sp.r, 0, 6.283); g.stroke(); g.globalAlpha = 1;
    });
    st.slashes.forEach((s) => {
      const k = 1 - s.life / s.max, a0 = s.a - 1.0 + k * 1.6;
      g.globalAlpha = 1 - k; g.strokeStyle = s.color; g.lineWidth = 2;
      g.beginPath(); g.arc(s.x, s.y, 15, a0, a0 + 0.9); g.stroke(); g.globalAlpha = 1;
    });
    st.parts.forEach((q) => {
      g.globalAlpha = Math.min(1, q.life / (q.max * 0.5));
      if (q.ch) { g.fillStyle = q.color; g.font = `bold ${q.size + 5}px ${FONT}`; g.textAlign = 'center'; g.fillText(q.ch, q.x, q.y); }
      else { g.fillStyle = q.color; g.fillRect(Math.round(q.x), Math.round(q.y), q.size, q.size); }
    });
    g.globalAlpha = 1;
    st.orbs.forEach((q) => {
      if (q.t < 0) return;
      g.fillStyle = q.color; g.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3);
      g.fillStyle = '#fff'; g.fillRect(Math.round(q.x), Math.round(q.y) - 1, 1, 1);
    });

    drawDark(g); // 야간 어둠 + 조명
    if (st.mapId === 'complex') drawVisitMarkers(g);
    drawTaskMarkers(g);
    // 상호작용 안내
    const hint = st.target ? { x: st.target.x, y: st.target.y - 22 - ((st.target.scale || 1) - 1) * 10, t: PJ.touch ? '탭!' : '[Space] 작업' }
      : st.hint && st.hint.kind !== 'visit' && st.hint.kind !== 'night' ? (() => { const rc = getRc(st.hint); return { x: rc.x + rc.w / 2, y: rc.y - 8, t: `${PJ.touch ? '✋' : '[Space]'} ${st.hint.label}` }; })() : null;
    if (hint) text(g, hint.t, hint.x, hint.y, '#fff', 6);

    st.floats.forEach((f) => { g.globalAlpha = Math.min(1, f.life / (f.max * 0.4)); text(g, f.text, f.x, f.y, f.color, f.size || 7); });
    g.globalAlpha = 1;
    drawBubbles(g);
    g.restore();

    if (st.fever > 0) {
      const a = 0.25 + Math.sin(st.time * 10) * 0.08, gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.85);
      gr.addColorStop(0, 'rgba(255,140,30,0)'); gr.addColorStop(1, `rgba(255,140,30,${a + 0.2})`); g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    }
    if (st.event && st.mapId === 'complex' && Math.sin(st.time * 6) > 0.2) {
      const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.4, VW / 2, VH / 2, VH * 0.9);
      gr.addColorStop(0, 'rgba(255,40,40,0)'); gr.addColorStop(1, 'rgba(255,40,40,.28)'); g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    }
    if (st.flash > 0) { g.globalAlpha = Math.min(0.6, st.flash); g.fillStyle = st.flashColor; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
    if (st.combo >= 2) {
      const sc = 1 + Math.min(0.3, st.comboT > 2.7 ? (st.comboT - 2.7) * 1.5 : 0);
      g.save(); g.translate(VW - 8, 14); g.scale(sc, sc);
      text(g, `COMBO x${st.combo}`, 0, 0, '#ffe066', 9, 'right');
      text(g, `보상 +${Math.round((R.comboMult() - 1) * 100)}%`, 0, 10, '#ffd0a0', 6, 'right');
      g.fillStyle = '#ffe066'; g.fillRect(-52, 16, 52 * (st.comboT / 3), 2); g.restore();
    }
    if (st.fade) { // 맵 전환 페이드
      const f = st.fade, a = f.sw ? 1 - (f.t - 0.22) / 0.22 : f.t / 0.22;
      g.globalAlpha = Math.max(0, Math.min(1, a)); g.fillStyle = '#000'; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1;
    }
  }

  /* ------------------------------ 화면 크기 -------------------------------- */
  function resize() {
    const stage = document.getElementById('stage');
    const aw = stage.clientWidth, ah = stage.clientHeight;
    const scale = Math.max(0.3, Math.min(aw / VW, ah / VH));
    cv.style.width = Math.floor(VW * scale) + 'px'; cv.style.height = Math.floor(VH * scale) + 'px';
    const dpr = window.devicePixelRatio || 1;
    S = Math.max(2, Math.round(scale * dpr));
    if (cv.width !== VW * S) { cv.width = VW * S; cv.height = VH * S; }
  }

  /* ------------------------------- 시작 ------------------------------------ */
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    update(dt); render();
    if (PJ.UI) PJ.UI.tick();
    requestAnimationFrame(loop);
  }
  function toggleAuto() {
    st.auto = !st.auto; st.save.auto = st.auto; st.nav = null;
    toast(st.auto ? '🤖 자동 순찰 ON — 알아서 일합니다' : '🕹️ 자동 순찰 OFF — 직접 조작');
    Audio.play(st.auto ? 'buy' : 'swing'); save(); PJ.UI.refresh();
  }
  // 상단 알림 바(이벤트/방문/야간 민원) 목록
  function alerts() {
    const out = [];
    if (st.event) out.push({ tone: 'event', text: st.event.def.text, ttl: st.event.obj.ttl, max: st.event.obj.maxTtl, hp: st.event.obj.hp, maxHp: st.event.obj.maxHp, sub: `×${EVENT.mult} 보상 + 피버` });
    st.visits.forEach((v) => out.push({ tone: 'visit', text: `🏠 ${v.text}`, ttl: v.ttl, max: v.maxTtl, sub: `${v.b}동 입구 → ${v.steps[Math.min(v.step, v.steps.length - 1)].label}` }));
    const a = st.night.active;
    if (a && st.phase === 'night') out.push({ tone: 'night', text: `${a.kind === 'call' ? '📞 전화' : '🛎️ 내방'} · ${a.sub.title}`, ttl: a.ttl, max: a.maxTtl, hp: a.task.hp, maxHp: a.task.maxHp, sub: `야간수당 ×${NIGHT.mult}` });
    return out;
  }
  function init() {
    st.save = PJ.Save.load(); st.auto = !!st.save.auto;
    Audio.setMuted(st.save.muted);
    cv = document.getElementById('cv'); ctx = cv.getContext('2d');
    buildSpots(); resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    MAP = CX; st.mapId = 'complex';
    st.player.x = CX.spawn.x * T + 8; st.player.y = CX.spawn.y * T + 10;
    PJ.UI.init();
    startDay(true);

    Input.on('action', basicAction); Input.on('skill', skillKey); Input.on('auto', toggleAuto);
    Input.on('menu', () => PJ.UI.togglePanel());
    cv.addEventListener('pointerdown', (e) => {
      Audio.unlock(); if (e.button > 0) return;
      const r = cv.getBoundingClientRect();
      tapAt((e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH);
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
    PJ.UI.refresh();
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(document.getElementById('stage'));
    requestAnimationFrame(loop);
  }

  PJ.Game = {
    init, save, upgrade, promote, basicAction, useSkill, skillKey, toggleAuto, alerts,
    setPaused(v) { if (!v && st.settling) return; st.paused = v; if (v) Input.reset(); },
    reset() { PJ.Save.reset(); st.save = null; window.removeEventListener('pagehide', save); location.reload(); },
    resize,
    _debug: { spots: () => spots, startEvent, tapAt, newVisit, spawnNight, goMap, switchMap, endShift, beginNight, setMin: (m) => { st.min = m; }, activeTasks, findInter, doorOf },
  };
})();
