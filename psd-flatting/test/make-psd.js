// 테스트용 PSD 생성: node make-psd.js out.psd
const fs = require('fs');
const { writePsd } = require('ag-psd');
const W = 200, H = 160;
const mk = (fn) => { const d = new Uint8ClampedArray(W * H * 4); fn((x, y, r, g, b, a) => { const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }); return { width: W, height: H, data: d }; };
const bg = mk((s) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s(x, y, 255, 255, 255, 255); });
const shade = mk((s) => { for (let y = 100; y < 130; y++) for (let x = 20; x < 60; x++) s(x, y, 80, 80, 200, 120); });
const lines = mk((s) => {
  const rect = (x0, y0, x1, y1, gap) => { for (let x = x0; x <= x1; x++) for (const y of [y0, y0 + 1, y1 - 1, y1]) s(x, y, 20, 20, 20, 255);
    for (let y = y0; y <= y1; y++) for (const x of [x0, x0 + 1, x1 - 1, x1]) if (!(gap && x >= x1 - 1 && y >= 40 && y < 44)) s(x, y, 20, 20, 20, 255); };
  rect(10, 10, 90, 80, true); rect(110, 20, 180, 140, false);
});
const psd = { width: W, height: H, children: [
  { name: '배경', imageData: bg },
  { name: '그룹', opened: true, children: [{ name: '음영', opacity: 0.5, blendMode: 'multiply', imageData: shade }] },
  { name: '스케치', opacity: 0.8, imageData: lines },
] };
fs.writeFileSync(process.argv[2], Buffer.from(writePsd(psd)));
