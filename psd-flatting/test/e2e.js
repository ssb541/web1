// 실행: NODE_PATH=<ag-psd,playwright 위치> node test/e2e.js input.psd
const { chromium } = require('playwright');
const agPsd = require('ag-psd');
const fs = require('fs'), assert = require('assert');
agPsd.initializeCanvas(() => { throw new Error('no canvas'); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
(async () => {
  const input = process.argv[2], url = process.argv[3] || 'http://localhost:8765/index.html';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(url);
  await page.setInputFiles('#file', input);
  await page.waitForSelector('.lay.sketch');
  assert.strictEqual(await page.textContent('#sketchName'), '스케치', 'auto recommended sketch');
  // 레이어 순서: 스케치 바로 아래에 밑색_Flat
  const names = await page.$$eval('.lay .lname > div:first-child', (e) => e.map((x) => x.textContent));
  assert.deepStrictEqual(names, ['스케치', '밑색_Flat', '그룹', '음영', '배경']);
  await page.screenshot({ path: (process.argv[4] || 'shot') + '-1.png' });
  // Auto-Flat (틈새 막기 6)
  await page.$eval('#gap', (e) => { e.value = 6; e.dispatchEvent(new Event('input')); });
  await page.click('#btnAuto');
  await page.waitForSelector('#busy', { state: 'hidden' });
  let painted = await page.evaluate(() => { const S = window.__flatApp, d = S.flat.imageData.data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  assert.ok(painted > 3000, 'auto flat painted ' + painted);
  await page.screenshot({ path: (process.argv[4] || 'shot') + '-auto.png' });
  // 팔레트 터치: undo 후 한 영역만
  await page.click('#btnUndo');
  assert.strictEqual(await page.evaluate(() => window.__flatApp.flat.imageData.data.some((v) => v)), false, 'undo clears');
  await page.click('#modeTouch');
  await page.click('.sw:nth-child(5)');
  const box = await page.$eval('#cv', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.mouse.click(box.x + box.w * (140 / 200), box.y + box.h * (80 / 160));
  await page.waitForSelector('#busy', { state: 'hidden' });
  const px = await page.evaluate(() => { const d = window.__flatApp.flat.imageData.data; const i = (80 * 200 + 140) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; });
  assert.deepStrictEqual(px, [0xf2, 0xa0, 0xa0, 255], 'touch fill color ' + px);
  // 25번 연속 채우기 → undo 20단계 이상
  for (let i = 0; i < 22; i++) { await page.click(`.sw:nth-child(${(i % 20) + 1})`); await page.mouse.click(box.x + box.w * (140 / 200), box.y + box.h * (80 / 160)); await page.waitForSelector('#busy', { state: 'hidden' }); }
  assert.strictEqual(await page.evaluate(() => window.__flatApp.undo.length), 23);
  // 줌: 휠
  const z0 = await page.textContent('#zPct'); await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.wheel(0, -400);
  assert.notStrictEqual(await page.textContent('#zPct'), z0);
  // 저장 → 재로드해 구조 검증
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const out = (process.argv[4] || 'out') + '.psd'; await dl.saveAs(out);
  const o = agPsd.readPsd(fs.readFileSync(out), { useImageData: true, skipThumbnail: true });
  const src = agPsd.readPsd(fs.readFileSync(input), { useImageData: true, skipThumbnail: true });
  assert.deepStrictEqual(o.children.map((l) => l.name), ['배경', '그룹', '밑색_Flat', '스케치']);
  assert.strictEqual(o.children[3].opacity.toFixed(2), '0.80'); assert.strictEqual(o.children[1].children[0].blendMode, 'multiply');
  assert.strictEqual(o.children[1].children[0].opacity.toFixed(2), '0.50');
  assert.deepStrictEqual([o.width, o.height], [src.width, src.height]);
  for (const k of [0, 1]) { /* 기존 레이어 픽셀 보존 */ }
  assert.ok(Buffer.compare(Buffer.from(o.children[0].imageData.data), Buffer.from(src.children[0].imageData.data)) === 0, 'bg pixels preserved');
  assert.ok(Buffer.compare(Buffer.from(o.children[3].imageData.data), Buffer.from(src.children[2].imageData.data)) === 0, 'sketch pixels preserved');
  assert.ok(o.children[2].imageData && o.children[2].imageData.width > 0, 'flat has pixels');
  assert.deepStrictEqual(errs, [], 'no console errors');
  console.log('e2e OK');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
