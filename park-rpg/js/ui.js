/* ui.js - HUD / 스킬바 / 메뉴 패널 (DOM) */
(function () {
  'use strict';
  const PJ = window.PJ;
  const { RANKS, SKILLS, Gfx, Audio, Input } = PJ;
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
  let el = {}, tab = 'skills', open = false, btns = {}, hudKey = '';

  function init() {
    ['gold', 'lv', 'expFill', 'expText', 'whoTitle', 'avatar', 'toasts', 'panel', 'panelBody', 'btnMenu', 'btnClose', 'skills', 'stick', 'knob']
      .forEach((id) => { el[id] = document.getElementById(id); });
    Input.bindStick(el.stick, el.knob);

    // 스킬 바
    const defs = [
      { id: 'main', key: 'Space', icon: '✋', name: '작업', main: true },
      { id: 'mower', key: '1' }, { id: 'blower', key: '2' }, { id: 'kind', key: '3' },
    ];
    defs.forEach((d) => {
      const sk = SKILLS[d.id];
      const b = document.createElement('button');
      b.className = 'sk' + (d.main ? ' main' : '');
      b.innerHTML = `<span class="key">${d.key === 'Space' ? 'SP' : d.key}</span><span class="ic">${d.icon || sk.icon}</span><span class="nm">${d.name || sk.name.replace(/ .*/, '')}</span><span class="cdo"></span><span class="cdt"></span>`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); Audio.unlock();
        if (d.main) { Input.held.action = true; PJ.Game.basicAction(); } else PJ.Game.useSkill(d.id);
      });
      if (d.main) ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => { Input.held.action = false; }));
      el.skills.appendChild(b);
      btns[d.id] = { b, cdo: b.querySelector('.cdo'), cdt: b.querySelector('.cdt') };
    });

    el.btnMenu.addEventListener('click', () => togglePanel());
    el.btnClose.addEventListener('click', () => closePanel());
    el.panel.addEventListener('pointerdown', (e) => { if (e.target === el.panel) closePanel(); });
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; Audio.play('swing'); render(); }));
    el.panelBody.addEventListener('click', onBodyClick);
  }

  function toast(msg, kind) {
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : ''); d.textContent = msg;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 2700);
  }

  /* ------------------------------- HUD ------------------------------------- */
  function drawAvatar(cv, rank) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height); g.drawImage(Gfx.playerFrame(rank, 'down', 0), 0, 0);
  }
  function refresh() {
    const s = PJ.state.save, rk = PJ.Rules.rank(), need = PJ.Rules.needExp(s.level), cap = s.level >= rk.maxLv;
    el.gold.textContent = fmt(s.gold);
    el.lv.textContent = 'Lv.' + s.level;
    el.expFill.style.width = Math.min(100, (s.exp / need) * 100) + '%';
    el.expText.textContent = cap ? (RANKS[s.rank + 1] ? '최고 레벨 · 전직 필요' : 'MAX') : `${fmt(s.exp)} / ${fmt(need)}`;
    el.whoTitle.textContent = `${rk.name} · ${rk.title}`;
    const key = 'r' + s.rank;
    if (key !== hudKey) { hudKey = key; drawAvatar(el.avatar, s.rank); }
    const pi = PJ.Rules.promoteInfo();
    el.btnMenu.classList.toggle('alert', !!(pi && pi.ok));
    if (open) render();
  }
  // 매 프레임: 쿨타임 표시
  function tick() {
    const st = PJ.state;
    Object.keys(btns).forEach((id) => {
      const x = btns[id], b = x.b;
      if (id === 'main') return;
      const unlocked = PJ.Rules.isUnlocked(id), cd = st.cd[id] || 0, mx = st.cdMax[id] || 1;
      b.classList.toggle('lock', !unlocked);
      b.classList.toggle('ready', unlocked && cd <= 0);
      x.cdo.style.height = unlocked && cd > 0 ? (cd / mx) * 100 + '%' : '0';
      x.cdt.textContent = !unlocked ? '🔒' : cd > 0 ? (cd >= 10 ? Math.ceil(cd) : cd.toFixed(1)) : '';
    });
  }

  /* ------------------------------- 패널 ------------------------------------ */
  function togglePanel() { open ? closePanel() : openPanel(); }
  function openPanel(t) { if (t) tab = t; open = true; el.panel.hidden = false; PJ.Game.setPaused(true); Audio.play('swing'); render(); }
  function closePanel() { open = false; el.panel.hidden = true; PJ.Game.setPaused(false); }

  function render() {
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const scroll = el.panelBody.scrollTop;
    el.panelBody.innerHTML = tab === 'skills' ? skillsHtml() : tab === 'promo' ? promoHtml() : infoHtml();
    el.panelBody.scrollTop = scroll;
    if (tab === 'promo') el.panelBody.querySelectorAll('canvas[data-rank]').forEach((c) => drawAvatar(c, +c.dataset.rank));
  }

  function skillsHtml() {
    const R = PJ.Rules, s = PJ.state.save, cap = R.maxSkillLv();
    const groups = [['🌿 제초 계열', 'weedPull', 'mower'], ['❄️ 제설 계열', 'shovel', 'blower'], ['📢 민원 응대', 'kind']];
    let h = `<div class="help" style="margin-bottom:10px">현재 스킬 최고 강화 한도: <b>Lv.${cap}</b> (플레이어 레벨이 오를수록 상승) · 💰 ${fmt(s.gold)}</div>`;
    groups.forEach(([title, ...ids]) => {
      h += `<h3>${title}</h3>`;
      ids.forEach((id) => {
        const sk = SKILLS[id], lv = R.skillLv(id), st = R.skillStats(id), un = R.isUnlocked(id);
        const maxed = lv >= cap, cost = R.upgradeCost(id), can = un && !maxed && s.gold >= cost;
        const stats = [`위력 ${st.dmg.toFixed(1)}`, `쿨타임 ${st.cd.toFixed(1)}초`];
        if (sk.type === 'area') stats.push(`범위 ${Math.round(st.radius)}`); else stats.push(`사거리 ${Math.round(st.reach)}`);
        if (sk.bonus) stats.push(`보상 ×${st.bonus.toFixed(2)}`);
        const keyTxt = sk.key ? `[${sk.key}]` : '[Space 자동]';
        h += `<div class="card ${un ? '' : 'lock'}"><div class="ic">${sk.icon}</div>
          <div class="tx"><b>${sk.name}</b><em>Lv.${lv}</em> <small>${keyTxt}</small><p>${sk.desc}</p><small>${un ? stats.join(' · ') : '🔒 Lv.' + sk.unlockLv + ' 에 해금'}</small></div>
          <button class="btn buy" data-up="${id}" ${can ? '' : 'disabled'}>${!un ? '잠김' : maxed ? (lv >= 15 ? 'MAX' : '레벨 필요') : '강화<br>💰' + fmt(cost)}</button></div>`;
      });
    });
    return h;
  }

  function promoHtml() {
    const R = PJ.Rules, s = PJ.state.save, rk = R.rank(), pi = R.promoteInfo();
    let h = '<div class="ladder">';
    RANKS.forEach((r, i) => { h += `<div class="step ${i === s.rank ? 'cur' : i > s.rank ? 'future' : ''}"><canvas width="16" height="16" data-rank="${i}"></canvas>${r.name}</div>`; });
    h += '</div>';
    h += `<div class="card"><div class="tx"><b>현재: ${rk.name}</b> <em>「${rk.title}」</em>
      <p>이동속도 ${rk.speed} · 업무 위력 ×${rk.power} · EXP ×${rk.expMult} · 골드 ×${rk.goldMult} · 사거리 +${rk.reachBonus}</p>
      <small>최고 레벨 Lv.${rk.maxLv}</small></div></div>`;
    if (!pi) return h + '<div class="help">🎖️ 최고 직급 <b>소장</b> 입니다! 더 이상의 전직은 없습니다.<br>2차 업데이트를 기대해 주세요.</div>';
    const n = pi.next;
    h += `<h3>다음 직급: ${n.name} 「${n.title}」</h3>
      <div class="help" style="margin-bottom:8px">전직 시: 이동속도 ${n.speed} · 업무 위력 ×${n.power} · EXP ×${n.expMult} · 골드 ×${n.goldMult} · 최고 레벨 Lv.${n.maxLv}<br>복장/뱃지 색이 바뀌고, 현장 오브젝트가 더 단단해집니다.</div>
      <ul class="req">${pi.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}"><span>${c.ok ? '✔' : '✖'} ${c.label}</span><b>${fmt(Math.min(c.now, 1e12))} / ${fmt(c.need)}</b></li>`).join('')}</ul>
      <button class="btn big" data-promote ${pi.ok ? '' : 'disabled'}>${pi.ok ? `🎖️ ${n.name}(으)로 전직하기 (💰${fmt(n.promote.gold)})` : '조건을 모두 채워 주세요'}</button>`;
    return h;
  }

  function infoHtml() {
    const s = PJ.state.save, rk = PJ.Rules.rank(), total = s.stats.weed + s.stats.snow + s.stats.complaint;
    return `<h3>박주임 현황</h3><div class="grid">
      <div><span>직급</span><b>${rk.name}</b></div><div><span>레벨</span><b>${s.level} / ${rk.maxLv}</b></div>
      <div><span>골드</span><b>${fmt(s.gold)}</b></div><div><span>총 업무</span><b>${fmt(total)}</b></div>
      <div><span>🌿 잡초 처리</span><b>${fmt(s.stats.weed)}</b></div><div><span>❄️ 눈 처리</span><b>${fmt(s.stats.snow)}</b></div>
      <div><span>💬 민원 처리</span><b>${fmt(s.stats.complaint)}</b></div><div><span>이동속도</span><b>${rk.speed}</b></div></div>
      <h3>조작법</h3><div class="help">
      <b>PC</b> · 이동 <kbd>WASD</kbd>/<kbd>방향키</kbd> · 작업 <kbd>Space</kbd>/<kbd>J</kbd>/마우스 클릭(누르고 있으면 연타) · 스킬 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> · 메뉴 <kbd>Esc</kbd>/<kbd>M</kbd><br>
      <b>모바일</b> · 왼쪽 가상 조이스틱 이동 · 오른쪽 <b>✋ 작업</b> 버튼(꾹 누르기 가능) / 스킬 버튼 / 화면 터치도 작업<br>
      가까이 가면 흰 점선 링이 뜨는 대상에게 기본 작업이 자동으로 들어갑니다. 연속 처리하면 <b>콤보</b> 보너스 EXP!</div>
      <div class="row"><button class="btn" data-sound>${Audio.isMuted() ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'}</button><button class="btn danger" data-reset>저장 데이터 초기화</button></div>
      <p class="help" style="margin-top:10px">진행 상황은 이 브라우저에 자동 저장됩니다. (마지막 저장: ${s.savedAt ? new Date(s.savedAt).toLocaleTimeString('ko-KR') : '-'})</p>`;
  }

  function onBodyClick(e) {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.up) PJ.Game.upgrade(t.dataset.up);
    else if ('promote' in t.dataset) { if (PJ.Game.promote()) { closePanel(); } }
    else if ('sound' in t.dataset) { const m = !Audio.isMuted(); Audio.setMuted(m); PJ.state.save.muted = m; PJ.Game.save(); render(); if (!m) Audio.play('buy'); }
    else if ('reset' in t.dataset) { if (confirm('정말 모든 진행도를 지우고 처음부터 시작할까요?')) PJ.Game.reset(); }
  }

  PJ.UI = { init, refresh, tick, toast, togglePanel, openPanel, closePanel, isOpen: () => open };
})();
