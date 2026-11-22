/* input.js - 키보드(WASD/방향키) + 가상 조이스틱 + 터치 버튼 입력 */
(function () {
  'use strict';
  const PJ = window.PJ;
  const keys = new Set();
  const held = { action: false };
  const stick = { x: 0, y: 0 };
  const on = {};
  let press = 0; // 새로 누른 횟수(문 상호작용 등 '새 입력' 판별용)
  const emit = (n, a) => on[n] && on[n](a);

  const MOVE = {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  };
  const any = (arr) => arr.some((k) => keys.has(k));

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const c = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(c)) e.preventDefault();
    PJ.Audio.unlock();
    if (c === 'Escape' || c === 'KeyM' || c === 'Tab') { if (!e.repeat) emit('menu'); return; }
    if (c === 'KeyT') { if (!e.repeat) emit('auto'); return; }
    keys.add(c);
    if (c === 'Space' || c === 'KeyJ') { if (!e.repeat) press++; held.action = true; return; }
    if (e.repeat) return;
    const m = /^(?:Digit|Numpad)([1-3])$/.exec(c);
    if (m) emit('skill', +m[1]);
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space' || e.code === 'KeyJ') held.action = false;
  });
  window.addEventListener('blur', () => { keys.clear(); held.action = false; stick.x = stick.y = 0; });

  function bindStick(base, knob) {
    let id = null;
    const R = () => base.getBoundingClientRect();
    function move(e) {
      const r = R(), rad = r.width / 2;
      let dx = (e.clientX - (r.left + rad)) / rad, dy = (e.clientY - (r.top + rad)) / rad;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = `translate(${dx * rad * 0.55}px, ${dy * rad * 0.55}px)`;
      const dead = 0.18;
      stick.x = Math.abs(dx) < dead && len < dead ? 0 : dx;
      stick.y = Math.abs(dy) < dead && len < dead ? 0 : dy;
    }
    function end() { id = null; stick.x = stick.y = 0; knob.style.transform = ''; }
    base.addEventListener('pointerdown', (e) => {
      id = e.pointerId; base.setPointerCapture(id); PJ.Audio.unlock(); move(e); e.preventDefault();
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    base.addEventListener('pointerup', (e) => { if (e.pointerId === id) end(); });
    base.addEventListener('pointercancel', end);
  }

  PJ.Input = {
    on(name, fn) { on[name] = fn; },
    held,
    get press() { return press; },
    bump() { press++; },
    bindStick,
    // 이동 벡터 (-1~1). 키보드는 정규화, 조이스틱은 아날로그
    axis() {
      let x = (any(MOVE.right) ? 1 : 0) - (any(MOVE.left) ? 1 : 0);
      let y = (any(MOVE.down) ? 1 : 0) - (any(MOVE.up) ? 1 : 0);
      if (x || y) { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
      return { x: stick.x, y: stick.y };
    },
    reset() { keys.clear(); held.action = false; stick.x = stick.y = 0; },
  };
})();
