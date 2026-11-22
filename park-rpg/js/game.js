/* ==========================================================================
 * game.js - 핵심 루프: 이동 / 스폰 / 스킬 / 보상 / 레벨업 / 전직 / 렌더
 * ========================================================================== */
(function () {
  'use strict';
  const PJ = window.PJ;
  const { RANKS, SKILLS, OBJECTS, ASSETS, MAP, Gfx, Audio, Input } = PJ;
  const T = ASSETS.tile, VW = MAP.w * T, VH = MAP.h * T;
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  const MAX_SKILL_LV = 15;

  const st = (PJ.state = {
    save: null, time: 0, paused: false,
    player: { x: 0, y: 0, dir: 'down', step: 0, stepT: 0, moving: false, atk: 0, atkDir: 0 },
    objs: [], parts: [], floats: [], rings: [], slashes: [], spins: [], sched: [],
    cd: {}, cdMax: {}, gcd: 0, spawnT: {}, shake: 0, flash: 0, flashColor: '#fff', hitstop: 0,
    combo: 0, comboT: 0, target: null, saveT: 0, capToast: false,
  });
  let cv, ctx, S = 2, staticLayer, spots = { grass: [], paved: [], path: [] };

  /* ------------------------------ 규칙 계산 -------------------------------- */
  const R = (PJ.Rules = {
    rank: () => RANKS[st.save.rank],
    needExp: (lv) => Math.round(20 * Math.pow(lv, 1.5)),
    maxSkillLv: () => Math.min(MAX_SKILL_LV, 2 + Math.floor(st.save.level / 2)),
    skillLv: (id) => st.save.skills[id] || 1,
    isUnlocked: (id) => st.save.level >= SKILLS[id].unlockLv,
    upgradeCost: (id) => Math.round(SKILLS[id].baseCost * Math.pow(1.4, R.skillLv(id) - 1)),
    // 스킬 실제 수치 (레벨·직급 반영)
    skillStats(id) {
      const sk = SKILLS[id], lv = R.skillLv(id), rk = R.rank();
      return {
        lv,
        dmg: sk.dmg * (1 + 0.15 * (lv - 1)) * rk.power * (1 + 0.02 * (st.save.level - 1)),
        cd: sk.cd * Math.max(0.5, 1 - 0.03 * (lv - 1)),
        radius: (sk.radius || 0) + 3 * (lv - 1) + rk.reachBonus,
        reach: (sk.reach || 0) + rk.reachBonus,
        bonus: sk.bonus ? 1 + (sk.bonus - 1) * (1 + 0.1 * (lv - 1)) : 1,
      };
    },
    objHp: (type) => OBJECTS[type].hp * R.rank().hpMult,
    reward(type, bonus) {
      const d = OBJECTS[type], rk = R.rank(), lv = st.save.level;
      const cm = 1 + Math.min(0.5, 0.05 * Math.max(0, st.combo - 1));
      return {
        exp: Math.max(1, Math.round(d.exp * (1 + 0.18 * (lv - 1)) * rk.expMult * bonus * cm)),
        gold: Math.max(1, Math.round(d.gold * (1 + 0.12 * (lv - 1)) * rk.goldMult * bonus)),
      };
    },
    // 다음 직급 전직 조건 검사
    promoteInfo() {
      const next = RANKS[st.save.rank + 1];
      if (!next) return null;
      const q = next.promote, s = st.save;
      const checks = [
        { label: `레벨 ${q.lv} 달성`, now: s.level, need: q.lv, ok: s.level >= q.lv },
        { label: '골드', now: s.gold, need: q.gold, ok: s.gold >= q.gold },
        { label: '잡초 처리', now: s.stats.weed, need: q.tasks.weed, ok: s.stats.weed >= q.tasks.weed },
        { label: '눈 처리', now: s.stats.snow, need: q.tasks.snow, ok: s.stats.snow >= q.tasks.snow },
        { label: '민원 처리', now: s.stats.complaint, need: q.tasks.complaint, ok: s.stats.complaint >= q.tasks.complaint },
      ];
      return { next, checks, ok: checks.every((c) => c.ok) };
    },
  });
  const toast = (m, kind) => PJ.UI && PJ.UI.toast(m, kind);
  const changed = () => PJ.UI && PJ.UI.refresh();
  const save = () => PJ.Save.write(st.save);

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
      st.capToast = s.level >= rk.maxLv && st.capToast;
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
  const HIT_COL = { weed: ['#57b13f', '#3f8f2f', '#8bd36a', '#6a4a2a'], snow: ['#ffffff', '#dfeaff', '#b9d0f0'], complaint: ['#ffd24a', '#ff8b8b', '#ffffff'] };

  /* ----------------------------- 오브젝트 ---------------------------------- */
  function buildSpots() {
    spots = { grass: [], paved: [], path: [] };
    for (let y = 1; y < MAP.h - 1; y++) for (let x = 1; x < MAP.w - 1; x++) {
      if (MAP.solid(x, y)) continue;
      const g = MAP.ground[y][x];
      if (g === 'grass' || g === 'grass2') spots.grass.push([x, y]);
      else if (g === 'path') { spots.path.push([x, y]); spots.paved.push([x, y]); }
      else if (g === 'parking' || g === 'parkLine') spots.paved.push([x, y]);
    }
  }
  const countOf = (type) => st.objs.filter((o) => o.type === type).length;
  const maxOf = (type) => OBJECTS[type].max + st.save.rank * (type === 'complaint' ? 1 : 2);
  function spawn(type, silent) {
    if (countOf(type) >= maxOf(type)) return false;
    const list = spots[OBJECTS[type].zone], p = st.player;
    for (let tries = 0; tries < 30; tries++) {
      const [tx, ty] = list[(Math.random() * list.length) | 0];
      const x = tx * T + 8, y = ty * T + 8;
      if (!silent && Math.hypot(x - p.x, y - (p.y - 6)) < 36) continue;
      if (st.objs.some((o) => Math.hypot(o.x - x, o.y - y) < 15)) continue;
      const hp = R.objHp(type);
      st.objs.push({ type, x, y, hp, maxHp: hp, shake: 0, age: silent ? 1 : 0, ttl: OBJECTS[type].ttl || 0, bob: Math.random() * 6 });
      if (!silent) { burst(x, y, 6, ['#fff', '#ffe9a0'], 30, 0.4); }
      return true;
    }
    return false;
  }
  function nearestObj(reach, type) {
    const p = st.player, cx = p.x, cy = p.y - 6;
    let best = null, bd = reach + 8;
    st.objs.forEach((o) => {
      if (type && o.type !== type) return;
      const d = Math.hypot(o.x - cx, o.y - cy) - 8;
      if (d <= reach && d < bd) { bd = d; best = o; }
    });
    return best;
  }
  const faceTo = (x, y) => {
    const p = st.player, dx = x - p.x, dy = y - (p.y - 6);
    p.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  };

  function damage(o, dmg, ctxInfo) {
    let crit = Math.random() < 0.12;
    if (crit) dmg *= 1.6;
    o.hp -= dmg; o.shake = 0.18;
    burst(o.x, o.y, crit ? 9 : 5, HIT_COL[o.type], crit ? 70 : 50, 0.45);
    Audio.play(crit ? 'crit' : 'hit');
    if (crit) st.floats.push({ x: o.x, y: o.y - 10, text: 'CRIT!', color: '#ffe066', life: 0.6, max: 0.6, size: 7 });
    if (o.hp <= 0) kill(o, ctxInfo);
  }
  function kill(o, info) {
    const i = st.objs.indexOf(o); if (i < 0) return;
    st.objs.splice(i, 1);
    st.combo = st.comboT > 0 ? st.combo + 1 : 1; st.comboT = 3;
    const rw = R.reward(o.type, (info && info.bonus) || 1);
    st.save.gold += rw.gold; st.save.stats[o.type]++;
    burst(o.x, o.y, 16, HIT_COL[o.type], 90, 0.7, o.type === 'complaint' ? '♥' : null);
    st.floats.push({ x: o.x - 6, y: o.y - 12, text: `+${rw.exp} EXP`, color: '#7fd3ff', life: 1.1, max: 1.1, size: 7 });
    st.floats.push({ x: o.x + 6, y: o.y - 4, text: `+${rw.gold}G`, color: '#ffd24a', life: 1.2, max: 1.2, size: 7 });
    if (info && info.bonus > 1) st.floats.push({ x: o.x, y: o.y - 22, text: o.type === 'complaint' ? '친절 보너스!' : '고효율!', color: '#ff9bd0', life: 1.1, max: 1.1, size: 7 });
    st.shake = Math.max(st.shake, 2); st.hitstop = 0.04;
    Audio.play('kill'); setTimeout(() => Audio.play('coin'), 120);
    addExp(rw.exp);
    changed();
    save();
  }

  /* ------------------------------- 스킬 ------------------------------------ */
  function startCd(id, s) { st.cd[id] = st.cdMax[id] = s; }
  function useSkill(id) {
    const sk = SKILLS[id], p = st.player;
    if (!R.isUnlocked(id)) { toast(`🔒 Lv.${sk.unlockLv} 에 해금됩니다`); Audio.play('error'); return false; }
    if ((st.cd[id] || 0) > 0) return false;
    const s = R.skillStats(id);
    if (sk.type === 'single') {
      const t = nearestObj(s.reach, sk.target);
      if (!t) { if (!sk.hidden && sk.key) { toast('근처에 대상이 없어요'); Audio.play('error'); } return false; }
      faceTo(t.x, t.y);
      p.atk = 0.2; p.atkDir = Math.atan2(t.y - (p.y - 6), t.x - p.x);
      st.slashes.push({ x: p.x, y: p.y - 6, a: p.atkDir, life: 0.18, max: 0.18, color: sk.group === 'snow' ? '#dff0ff' : sk.group === 'weed' ? '#d6ffb0' : '#ffd0e8' });
      Audio.play(id === 'kind' ? 'kind' : 'swing');
      if (id === 'kind') burst(t.x, t.y - 4, 10, ['#ff8bd0', '#ffd0e8'], 55, 0.8, '♥');
      damage(t, s.dmg, { bonus: s.bonus });
      startCd(id, s.cd);
    } else { // area
      const hits = st.objs.filter((o) => o.type === sk.target && Math.hypot(o.x - p.x, o.y - (p.y - 6)) <= s.radius + 6);
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
        st.objs.filter((o) => o.type === sk.target && Math.hypot(o.x - p.x, o.y - (p.y - 6)) <= s.radius + 6)
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
    const id = t.type === 'weed' ? 'weedPull' : t.type === 'snow' ? 'shovel' : 'answer';
    if (useSkill(id)) st.gcd = 0.08;
  }
  function skillKey(n) { if (st.paused) return; useSkill(['mower', 'blower', 'kind'][n - 1]); }

  /* ------------------------------- 업데이트 -------------------------------- */
  function blocked(x, y) {
    const hw = 4;
    return MAP.solid(Math.floor((x - hw) / T), Math.floor((y - 6) / T)) || MAP.solid(Math.floor((x + hw) / T), Math.floor((y - 6) / T)) ||
      MAP.solid(Math.floor((x - hw) / T), Math.floor(y / T)) || MAP.solid(Math.floor((x + hw) / T), Math.floor(y / T));
  }
  function update(dt) {
    if (st.paused) return;
    if (st.hitstop > 0) { st.hitstop -= dt; return; }
    st.time += dt; st.gcd = Math.max(0, st.gcd - dt);
    Object.keys(st.cd).forEach((k) => { if (st.cd[k] > 0) st.cd[k] = Math.max(0, st.cd[k] - dt); });
    if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) st.combo = 0; }

    // 이동
    const p = st.player, a = Input.axis(), sp = R.rank().speed;
    p.moving = !!(a.x || a.y);
    if (p.moving) {
      const nx = p.x + a.x * sp * dt, ny = p.y + a.y * sp * dt;
      if (!blocked(nx, p.y)) p.x = nx;
      if (!blocked(p.x, ny)) p.y = ny;
      if (!(p.atk > 0)) p.dir = Math.abs(a.x) > Math.abs(a.y) ? (a.x < 0 ? 'left' : 'right') : (a.y < 0 ? 'up' : 'down');
      p.stepT += dt; if (p.stepT > 0.16) { p.stepT = 0; p.step ^= 1; }
    } else { p.step = 0; p.stepT = 0; }
    p.atk = Math.max(0, p.atk - dt);
    if (Input.held.action) basicAction();

    // 스폰 / 수명
    Object.keys(OBJECTS).forEach((type) => {
      st.spawnT[type] = (st.spawnT[type] || 0) - dt;
      if (st.spawnT[type] <= 0) {
        spawn(type);
        st.spawnT[type] = OBJECTS[type].interval * (1 - 0.1 * st.save.rank) * (0.7 + Math.random() * 0.6);
      }
    });
    for (let i = st.objs.length - 1; i >= 0; i--) {
      const o = st.objs[i];
      o.age += dt; o.shake = Math.max(0, o.shake - dt);
      if (o.ttl) { o.ttl -= dt; if (o.ttl <= 0) { burst(o.x, o.y, 8, ['#aaa', '#ddd'], 40, 0.5); st.objs.splice(i, 1); } }
    }
    for (let i = st.sched.length - 1; i >= 0; i--) { st.sched[i].t -= dt; if (st.sched[i].t <= 0) { const f = st.sched[i].fn; st.sched.splice(i, 1); f(); } }

    // 이펙트
    st.parts = st.parts.filter((q) => { q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; return q.life > 0; });
    [st.floats, st.rings, st.slashes, st.spins].forEach((arr) => { for (let i = arr.length - 1; i >= 0; i--) { arr[i].life -= dt; if (arr[i].life <= 0) arr.splice(i, 1); } });
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
    const type = o.type, a = ASSETS.objects[type];
    const prog = 1 - o.hp / o.maxHp;
    const idx = type === 'complaint' ? (Math.floor(st.time * 3) % 2) : Math.min(a.frames - 1, Math.floor(prog * a.frames));
    const pop = Math.min(1, o.age / 0.25), sx = o.shake > 0 ? Math.sin(o.shake * 80) * 1.5 : 0;
    let oy = type === 'complaint' ? Math.sin(st.time * 4 + o.bob) * 1.5 - 2 : 0;
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(o.x, o.y + 6, 6 * pop, 2, 0, 0, 7); g.fill();
    g.save(); g.translate(o.x + sx, o.y + oy + 8); g.scale(pop, pop);
    const fr = Gfx.objectFrame(type, idx);
    g.drawImage(fr, -ASSETS.objects.anchor[0], -ASSETS.objects.anchor[1] - 8);
    g.restore();
    if (o.hp < o.maxHp) { // 게이지
      const w = 14, f = Math.max(0, o.hp / o.maxHp);
      g.fillStyle = '#1b1b2b'; g.fillRect(o.x - w / 2 - 1, o.y - 15, w + 2, 4);
      g.fillStyle = f > 0.5 ? '#6adf5a' : f > 0.25 ? '#ffd24a' : '#ff6a5a'; g.fillRect(o.x - w / 2, o.y - 14, w * f, 2);
    }
    if (o.ttl && o.ttl < 10 && Math.floor(st.time * 4) % 2) { g.fillStyle = '#ff6a5a'; g.fillRect(o.x - 1, o.y - 20, 2, 2); }
  }
  function drawPlayer(g) {
    const p = st.player, rk = R.rank(), an = ASSETS.player.anchor;
    const bob = p.moving ? (p.step ? -1 : 0) : Math.sin(st.time * 3) * 0.4;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.x, p.y, 6, 2.2, 0, 0, 7); g.fill();
    const fr = Gfx.playerFrame(st.save.rank, p.dir, p.step);
    g.save(); g.translate(Math.round(p.x), Math.round(p.y + bob));
    if (p.dir === 'left') g.scale(-1, 1);
    g.drawImage(fr, -an[0], -an[1] - 1);
    g.restore();
    // 직급 이름표
    const label = rk.name, w = label.length * 7 + 8;
    g.fillStyle = 'rgba(20,20,40,.85)'; g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 29), w, 9);
    g.fillStyle = rk.palette.a === '#ffffff' ? rk.palette.c : rk.palette.a; g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - 29), 2, 9);
    text(g, label, p.x + 1, p.y - 24.3, '#fff', 6.5);
  }
  function render() {
    const g = ctx; g.setTransform(S, 0, 0, S, 0, 0); g.imageSmoothingEnabled = false;
    const sh = st.shake > 0 ? [(Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake] : [0, 0];
    g.save(); g.translate(sh[0], sh[1]);
    g.drawImage(staticLayer, 0, 0);
    MAP.labels.forEach((l) => text(g, l.text, l.x * T, l.y * T, l.color, 6.5));

    // 타깃 링 (바닥)
    if (st.target) {
      const t = st.target, pulse = 1 + Math.sin(st.time * 8) * 0.12;
      g.strokeStyle = '#ffffffcc'; g.lineWidth = 1; g.setLineDash([2, 2]);
      g.beginPath(); g.ellipse(t.x, t.y + 5, 9 * pulse, 4 * pulse, 0, 0, 7); g.stroke(); g.setLineDash([]);
    }
    // 범위 스킬 미리보기 (쿨 완료 시 점선) 생략 → 사용 시 이펙트로 표현

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
    st.floats.forEach((f) => { g.globalAlpha = Math.min(1, f.life / (f.max * 0.4)); text(g, f.text, f.x, f.y, f.color, f.size || 7); });
    g.globalAlpha = 1;
    g.restore();

    // 화면 효과 / 콤보
    if (st.flash > 0) { g.globalAlpha = Math.min(0.6, st.flash); g.fillStyle = st.flashColor; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
    if (st.combo >= 2) {
      const sc = 1 + Math.min(0.3, st.comboT > 2.7 ? (st.comboT - 2.7) * 1.5 : 0);
      g.save(); g.translate(VW - 8, 14); g.scale(sc, sc);
      text(g, `${st.combo} COMBO!`, 0, 0, '#ffe066', 9, 'right');
      g.fillStyle = '#ffe066'; g.fillRect(-52, 7, 52 * (st.comboT / 3), 2);
      g.restore();
    }
    if (st.target && !PJ.touch) text(g, '[Space] 작업', st.target.x, st.target.y - 22, '#fff', 6);
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
  function init() {
    st.save = PJ.Save.load();
    Audio.setMuted(st.save.muted);
    cv = document.getElementById('cv'); ctx = cv.getContext('2d');
    buildSpots(); buildStatic(); resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    st.player.x = MAP.spawn.x * T + 8; st.player.y = MAP.spawn.y * T + 12;
    ['weed', 'snow', 'complaint'].forEach((t) => { const n = Math.ceil(OBJECTS[t].max / 2); for (let i = 0; i < n; i++) spawn(t, true); });

    Input.on('action', basicAction); Input.on('skill', skillKey);
    Input.on('menu', () => PJ.UI.togglePanel());
    // 캔버스 클릭/터치 = 기본 작업
    cv.addEventListener('pointerdown', (e) => { Audio.unlock(); if (e.button > 0) return; Input.held.action = true; basicAction(); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, () => { Input.held.action = false; }));
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    window.addEventListener('pagehide', save);
    PJ.UI.init(); PJ.UI.refresh();
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(document.getElementById('stage'));
    requestAnimationFrame(loop);
  }

  PJ.Game = {
    init, save, upgrade, promote, basicAction, useSkill, skillKey,
    setPaused(v) { st.paused = v; if (v) Input.reset(); },
    reset() { PJ.Save.reset(); st.save = null; window.removeEventListener('pagehide', save); location.reload(); },
    resize,
  };
})();
