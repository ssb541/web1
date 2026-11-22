/* audio.js - WebAudio 8bit 효과음 (외부 파일 없음) */
(function () {
  'use strict';
  const PJ = window.PJ;
  let ctx = null, muted = false;
  function ensure() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, d, type, vol, slide, delay) {
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + d);
    g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  }
  const SFX = {
    swing: () => tone(300, 0.08, 'triangle', 0.04, 140),
    hit: () => { tone(220, 0.07, 'square', 0.05, 110); },
    crit: () => { tone(520, 0.09, 'square', 0.05, 900); },
    kill: () => { tone(520, 0.08, 'square', 0.05); tone(780, 0.12, 'square', 0.05, null, 0.07); },
    coin: () => { tone(1100, 0.06, 'square', 0.035); tone(1500, 0.1, 'square', 0.035, null, 0.06); },
    mower: () => { for (let i = 0; i < 5; i++) tone(120 + (i % 2) * 40, 0.1, 'sawtooth', 0.04, 80, i * 0.08); },
    blower: () => { tone(200, 0.5, 'sawtooth', 0.04, 700); tone(90, 0.5, 'square', 0.03, 300); },
    kind: () => { tone(660, 0.1, 'triangle', 0.06); tone(880, 0.16, 'triangle', 0.06, null, 0.1); },
    level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.05, null, i * 0.1)); },
    promote: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'square', 0.05, null, i * 0.11)); },
    buy: () => { tone(700, 0.08, 'square', 0.05); tone(1000, 0.12, 'square', 0.05, null, 0.07); },
    error: () => tone(150, 0.15, 'square', 0.05, 90),
    alarm: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 0.12, 'square', 0.05, null, i * 0.14); },
    item: () => { [660, 880, 1320].forEach((f, i) => tone(f, 0.1, 'triangle', 0.06, null, i * 0.07)); },
    tick: () => tone(1400, 0.03, 'square', 0.015),
    fever: () => { [440, 660, 880, 1100].forEach((f, i) => tone(f, 0.1, 'sawtooth', 0.04, null, i * 0.06)); },
    spawn: () => tone(400, 0.06, 'sine', 0.025, 600),
  };
  PJ.Audio = {
    unlock: ensure,
    play(n) { if (SFX[n]) SFX[n](); },
    setMuted(m) { muted = !!m; },
    isMuted: () => muted,
  };
})();
