/* ==========================================================================
 * game.js - 핵심 루프: 이동 / 자동이동 / 스폰 / 스킬 / 이벤트 / 보상 / 레벨업 / 전직 / 렌더
 * ========================================================================== */
(function () {
  'use strict';
  const PJ = window.PJ;
  const { RANKS, SKILLS, OBJECTS, ASSETS, MAP, ITEMS, EVENTS, EVENT, FEVER, SPEECH, Gfx, Audio, Input } = PJ;
  const T = ASSETS.tile, VW = MAP.w * T, VH = MAP.h * T;
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  const MAX_SKILL_LV = 15;
  const CARS = ['carRed', 'carBlue', 'carGray'];

  const st = (PJ.state = {
    save: null, time: 0, paused: false,
    player: { x: 0, y: 0, dir: 'down', step: 0, stepT: 0, moving: false, atk: 0, atkDir: 0 },
    objs: [], parts: [], floats: [], rings: [], slashes: [], spins: [], sched: [], orbs: [], bubbles: [], marks: [],
    cd: {}, cdMax: {}, gcd: 0, spawnT: {}, shake: 0, flash: 0, flashColor: '#fff', hitstop: 0,
    combo: 0, comboT: 0, target: null, saveT: 0, capToast: false,
    nav: null, auto: false, autoT: 0, fever: 0, event: null, evT: EVENT.first, bubbleCd: 0, pickT: 0, trailT: 0,
  });
  let cv, ctx, S = 2, staticLayer, spots = { grass: [], paved: [], path: [], parking: [] }, reach = null;

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
    // 스킬 실제 수치 (레벨·직급·장비 반영)
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
    // 다음 직급 전직 조건 검사
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
    s.exp += n;
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
  // 보상 입자가 박주임 쪽으로 빨려 들어오는 연출
  function orbs(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = 50 + Math.random() * 60;
      st.orbs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: -Math.random() * 0.08, color, size: 2 });
    }
  }
  const HIT_COL = { weed: ['#57b13f', '#3f8f2f', '#8bd36a', '#6a4a2a'], snow: ['#ffffff', '#dfeaff', '#b9d0f0'], complaint: ['#ffd24a', '#ff8b8b', '#ffffff'], event: ['#ff5a5a', '#ffd24a', '#ffffff'] };

  /* --------------------------- 말풍선(겉/속마음) ---------------------------- */
  const pick = (a) => a[(Math.random() * a.length) | 0];
  function speak(kind, force) {
    if (!force && (st.bubbleCd > 0 || Math.random() > 0.35)) return;
    st.bubbleCd = 3.2;
    const th = SPEECH.think;
    const say = kind === 'boss' ? pick(SPEECH.bossSay) : kind === 'event' ? pick(SPEECH.event) : pick(SPEECH.say);
    const pool = (th[kind] || []).concat(th.any);
    st.bubbles = [{ k: 'say', text: say, life: 2.4, max: 2.4, delay: 0 }, { k: 'think', text: pick(pool), life: 2.8, max: 2.8, delay: 0.55 }];
  }

  /* ----------------------- 스폰 구역 / 길찾기 ------------------------------- */
  const walk = (x, y) => !MAP.solid(x, y);
  function buildReach() { // 시작점에서 걸어갈 수 있는 타일 (4방향 flood fill)
    reach = Array.from({ length: MAP.h }, () => Array(MAP.w).fill(false));
    const q = [[MAP.spawn.x, MAP.spawn.y]]; reach[MAP.spawn.y][MAP.spawn.x] = true;
    while (q.length) {
      const [x, y] = q.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (walk(nx, ny) && !reach[ny][nx]) { reach[ny][nx] = true; q.push([nx, ny]); }
      });
    }
  }
  // 오브젝트가 놓일 수 있는 타일인가: 이동 가능 + 도달 가능 + 장식(차/나무 등) 없음 + 막다른 틈 아님
  function spawnable(x, y) {
    if (x < 1 || y < 1 || x >= MAP.w - 1 || y >= MAP.h - 1) return false;
    if (!walk(x, y) || !reach[y][x]) return false;
    const d = MAP.deco[y][x]; if (d) return false;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => walk(x + dx, y + dy)).length;
    return open >= 3; // 건물/나무 사이 좁고 막힌 틈 제외
  }
  function buildSpots() {
    buildReach();
    spots = { grass: [], paved: [], path: [], parking: [] };
    for (let y = 1; y < MAP.h - 1; y++) for (let x = 1; x < MAP.w - 1; x++) {
      if (!spawnable(x, y)) continue;
      const g = MAP.ground[y][x];
      if (g === 'grass' || g === 'grass2') spots.grass.push([x, y]);
      else if (g === 'path') { spots.path.push([x, y]); spots.paved.push([x, y]); }
      else if (g === 'parking' || g === 'parkLine') {
        if (CARS.includes(MAP.deco[y][x])) continue; // (이중 안전장치) 차량 타일 제외
        spots.paved.push([x, y]); spots.parking.push([x, y]);
      }
    }
  }
  function findPath(sx, sy, tx, ty) { // BFS (대각선은 양옆이 뚫려 있을 때만)
    if (!walk(tx, ty)) return null;
    const key = (x, y) => y * MAP.w + x, prev = new Map(); prev.set(key(sx, sy), null);
    const q = [[sx, sy]];
    for (let i = 0; i < q.length; i++) {
      const [x, y] = q[i];
      if (x === tx && y === ty) break;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!walk(nx, ny) || prev.has(key(nx, ny))) continue;
        if (dx && dy && (!walk(x + dx, y) || !walk(x, y + dy))) continue;
        prev.set(key(nx, ny), [x, y]); q.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const path = []; let c = [tx, ty];
    while (c && !(c[0] === sx && c[1] === sy)) { path.push(c); c = prev.get(key(c[0], c[1])); }
    return path.reverse();
  }
  const playerTile = () => [Math.floor(st.player.x / T), Math.floor((st.player.y - 3) / T)];

  /* ----------------------------- 오브젝트 ---------------------------------- */
  const countOf = (type) => st.objs.filter((o) => o.type === type).length;
  const maxOf = (type) => OBJECTS[type].max + st.save.rank * (type === 'complaint' ? 1 : 2);
  function free(x, y) { return !st.objs.some((o) => Math.hypot(o.x - x, o.y - y) < 15); }
  function spawn(type, silent) {
    if (countOf(type) >= maxOf(type)) return false;
    const list = spots[OBJECTS[type].zone], p = st.player;
    if (!list.length) return false;
    for (let tries = 0; tries < 30; tries++) {
      const [tx, ty] = list[(Math.random() * list.length) | 0];
      if (!spawnable(tx, ty)) continue;
      const x = tx * T + 8, y = ty * T + 8;
      if (!silent && Math.hypot(x - p.x, y - (p.y - 6)) < 36) continue;
      if (!free(x, y)) continue;
      const hp = R.objHp({ type });
      st.objs.push({ type, x, y, hp, maxHp: hp, shake: 0, age: silent ? 1 : 0, ttl: OBJECTS[type].ttl || 0, bob: Math.random() * 6 });
      if (!silent) burst(x, y, 6, ['#fff', '#ffe9a0'], 30, 0.4);
      return true;
    }
    return false;
  }
  function nearestObj(reachPx, sk) {
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

  function dropItem(o) {
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
      st.floats.push({ x: o.x, y: o.y - 28, text: `🎁 ${it.name}!`, color: '#ff9bd0', life: 1.6, max: 1.6, size: 8 });
    }
  }

  function kill(o, info) {
    const i = st.objs.indexOf(o); if (i < 0) return;
    st.objs.splice(i, 1);
    const isEv = o.type === 'event';
    const prevCombo = st.comboT > 0 ? st.combo : 0;
    st.combo = prevCombo + 1; st.comboT = 3;
    const bonus = isEv ? EVENT.mult : (info && info.bonus) || 1;
    const rw = R.reward(o, bonus);
    st.save.gold += rw.gold; st.save.stats[o.type]++;
    if (o.boss) st.save.stats.boss++;
    burst(o.x, o.y, isEv ? 28 : 16, HIT_COL[o.type], isEv ? 120 : 90, 0.7, o.type === 'complaint' ? '♥' : null);
    orbs(o.x, o.y, Math.min(9, 3 + Math.floor(rw.exp / 25)), '#5ac8ff');
    orbs(o.x, o.y, Math.min(7, 2 + Math.floor(rw.gold / 25)), '#ffd24a');
    st.floats.push({ x: o.x - 6, y: o.y - 12, text: `+${rw.exp} EXP`, color: '#7fd3ff', life: 1.1, max: 1.1, size: 7 });
    st.floats.push({ x: o.x + 6, y: o.y - 4, text: `+${rw.gold}G`, color: '#ffd24a', life: 1.2, max: 1.2, size: 7 });
    if (isEv) st.floats.push({ x: o.x, y: o.y - 24, text: `긴급 보너스 x${EVENT.mult}!`, color: '#ff9b6b', life: 1.4, max: 1.4, size: 8 });
    else if (bonus > 1) st.floats.push({ x: o.x, y: o.y - 22, text: o.type === 'complaint' ? '친절 보너스!' : '고효율!', color: '#ff9bd0', life: 1.1, max: 1.1, size: 7 });
    if ([5, 10, 20, 30].includes(st.combo)) {
      st.floats.push({ x: st.player.x, y: st.player.y - 40, text: `COMBO x${st.combo}!`, color: '#ffe066', life: 1.2, max: 1.2, size: 9 });
      st.shake = Math.max(st.shake, 3); Audio.play('crit');
    }
    st.shake = Math.max(st.shake, isEv ? 5 : 2); st.hitstop = isEv ? 0.08 : 0.04;
    Audio.play('kill'); setTimeout(() => Audio.play('coin'), 120);
    dropItem(o);
    if (isEv) winEvent(o); else speak(o.type);
    addExp(rw.exp);
    changed(); save();
  }

  /* ------------------------ 돌발 당직 이벤트 / 보스 ------------------------- */
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
    Audio.play('alarm');
    st.flash = 0.35; st.flashColor = '#ff3b3b';
    burst(x, y, 14, ['#ff5a5a', '#ffd24a'], 80, 0.6);
    if (st.auto === false) speak('event', true);
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

  /* ------------------------------- 스킬 ------------------------------------ */
  function startCd(id, s) { st.cd[id] = st.cdMax[id] = s; }
  function useSkill(id) {
    const sk = SKILLS[id], p = st.player;
    if (!R.isUnlocked(id)) { toast(`🔒 Lv.${sk.unlockLv} 에 해금됩니다`); Audio.play('error'); return false; }
    if ((st.cd[id] || 0) > 0) return false;
    const s = R.skillStats(id);
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
    } else { // area
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
  function basicAction() {
    if (st.paused || st.gcd > 0) return;
    const p = st.player, t = nearestObj(36);
    if (!t) { // 헛스윙
      st.gcd = 0.25; p.atk = 0.15; p.atkDir = { right: 0, down: 1.57, left: 3.14, up: -1.57 }[p.dir];
      st.slashes.push({ x: p.x, y: p.y - 6, a: p.atkDir, life: 0.14, max: 0.14, color: '#ffffff88' });
      Audio.play('swing');
      return;
    }
    if (useSkill(basicId(t))) st.gcd = 0.08;
  }
  function skillKey(n) { if (st.paused) return; useSkill(['mower', 'blower', 'kind'][n - 1]); }

  /* ------------------- 자동 이동(탭) / 자동 순찰(Auto) ---------------------- */
  function makeNav(o, tx, ty, auto) {
    const [sx, sy] = playerTile();
    const gx = o ? Math.floor(o.x / T) : tx, gy = o ? Math.floor(o.y / T) : ty;
    const path = findPath(sx, sy, gx, gy);
    if (!path) return null;
    return { obj: o || null, path, pi: 0, auto: !!auto };
  }
  function tapAt(wx, wy) {
    if (st.paused) return;
    let best = null, bd = 15;
    st.objs.forEach((o) => { const d = Math.hypot(o.x - wx, o.y - wy) - (o.scale ? 4 : 0); if (d < bd) { bd = d; best = o; } });
    let nav;
    if (best) { nav = makeNav(best); st.marks.push({ x: best.x, y: best.y, life: 0.5, max: 0.5, color: '#fff' }); }
    else {
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      nav = makeNav(null, tx, ty);
      if (nav) st.marks.push({ x: tx * T + 8, y: ty * T + 8, life: 0.5, max: 0.5, color: '#8fd0ff' });
    }
    if (nav) st.nav = nav; else Audio.play('error');
  }
  // 오브젝트까지의 작업 사정거리
  const workReach = (o) => R.skillStats(basicId(o)).reach - 6;

  function navUpdate(dt) {
    const p = st.player, n = st.nav;
    if (!n) return false;
    if (n.obj) {
      if (!st.objs.includes(n.obj)) { st.nav = null; return false; }
      const d = Math.hypot(n.obj.x - p.x, n.obj.y - (p.y - 6)) - 8 * (n.obj.scale || 1);
      if (d <= workReach(n.obj)) { // 도착 → 작업
        faceTo(n.obj.x, n.obj.y); p.moving = false;
        useSkill(basicId(n.obj));
        return true;
      }
    }
    if (n.pi >= n.path.length) { if (!n.obj) st.nav = null; else st.nav = null; return false; }
    const w = n.path[n.pi], wx = w[0] * T + 8, wy = w[1] * T + 10;
    const dx = wx - p.x, dy = wy - p.y, dist = Math.hypot(dx, dy);
    if (dist < 2) { n.pi++; return true; }
    const sp = R.speed() * dt, step = Math.min(dist, sp), ax = dx / dist, ay = dy / dist;
    const nx = p.x + ax * step, ny = p.y + ay * step;
    if (!blocked(nx, p.y)) p.x = nx;
    if (!blocked(p.x, ny)) p.y = ny;
    p.moving = true;
    if (!(p.atk > 0)) p.dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : (ay < 0 ? 'up' : 'down');
    p.stepT += dt; if (p.stepT > 0.16) { p.stepT = 0; p.step ^= 1; }
    return true;
  }
  function autoThink(dt) {
    if (!st.auto) return;
    st.autoT -= dt; if (st.autoT > 0) return; st.autoT = 0.25;
    const p = st.player, cx = p.x, cy = p.y - 6;
    // 1) 자동 스킬
    ['mower', 'blower', 'kind'].forEach((id) => {
      if (!R.isUnlocked(id) || (st.cd[id] || 0) > 0) return;
      const sk = SKILLS[id], s = R.skillStats(id);
      if (sk.type === 'area') {
        const n = st.objs.filter((o) => R.matches(sk, o) && Math.hypot(o.x - cx, o.y - cy) <= s.radius + 6).length;
        const tgt = st.nav && st.nav.obj && R.matches(sk, st.nav.obj);
        if (n >= 2 || (n >= 1 && tgt)) useSkill(id);
      } else if (nearestObj(s.reach, sk)) useSkill(id);
    });
    // 2) 목표 선정: 돌발 > 민원 > 가까운 순
    const cur = st.nav;
    if (cur && !cur.auto) return; // 수동 이동 중에는 방해하지 않음
    if (cur && cur.obj && st.objs.includes(cur.obj) && cur.obj.type === 'event') return;
    let best = null, bs = 1e9;
    st.objs.forEach((o) => {
      const d = Math.hypot(o.x - cx, o.y - cy);
      const sc = d - (o.type === 'event' ? 300 : o.type === 'complaint' ? 40 : 0);
      if (sc < bs) { bs = sc; best = o; }
    });
    if (!best) return;
    if (cur && cur.obj === best) return;
    if (cur && cur.obj && st.objs.includes(cur.obj)) {
      const cd = Math.hypot(cur.obj.x - cx, cur.obj.y - cy) - (cur.obj.type === 'complaint' ? 40 : 0);
      if (cur.obj.type !== 'event' && cd < bs + 24) return; // 이미 비슷하게 가까운 목표가 있으면 유지
    }
    const nav = makeNav(best, 0, 0, true);
    if (nav) st.nav = nav;
  }

  /* ------------------------------- 업데이트 -------------------------------- */
  function blocked(x, y) {
    const hw = 4;
    return MAP.solid(Math.floor((x - hw) / T), Math.floor((y - 6) / T)) || MAP.solid(Math.floor((x + hw) / T), Math.floor((y - 6) / T)) ||
      MAP.solid(Math.floor((x - hw) / T), Math.floor(y / T)) || MAP.solid(Math.floor((x + hw) / T), Math.floor(y / T));
  }
  function update(dt) {
    if (st.paused) return;
    if (st.hitstop > 0) { st.hitstop -= dt; return; }
    st.time += dt;
    const rate = st.fever > 0 ? FEVER.rate : 1;
    st.gcd = Math.max(0, st.gcd - dt * rate);
    Object.keys(st.cd).forEach((k) => { if (st.cd[k] > 0) st.cd[k] = Math.max(0, st.cd[k] - dt * rate); });
    if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) st.combo = 0; }
    st.bubbleCd = Math.max(0, st.bubbleCd - dt);
    if (st.fever > 0) {
      st.fever = Math.max(0, st.fever - dt);
      st.trailT -= dt;
      if (st.trailT <= 0) { st.trailT = 0.05; burst(st.player.x, st.player.y - 2, 1, ['#ff9b3b', '#ffd24a'], 18, 0.35); }
    }

    // 이동: 수동 입력 > 자동이동
    const p = st.player, a = Input.axis();
    p.moving = false;
    if (a.x || a.y) {
      st.nav = null;
      const sp = R.speed();
      const nx = p.x + a.x * sp * dt, ny = p.y + a.y * sp * dt;
      if (!blocked(nx, p.y)) p.x = nx;
      if (!blocked(p.x, ny)) p.y = ny;
      p.moving = true;
      if (!(p.atk > 0)) p.dir = Math.abs(a.x) > Math.abs(a.y) ? (a.x < 0 ? 'left' : 'right') : (a.y < 0 ? 'up' : 'down');
      p.stepT += dt; if (p.stepT > 0.16) { p.stepT = 0; p.step ^= 1; }
    } else if (st.nav) navUpdate(dt);
    if (!p.moving) { p.step = 0; p.stepT = 0; }
    p.atk = Math.max(0, p.atk - dt);
    if (Input.held.action) basicAction();
    autoThink(dt);

    // 스폰 / 수명
    Object.keys(OBJECTS).forEach((type) => {
      st.spawnT[type] = (st.spawnT[type] || 0) - dt;
      if (st.spawnT[type] <= 0) {
        spawn(type);
        st.spawnT[type] = OBJECTS[type].interval * (1 - 0.1 * Math.min(3, st.save.rank)) * (0.7 + Math.random() * 0.6);
      }
    });
    // 돌발 이벤트 타이머
    if (!st.event) { st.evT -= dt; if (st.evT <= 0) startEvent(); }
    for (let i = st.objs.length - 1; i >= 0; i--) {
      const o = st.objs[i];
      o.age += dt; o.shake = Math.max(0, o.shake - dt);
      if (o.ttl) {
        o.ttl -= dt;
        if (o.ttl <= 0) {
          if (o.type === 'event') failEvent(o);
          else { burst(o.x, o.y, 8, ['#aaa', '#ddd'], 40, 0.5); st.objs.splice(i, 1); }
        }
      }
    }
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
    st.saveT += dt; if (st.saveT > 5) { st.saveT = 0; save(); }
  }

  /* ------------------------------- 렌더 ------------------------------------ */
  function buildStatic() {
    staticLayer = document.createElement('canvas'); staticLayer.width = VW; staticLayer.height = VH;
    const g = staticLayer.getContext('2d');
    for (let y = 0; y < MAP.h; y++) for (let x = 0; x < MAP.w; x++) {
      g.drawImage(Gfx.tile(MAP.ground[y][x]), x * T, y * T);
      if (MAP.deco[y][x]) g.drawImage(Gfx.tile(MAP.deco[y][x]), x * T, y * T);
    }
  }
  function text(g, t, x, y, color, size, align) {
    g.font = `bold ${size}px ${FONT}`; g.textAlign = align || 'center'; g.textBaseline = 'middle';
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(20,20,40,.85)'; g.lineJoin = 'round';
    g.strokeText(t, x, y); g.fillStyle = color; g.fillText(t, x, y);
  }
  function drawObj(g, o) {
    const type = o.type, sc = o.scale || 1;
    const key = type === 'event' ? o.ev.sprite : type, a = ASSETS.objects[key];
    const prog = 1 - o.hp / o.maxHp;
    const idx = type === 'complaint' ? (Math.floor(st.time * 3) % 2) : type === 'event' ? (Math.floor(st.time * 4) % 2) : Math.min(a.frames - 1, Math.floor(prog * a.frames));
    const pop = Math.min(1, o.age / 0.25), sx = o.shake > 0 ? Math.sin(o.shake * 80) * 1.5 : 0;
    const oy = type === 'complaint' ? Math.sin(st.time * 4 + o.bob) * 1.5 - 2 : 0;
    if (type === 'event') { // 긴급 링
      const pl = 1 + Math.sin(st.time * 8) * 0.15;
      g.strokeStyle = o.boss ? '#ff3b3b' : '#ffb03b'; g.lineWidth = 1.5; g.globalAlpha = 0.8;
      g.beginPath(); g.ellipse(o.x, o.y + 5, 13 * sc * pl, 6 * sc * pl, 0, 0, 7); g.stroke(); g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(o.x, o.y + 6, 6 * pop * sc, 2 * sc, 0, 0, 7); g.fill();
    g.save(); g.translate(o.x + sx, o.y + oy + 8); g.scale(pop * sc, pop * sc);
    g.drawImage(Gfx.objectFrame(key, idx), -ASSETS.objects.anchor[0], -ASSETS.objects.anchor[1] - 8);
    g.restore();
    if (o.hp < o.maxHp || type === 'event') { // 게이지
      const w = o.boss ? 28 : 14, f = Math.max(0, o.hp / o.maxHp), top = o.y - 15 - (sc - 1) * 10;
      g.fillStyle = '#1b1b2b'; g.fillRect(o.x - w / 2 - 1, top, w + 2, 4);
      g.fillStyle = f > 0.5 ? '#6adf5a' : f > 0.25 ? '#ffd24a' : '#ff6a5a'; g.fillRect(o.x - w / 2, top + 1, w * f, 2);
    }
    if (o.boss) text(g, o.ev.name, o.x, o.y - 30, '#ff8b8b', 6.5);
    if (o.ttl && o.ttl < 10 && type !== 'event' && Math.floor(st.time * 4) % 2) { g.fillStyle = '#ff6a5a'; g.fillRect(o.x - 1, o.y - 20, 2, 2); }
  }
  function drawPlayer(g) {
    const p = st.player, rk = R.rank(), an = ASSETS.player.anchor;
    const bob = p.moving ? (p.step ? -1 : 0) : Math.sin(st.time * 3) * 0.4;
    g.fillStyle = st.fever > 0 ? 'rgba(255,150,40,.55)' : 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.x, p.y, st.fever > 0 ? 8 : 6, 2.4, 0, 0, 7); g.fill();
    const fr = Gfx.playerFrame(st.save.rank, p.dir, p.step);
    g.save(); g.translate(Math.round(p.x), Math.round(p.y + bob));
    if (p.dir === 'left') g.scale(-1, 1);
    g.drawImage(fr, -an[0], -an[1] - 1);
    g.restore();
    const label = rk.name, w = label.length * 7 + 8;
    g.fillStyle = 'rgba(20,20,40,.85)'; g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 29), w, 9);
    g.fillStyle = rk.palette.a === '#ffffff' ? rk.palette.c : rk.palette.a; g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 29), 2, 9);
    text(g, label, p.x + 1, p.y - 24.3, '#fff', 6.5);
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function drawBubbles(g) {
    const p = st.player, below = p.y < 62;
    let say = null, think = null;
    st.bubbles.forEach((b) => { if (b.delay > 0) return; if (b.k === 'say') say = b; else think = b; });
    g.font = `bold 6px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fade = (b) => Math.min(1, b.life / 0.4, (b.max - b.life) / 0.12 + 0.2);
    const sayY = below ? p.y + 14 : p.y - 40, thinkY = below ? p.y + 32 : p.y - 58;
    if (say) {
      const w = g.measureText(say.text).width + 10, x = Math.max(w / 2 + 2, Math.min(VW - w / 2 - 2, p.x));
      g.globalAlpha = fade(say);
      g.fillStyle = '#fff'; g.strokeStyle = '#1b1b2b'; g.lineWidth = 1;
      rrect(g, x - w / 2, sayY - 6, w, 12, 3); g.fill(); g.stroke();
      g.beginPath(); // 꼬리
      if (below) { g.moveTo(p.x - 3, sayY - 6); g.lineTo(p.x, sayY - 10); g.lineTo(p.x + 3, sayY - 6); }
      else { g.moveTo(p.x - 3, sayY + 6); g.lineTo(p.x, sayY + 10); g.lineTo(p.x + 3, sayY + 6); }
      g.fillStyle = '#fff'; g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(p.x - 2, below ? sayY - 6.5 : sayY + 5.5, 4, 1.5);
      g.fillStyle = '#1b1b2b'; g.fillText(say.text, x, sayY + 0.5);
      g.globalAlpha = 1;
    }
    if (think) {
      const w = g.measureText(think.text).width + 14, x = Math.max(w / 2 + 2, Math.min(VW - w / 2 - 2, p.x));
      g.globalAlpha = fade(think);
      // 구름: 원들을 먼저 굵은 테두리색으로 칠한 뒤 안쪽을 채워 외곽선만 남김
      const bumps = Math.max(4, Math.round(w / 14));
      const circles = [];
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
  function render() {
    const g = ctx; g.setTransform(S, 0, 0, S, 0, 0); g.imageSmoothingEnabled = false;
    const sh = st.shake > 0 ? [(Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake] : [0, 0];
    g.save(); g.translate(sh[0], sh[1]);
    g.drawImage(staticLayer, 0, 0);
    MAP.labels.forEach((l) => text(g, l.text, l.x * T, l.y * T, l.color, 6.5));

    // 탭 마커 / 자동이동 경로 목적지
    st.marks.forEach((m) => {
      const k = 1 - m.life / m.max; g.globalAlpha = 1 - k; g.strokeStyle = m.color; g.lineWidth = 1.5;
      g.beginPath(); g.arc(m.x, m.y, 3 + k * 9, 0, 6.283); g.stroke(); g.globalAlpha = 1;
    });
    if (st.nav && st.nav.obj && st.objs.includes(st.nav.obj)) {
      const o = st.nav.obj; g.strokeStyle = st.nav.auto ? '#ffd24a' : '#8fd0ff'; g.lineWidth = 1; g.setLineDash([1.5, 1.5]);
      g.beginPath(); g.moveTo(st.player.x, st.player.y - 6); g.lineTo(o.x, o.y); g.stroke(); g.setLineDash([]);
    }
    // 타깃 링
    if (st.target) {
      const t = st.target, pulse = 1 + Math.sin(st.time * 8) * 0.12;
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 1; g.setLineDash([2, 2]);
      g.beginPath(); g.ellipse(t.x, t.y + 5, 9 * pulse, 4 * pulse, 0, 0, 7); g.stroke(); g.setLineDash([]);
    }

    const list = st.objs.map((o) => ({ y: o.y + 6, d: () => drawObj(g, o) }));
    list.push({ y: st.player.y, d: () => drawPlayer(g) });
    list.sort((a, b) => a.y - b.y).forEach((e) => e.d());

    // 이펙트
    st.rings.forEach((r) => {
      const k = 1 - r.life / r.max, rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2));
      g.globalAlpha = Math.max(0, 1 - k); g.strokeStyle = r.color; g.lineWidth = r.thick || 2;
      g.beginPath(); g.arc(r.x, r.y, rad, 0, 6.283); g.stroke(); g.globalAlpha = 1;
    });
    st.spins.forEach((sp) => {
      const p = st.player, k = 1 - sp.life / sp.max, ang = k * 22;
      g.globalAlpha = 0.9 * (1 - k * 0.5); g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = ang + i * 2.094;
        g.strokeStyle = i ? '#cfd6e0' : '#ffd24a';
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
    st.orbs.forEach((q) => { // 빨려 들어오는 EXP(파랑)/골드(노랑) 입자
      if (q.t < 0) return;
      g.fillStyle = q.color; g.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3);
      g.fillStyle = '#fff'; g.fillRect(Math.round(q.x), Math.round(q.y) - 1, 1, 1);
    });
    st.floats.forEach((f) => { g.globalAlpha = Math.min(1, f.life / (f.max * 0.4)); text(g, f.text, f.x, f.y, f.color, f.size || 7); });
    g.globalAlpha = 1;
    drawBubbles(g);
    g.restore();

    // 화면 효과
    if (st.fever > 0) { // 피버: 주황 테두리
      const a = 0.25 + Math.sin(st.time * 10) * 0.08;
      const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.85);
      gr.addColorStop(0, 'rgba(255,140,30,0)'); gr.addColorStop(1, `rgba(255,140,30,${a + 0.2})`);
      g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    }
    if (st.event && Math.sin(st.time * 6) > 0.2) {
      const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.4, VW / 2, VH / 2, VH * 0.9);
      gr.addColorStop(0, 'rgba(255,40,40,0)'); gr.addColorStop(1, 'rgba(255,40,40,.28)');
      g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    }
    if (st.flash > 0) { g.globalAlpha = Math.min(0.6, st.flash); g.fillStyle = st.flashColor; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
    if (st.combo >= 2) {
      const sc = 1 + Math.min(0.3, st.comboT > 2.7 ? (st.comboT - 2.7) * 1.5 : 0);
      g.save(); g.translate(VW - 8, 14); g.scale(sc, sc);
      text(g, `COMBO x${st.combo}`, 0, 0, '#ffe066', 9, 'right');
      text(g, `보상 +${Math.round((R.comboMult() - 1) * 100)}%`, 0, 10, '#ffd0a0', 6, 'right');
      g.fillStyle = '#ffe066'; g.fillRect(-52, 16, 52 * (st.comboT / 3), 2);
      g.restore();
    }
    if (st.target) text(g, PJ.touch ? '탭!' : '[Space] 작업', st.target.x, st.target.y - 22 - ((st.target.scale || 1) - 1) * 10, '#fff', 6);
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
  function init() {
    st.save = PJ.Save.load(); st.auto = !!st.save.auto;
    Audio.setMuted(st.save.muted);
    cv = document.getElementById('cv'); ctx = cv.getContext('2d');
    buildSpots(); buildStatic(); resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    st.player.x = MAP.spawn.x * T + 8; st.player.y = MAP.spawn.y * T + 10;
    ['weed', 'snow', 'complaint'].forEach((t) => { const n = Math.ceil(OBJECTS[t].max / 2); for (let i = 0; i < n; i++) spawn(t, true); });

    Input.on('action', basicAction); Input.on('skill', skillKey); Input.on('auto', toggleAuto);
    Input.on('menu', () => PJ.UI.togglePanel());
    // 캔버스 탭/클릭 → 그 위치(오브젝트)까지 자동 이동 후 작업
    cv.addEventListener('pointerdown', (e) => {
      Audio.unlock(); if (e.button > 0) return;
      const r = cv.getBoundingClientRect();
      tapAt((e.clientX - r.left) / r.width * VW, (e.clientY - r.top) / r.height * VH);
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
    PJ.UI.init(); PJ.UI.refresh();
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(document.getElementById('stage'));
    requestAnimationFrame(loop);
  }

  PJ.Game = {
    init, save, upgrade, promote, basicAction, useSkill, skillKey, toggleAuto,
    setPaused(v) { st.paused = v; if (v) Input.reset(); },
    reset() { PJ.Save.reset(); st.save = null; window.removeEventListener('pagehide', save); location.reload(); },
    resize,
    // 테스트/디버그용
    _debug: { spots: () => spots, findPath, spawnable, startEvent, tapAt },
  };
})();
