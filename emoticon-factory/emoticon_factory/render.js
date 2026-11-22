// 사용법: node render.js manifest.json  -> manifest의 각 항목(svg 문자열)을 투명 배경 PNG로 저장
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const items = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const it of items) {
    await p.setViewportSize({ width: it.w, height: it.h });
    await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${it.svg}</body></html>`);
    await p.screenshot({ path: it.out, omitBackground: true, clip: { x: 0, y: 0, width: it.w, height: it.h } });
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
