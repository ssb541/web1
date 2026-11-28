// 간단한 WebAudio 효과음 + 잔잔한 배경음 (외부 파일 없음)
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let timer = 0;
let step = 0;
try { muted = localStorage.getItem('apt-mute') === '1'; } catch { /* ignore */ }

export function isMuted() { return muted; }
export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem('apt-mute', muted ? '1' : '0'); } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
  return muted;
}

export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
      timer = window.setInterval(bgm, 520);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* 오디오를 못 쓰는 환경 */ }
}

function tone(freq: number, t0: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export function sfx(name: string) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  switch (name) {
    case 'click': tone(700, t, 0.05, 'square', 0.05); break;
    case 'good': tone(523, t, 0.12, 'triangle', 0.12); tone(659, t + 0.09, 0.12, 'triangle', 0.12); tone(784, t + 0.18, 0.18, 'triangle', 0.12); break;
    case 'bad': tone(240, t, 0.25, 'sawtooth', 0.08, 110); break;
    case 'warn': tone(880, t, 0.08, 'square', 0.06); tone(880, t + 0.13, 0.08, 'square', 0.06); break;
    case 'level': [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.08, 0.15, 'triangle', 0.12)); break;
    default: break;
  }
}

// 펜타토닉 아르페지오 BGM (아주 작게)
const SCALE = [0, 2, 4, 7, 9];
const ROOTS = [261.63, 220, 246.94, 196]; // C, A, B(낮게), G
function bgm() {
  if (!ctx || muted || document.hidden) return;
  const t = ctx.currentTime;
  const root = ROOTS[Math.floor(step / 8) % ROOTS.length];
  const note = root * Math.pow(2, SCALE[Math.floor(Math.random() * 5)] / 12) * (Math.random() < 0.3 ? 2 : 1);
  if (step % 2 === 0 || Math.random() < 0.35) tone(note, t, 0.9, 'sine', 0.035);
  if (step % 8 === 0) tone(root / 2, t, 1.6, 'triangle', 0.04);
  step++;
}
void timer;
