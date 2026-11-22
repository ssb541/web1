const assert = require('assert');
const F = require('../fill.js');
const W = 100, H = 100;
function lineImg(draw) {
  const data = new Uint8ClampedArray(W * H * 4);
  const set = (x, y) => { const i = (y * W + x) * 4; data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255; };
  draw(set);
  return { width: W, height: H, data };
}
const rect = (set, x0, y0, x1, y1, gapAt) => {
  for (let x = x0; x <= x1; x++) for (const y of [y0, y0 + 1, y1, y1 - 1]) set(x, y);
  for (let y = y0; y <= y1; y++) for (const x of [x0, x0 + 1, x1, x1 - 1]) { if (gapAt && gapAt(x, y)) continue; set(x, y); }
};
// 1) 닫힌 사각형 2개 → 내부 영역 2개 + 배경
let img = lineImg((s) => { rect(s, 10, 10, 40, 40); rect(s, 55, 10, 90, 60); });
let mask = F.buildLineMask(img, 0, 0, W, H, 100);
let reg = F.computeRegions(mask, W, H, { gap: 0, expand: 0 });
assert.strictEqual(reg.regionCount, 2, 'closed regions');
assert.ok(reg.bg > 0 && reg.labels[0] === reg.bg, 'bg label');
// 2) 틈이 있으면 gap=0 에선 새고, gap=6 에선 막힌다 (틈 4px)
img = lineImg((s) => rect(s, 20, 20, 70, 70, (x, y) => x === 70 - 1 || x === 70 ? (y >= 40 && y < 44) : false));
mask = F.buildLineMask(img, 0, 0, W, H, 100);
reg = F.computeRegions(mask, W, H, { gap: 0, expand: 0 });
assert.strictEqual(reg.regionCount, 0, 'leaks without gap closing');
reg = F.computeRegions(mask, W, H, { gap: 6, expand: 0 });
assert.strictEqual(reg.regionCount, 1, 'gap closed');
assert.ok(reg.labels[45 * W + 45] !== reg.bg && reg.labels[45 * W + 45] > 0);
// 3) expand: 선 안쪽 1~2px 까지 번짐
img = lineImg((s) => rect(s, 10, 10, 40, 40));
mask = F.buildLineMask(img, 0, 0, W, H, 100);
const r0 = F.computeRegions(mask, W, H, { gap: 0, expand: 0 });
const r2 = F.computeRegions(mask, W, H, { gap: 0, expand: 2 });
const out0 = new Uint8ClampedArray(W * H * 4), out2 = new Uint8ClampedArray(W * H * 4);
F.paintAll(r0, out0); F.paintAll(r2, out2);
const lineEdge = (11 * W + 25) * 4; // 선 두께 2px 중 안쪽 줄(y=11)
assert.strictEqual(out0[lineEdge + 3], 0, 'no expand: line stays empty');
assert.strictEqual(out2[lineEdge + 3], 255, 'expand fills under line');
// 선 바깥(배경)에는 칠 안 함
assert.strictEqual(out2[(5 * W + 5) * 4 + 3], 0, 'bg untouched');
// 4) paintRegion / labelAt
const lab = F.labelAt(r2, 25, 25);
const o = new Uint8ClampedArray(W * H * 4);
const rr = F.paintRegion(r2, lab, [1, 2, 3], o);
assert.deepStrictEqual([o[(25 * W + 25) * 4], o[(25 * W + 25) * 4 + 3]], [1, 255]);
assert.ok(rr.w > 25 && rr.h > 25);
// 알파 기준 + 반투명 안티앨리어싱 가장자리는 선 아님
img = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 50]) };
assert.strictEqual(F.buildLineMask(img, 0, 0, 1, 1, 100)[0], 0);
// 레이어 오프셋
img = { width: 2, height: 2, data: new Uint8ClampedArray([0,0,0,255, 0,0,0,255, 0,0,0,255, 0,0,0,255]) };
const m = F.buildLineMask(img, 3, 4, 10, 10, 100);
assert.strictEqual(m[4 * 10 + 3], 1); assert.strictEqual(m[0], 0);
console.log('fill tests OK');
