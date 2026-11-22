(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const FLAT_NAME = '밑색_Flat';
  const MAX_UNDO = 60, MAX_UNDO_BYTES = 400 * 1024 * 1024;

  const S = {
    psd: null, W: 0, H: 0, fileName: 'untitled.psd',
    meta: new Map(),        // layer -> {parent: Layer[], canvas, depth}
    vis: new Map(),         // layer -> boolean (눈 아이콘)
    origHidden: new Map(),
    collapsed: new Set(),
    sketch: null, sketchId: 0, flat: null, flatCanvas: null, flatImg: null,
    mode: 'auto', color: '#e8a0a0', palette: [],
    undo: [], redo: [], contentBox: null,
    regions: null, regionKey: '',
    view: { s: 1, x: 0, y: 0 },
  };
  const cv = $('#cv'), ctx = cv.getContext('2d'), stage = $('#stage'), wrap = $('#wrap');

  /* ---------- 유틸 ---------- */
  const tick = () => new Promise((r) => setTimeout(r, 30));
  let toastTimer;
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2200);
  }
  async function busy(msg, fn) {
    $('#busyMsg').textContent = msg; $('#busy').hidden = false;
    await tick();
    try { return await fn(); } finally { $('#busy').hidden = true; }
  }
  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 사파리 비공개 모드 등 */ } };

  /* ---------- PSD 로드 ---------- */
  function indexTree(children, depth) {
    for (const l of children) {
      S.meta.set(l, { parent: children, depth, canvas: null });
      S.vis.set(l, !l.hidden);
      S.origHidden.set(l, !!l.hidden);
      if (l.children) indexTree(l.children, depth + 1);
      else if (l.imageData && l.imageData.width > 0 && l.imageData.height > 0) {
        const c = document.createElement('canvas');
        c.width = l.imageData.width; c.height = l.imageData.height;
        c.getContext('2d').putImageData(new ImageData(l.imageData.data, c.width, c.height), 0, 0);
        S.meta.get(l).canvas = c;
      }
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (!/\.psd$/i.test(file.name) && !/photoshop/.test(file.type)) { toast('.psd 파일만 열 수 있어요.', true); return; }
    try {
      await busy('PSD 읽는 중…', async () => {
        const buf = await file.arrayBuffer();
        const psd = agPsd.readPsd(buf, { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
        if (!psd.children) psd.children = [];
        resetState();
        S.psd = psd; S.W = psd.width; S.H = psd.height; S.fileName = file.name;
        indexTree(psd.children, 0);
        cv.width = S.W; cv.height = S.H;
        const guess = recommendSketch();
        if (guess) setSketch(guess, true);
        renderLayerList(); render(); fitView();
        $('#empty').hidden = true;
        refreshButtons();
        if (psd.bitsPerChannel && psd.bitsPerChannel !== 8) toast('8비트가 아닌 PSD입니다. 색 정보가 8비트로 저장될 수 있어요.', true);
        else if (psd.colorMode != null && psd.colorMode !== 3) toast('RGB가 아닌 색 모드입니다. 결과가 다를 수 있어요.', true);
        else toast(`불러옴: ${S.W}×${S.H}px, 레이어 ${S.meta.size}개`);
      });
    } catch (e) {
      console.error(e); toast('PSD를 읽지 못했습니다: ' + (e && e.message || e), true);
    }
  }

  function resetState() {
    S.meta.clear(); S.vis.clear(); S.origHidden.clear(); S.collapsed.clear();
    S.sketch = null; S.flat = null; S.flatCanvas = null; S.flatImg = null;
    S.undo = []; S.redo = []; S.contentBox = null; S.regions = null; S.regionKey = '';
  }

  function allLayersTopDown() {
    const out = [];
    (function walk(arr) { for (let i = arr.length - 1; i >= 0; i--) { out.push(arr[i]); if (arr[i].children) walk(arr[i].children); } })(S.psd.children);
    return out;
  }
  const isRaster = (l) => !l.children && S.meta.get(l) && S.meta.get(l).canvas;
  function opaqueRatio(l) {
    const d = l.imageData.data; let o = 0, n = 0;
    for (let i = 3; i < d.length; i += 4 * 17) { n++; if (d[i] >= 250) o++; }
    return n ? o / n : 0;
  }
  function recommendSketch() {
    const list = allLayersTopDown().filter((l) => isRaster(l) && l !== S.flat);
    const nameRe = /sketch|line|ink|draft|outline|스케치|선화|밑그림|라인|선$/i;
    const bgRe = /background|bg|배경|paper|종이|color fill/i;
    return list.find((l) => nameRe.test(l.name || '') && S.vis.get(l))
      || list.find((l) => S.vis.get(l) && !bgRe.test(l.name || '') && opaqueRatio(l) < 0.9)
      || list.find((l) => !bgRe.test(l.name || ''))
      || list[0] || null;
  }

  /* ---------- 밑색 레이어 ---------- */
  function ensureFlat() {
    if (S.flat) return;
    const data = new Uint8ClampedArray(S.W * S.H * 4);
    S.flat = { name: FLAT_NAME, left: 0, top: 0, opacity: 1, blendMode: 'normal', imageData: { width: S.W, height: S.H, data } };
    S.flatCanvas = document.createElement('canvas'); S.flatCanvas.width = S.W; S.flatCanvas.height = S.H;
    S.flatImg = new ImageData(data, S.W, S.H);
    S.vis.set(S.flat, true); S.origHidden.set(S.flat, false);
    S.meta.set(S.flat, { parent: null, depth: 0, canvas: S.flatCanvas });
  }

  /** 선화 레이어 바로 아래(= 같은 부모 배열의 해당 인덱스)에 밑색 레이어를 둔다 */
  function setSketch(layer, silent) {
    if (!isRaster(layer)) { toast('그림이 있는 일반 레이어만 선화로 지정할 수 있어요.', true); return; }
    ensureFlat();
    const old = S.meta.get(S.flat).parent;
    if (old) old.splice(old.indexOf(S.flat), 1);
    S.sketch = layer; S.sketchId++; S.regions = null; S.regionKey = '';
    const parent = S.meta.get(layer).parent;
    parent.splice(parent.indexOf(layer), 0, S.flat);
    const m = S.meta.get(S.flat); m.parent = parent; m.depth = S.meta.get(layer).depth;
    $('#sketchName').textContent = layer.name || '(이름 없음)';
    renderLayerList(); render(); refreshButtons();
    if (!silent) toast(`'${layer.name}' 바로 아래에 ${FLAT_NAME} 레이어를 두었어요.`);
  }

  /* ---------- 합성 렌더링 ---------- */
  const BLEND = { multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color dodge': 'color-dodge', 'linear dodge': 'lighter', 'color burn': 'color-burn', 'hard light': 'hard-light', 'soft light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity' };
  const op = (l) => BLEND[l.blendMode] || 'source-over';
  const opacityOf = (l) => (l.opacity == null ? 1 : l.opacity);
  function newCanvas() { const c = document.createElement('canvas'); c.width = S.W; c.height = S.H; return c; }

  function drawLayers(g, layers, isVis) {
    let base = null; // 클리핑 마스크 기준 레이어
    for (const l of layers) {
      if (!isVis(l)) { if (!l.clipping) base = null; continue; }
      const m = S.meta.get(l);
      if (l.children) {
        base = null;
        const pass = !l.blendMode || l.blendMode === 'pass through';
        if (pass && opacityOf(l) === 1) drawLayers(g, l.children, isVis);
        else {
          const t = newCanvas(); drawLayers(t.getContext('2d'), l.children, isVis);
          g.globalAlpha = opacityOf(l); g.globalCompositeOperation = pass ? 'source-over' : op(l);
          g.drawImage(t, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        }
      } else if (m && m.canvas) {
        const x = l.left || 0, y = l.top || 0;
        if (l.clipping && base) {
          const t = newCanvas(), tg = t.getContext('2d');
          tg.drawImage(m.canvas, x, y);
          tg.globalCompositeOperation = 'destination-in'; tg.drawImage(base.canvas, base.x, base.y);
          g.globalAlpha = opacityOf(l); g.globalCompositeOperation = op(l);
          g.drawImage(t, 0, 0);
        } else {
          g.globalAlpha = opacityOf(l); g.globalCompositeOperation = op(l);
          g.drawImage(m.canvas, x, y);
          if (!l.clipping) base = { canvas: m.canvas, x, y };
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      } else if (!l.clipping) base = null;
    }
  }
  let rafId = 0;
  function render() {
    if (!S.psd || rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      ctx.clearRect(0, 0, S.W, S.H);
      drawLayers(ctx, S.psd.children, (l) => S.vis.get(l));
    });
  }

  /* ---------- 레이어 패널 ---------- */
  function renderLayerList() {
    const box = $('#layerList'); box.innerHTML = '';
    if (!S.psd) { box.innerHTML = '<p class="hint">PSD를 열면 레이어가 표시됩니다.</p>'; return; }
    (function walk(arr) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const l = arr[i], m = S.meta.get(l);
        const row = document.createElement('div');
        const isGroup = !!l.children, isFlat = l === S.flat, isSketch = l === S.sketch, usable = isRaster(l);
        row.className = 'lay' + (isGroup ? ' group' : '') + (isFlat ? ' flat' : '') + (isSketch ? ' sketch' : '') + (!usable && !isGroup ? ' dis' : '');
        row.style.marginLeft = (m.depth * 14) + 'px';
        const eye = document.createElement('button');
        eye.className = 'eye' + (S.vis.get(l) ? '' : ' off'); eye.textContent = '👁'; eye.title = '표시/숨김';
        eye.onclick = (e) => { e.stopPropagation(); S.vis.set(l, !S.vis.get(l)); eye.classList.toggle('off', !S.vis.get(l)); render(); };
        row.appendChild(eye);
        if (isGroup) {
          const f = document.createElement('span'); f.textContent = S.collapsed.has(l) ? '📁' : '📂'; row.appendChild(f);
        } else if (m.canvas) {
          const t = document.createElement('canvas'); t.className = 'thumb'; t.width = 36; t.height = 36;
          const sc = Math.min(36 / m.canvas.width, 36 / m.canvas.height), tw = m.canvas.width * sc, th = m.canvas.height * sc;
          t.getContext('2d').drawImage(m.canvas, (36 - tw) / 2, (36 - th) / 2, tw, th);
          row.appendChild(t);
        }
        const n = document.createElement('div'); n.className = 'lname';
        const op100 = Math.round(opacityOf(l) * 100);
        n.innerHTML = '';
        const nm = document.createElement('div'); nm.textContent = l.name || '(이름 없음)';
        const mt = document.createElement('div'); mt.className = 'lmeta';
        mt.textContent = `${op100}% · ${l.blendMode || 'normal'}`;
        n.append(nm, mt); row.appendChild(n);
        if (isSketch) row.insertAdjacentHTML('beforeend', '<span class="badge">선화</span>');
        if (isFlat) row.insertAdjacentHTML('beforeend', '<span class="badge">활성</span>');
        row.onclick = () => {
          if (isGroup) { S.collapsed.has(l) ? S.collapsed.delete(l) : S.collapsed.add(l); renderLayerList(); }
          else if (isFlat) toast('밑색 레이어는 선화 레이어를 바꾸면 따라 이동합니다.');
          else if (usable) setSketch(l);
        };
        box.appendChild(row);
        if (isGroup && !S.collapsed.has(l)) walk(l.children);
      }
    })(S.psd.children);
  }

  /* ---------- 영역 계산 / 채우기 ---------- */
  const params = () => ({ gap: +$('#gap').value, expand: +$('#exp').value, thr: +$('#thr').value });
  function getRegions() {
    const p = params(), key = `${S.sketchId}|${p.gap}|${p.expand}|${p.thr}`;
    if (S.regions && S.regionKey === key) return S.regions;
    const sk = S.sketch;
    const mask = Flat.buildLineMask(sk.imageData, sk.left, sk.top, S.W, S.H, p.thr);
    S.regions = Flat.computeRegions(mask, S.W, S.H, { gap: p.gap, expand: p.expand });
    S.regionKey = key;
    return S.regions;
  }

  function snapshot(r) {
    const W = S.W, d = S.flat.imageData.data, out = new Uint8ClampedArray(r.w * r.h * 4);
    for (let y = 0; y < r.h; y++) out.set(d.subarray(((r.y + y) * W + r.x) * 4, ((r.y + y) * W + r.x + r.w) * 4), y * r.w * 4);
    return { rect: r, data: out };
  }
  function restore(s) {
    const W = S.W, d = S.flat.imageData.data, r = s.rect;
    for (let y = 0; y < r.h; y++) d.set(s.data.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((r.y + y) * W + r.x) * 4);
    pushDirty(r);
  }
  function pushDirty(r) {
    S.flatCanvas.getContext('2d').putImageData(S.flatImg, 0, 0, r.x, r.y, r.w, r.h);
    render(); refreshButtons();
  }
  const union = (a, b) => { if (!a) return b; if (!b) return a; const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
  function pushUndo(snap) {
    S.undo.push(snap); S.redo = [];
    let bytes = 0;
    for (let i = S.undo.length - 1; i >= 0; i--) { bytes += S.undo[i].data.byteLength; if (bytes > MAX_UNDO_BYTES && i < S.undo.length - 1) { S.undo.splice(0, i + 1); break; } }
    if (S.undo.length > MAX_UNDO) S.undo.shift();
  }
  function undo() {
    const s = S.undo.pop(); if (!s) return;
    S.redo.push(snapshot(s.rect)); restore(s);
  }
  function redo() {
    const s = S.redo.pop(); if (!s) return;
    S.undo.push(snapshot(s.rect)); restore(s);
  }

  function needSketch() { if (!S.psd || !S.sketch) { toast('먼저 PSD를 열고 선화 레이어를 지정하세요.', true); return true; } return false; }

  async function runAuto() {
    if (needSketch()) return;
    await busy('영역을 분리하는 중…', () => {
      const reg = getRegions();
      if (reg.regionCount === 0) { toast('닫힌 영역을 찾지 못했어요. 틈새 막기를 올리거나 선 민감도를 낮춰 보세요.', true); return; }
      let rect = union(S.contentBox, null);
      const whole = { x: 0, y: 0, w: S.W, h: S.H };
      let region = null;
      for (let i = 1; i <= reg.count; i++) {
        if (!reg.valid[i] || i === reg.bg || reg.bbox[i * 4 + 2] < 0) continue;
        region = union(region, Flat.rectOfLabel(reg, i));
      }
      rect = union(rect, region) || whole;
      pushUndo(snapshot(rect));
      const d = S.flat.imageData.data, W = S.W;
      for (let y = rect.y; y < rect.y + rect.h; y++) d.fill(0, (y * W + rect.x) * 4, (y * W + rect.x + rect.w) * 4);
      Flat.paintAll(reg, d);
      S.contentBox = rect;
      pushDirty(rect);
      toast(`${reg.regionCount}개 영역을 채웠어요.`);
    });
  }

  async function touchFill(px, py) {
    if (needSketch()) return;
    if (px < 0 || py < 0 || px >= S.W || py >= S.H) return;
    await busy('영역 계산 중…', () => {
      const reg = getRegions();
      const lab = Flat.labelAt(reg, px, py, 8);
      if (!lab || !reg.valid[lab]) { toast('채울 수 있는 영역이 아니에요 (선 위이거나 아주 작은 영역).'); return; }
      const r = Flat.rectOfLabel(reg, lab);
      pushUndo(snapshot(r));
      Flat.paintRegion(reg, lab, hex2rgb(S.color), S.flat.imageData.data);
      S.contentBox = union(S.contentBox, r);
      pushDirty(r);
    });
  }

  function clearFlat() {
    if (!S.flat || !S.contentBox) { toast('비울 내용이 없어요.'); return; }
    const r = S.contentBox; pushUndo(snapshot(r));
    const d = S.flat.imageData.data, W = S.W;
    for (let y = r.y; y < r.y + r.h; y++) d.fill(0, (y * W + r.x) * 4, (y * W + r.x + r.w) * 4);
    pushDirty(r);
  }

  /* ---------- 저장 ---------- */
  function cropFlat() {
    const { data } = S.flat.imageData, W = S.W, H = S.H;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    const r = S.contentBox || { x: 0, y: 0, w: W, h: H };
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (data[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return { name: FLAT_NAME, opacity: S.flat.opacity, blendMode: 'normal', hidden: !isVisibleForExport(S.flat) };
    const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
    return { name: FLAT_NAME, left: x0, top: y0, opacity: S.flat.opacity, blendMode: 'normal', hidden: !isVisibleForExport(S.flat), imageData: { width: w, height: h, data: out } };
  }
  const isVisibleForExport = (l) => ($('#optVis').checked ? S.vis.get(l) : (l === S.flat ? true : !S.origHidden.get(l)));

  function buildPsdBuffer() {
    const reflect = $('#optVis').checked;
    const exportFlat = cropFlat();
    // 합성 미리보기(PSD 마지막 평면 이미지) 갱신
    const comp = newCanvas(), cg = comp.getContext('2d');
    drawLayers(cg, S.psd.children, (l) => isVisibleForExport(l));
    const arr = S.meta.get(S.flat).parent, idx = arr.indexOf(S.flat);
    const hiddenBackup = new Map();
    const prevImg = S.psd.imageData;
    try {
      for (const l of S.meta.keys()) if (l !== S.flat) { hiddenBackup.set(l, l.hidden); l.hidden = reflect ? !S.vis.get(l) : S.origHidden.get(l); }
      arr[idx] = exportFlat;
      S.psd.imageData = cg.getImageData(0, 0, S.W, S.H);
      return agPsd.writePsd(S.psd, { generateThumbnail: true });
    } finally {
      arr[idx] = S.flat; S.psd.imageData = prevImg;
      for (const [l, h] of hiddenBackup) l.hidden = h;
    }
  }
  const outName = () => S.fileName.replace(/\.psd$/i, '') + '_flat.psd';

  // 확장자 허용 목록에 .psd 가 없는 환경(Claude 아티팩트)용: 무압축 zip 으로 감싸기
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zipStore(name, u8) {
    const nm = new TextEncoder().encode(name), crc = crc32(u8), n = u8.length;
    const out = new Uint8Array(30 + nm.length + n + 46 + nm.length + 22), dv = new DataView(out.buffer);
    let o = 0; const w16 = (v) => { dv.setUint16(o, v, true); o += 2; }, w32 = (v) => { dv.setUint32(o, v, true); o += 4; };
    w32(0x04034b50); w16(20); w16(0x0800); w16(0); w16(0); w16(0x21); w32(crc); w32(n); w32(n); w16(nm.length); w16(0);
    out.set(nm, o); o += nm.length; out.set(u8, o); o += n;
    const cd = o;
    w32(0x02014b50); w16(20); w16(20); w16(0x0800); w16(0); w16(0); w16(0x21); w32(crc); w32(n); w32(n); w16(nm.length); w16(0); w16(0); w16(0); w16(0); w32(0); w32(0);
    out.set(nm, o); o += nm.length;
    const cdSize = o - cd;
    w32(0x06054b50); w16(0); w16(0); w16(1); w16(1); w32(cdSize); w32(cd); w16(0);
    return out;
  }
  async function savePsd() {
    if (!S.psd || !S.flat) return;
    try {
      const buf = await busy('PSD 만드는 중…', () => buildPsdBuffer());
      let dl = null;
      try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
      if (dl) {
        const zipName = outName().replace(/\.psd$/i, '') + '.zip';
        try { await dl.save({ filename: zipName, data: zipStore(outName(), new Uint8Array(buf)) }); toast(`${zipName} 저장됨 (압축을 풀면 ${outName()})`); }
        catch (e) { if (!e || e.code !== 'declined') toast('저장하지 못했어요: ' + (e && (e.message || e.code) || e), true); }
        return;
      }
      const blob = new Blob([buf], { type: 'image/vnd.adobe.photoshop' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = outName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      toast('저장했어요: ' + outName());
    } catch (e) { console.error(e); toast('저장 실패: ' + (e && e.message || e), true); }
  }
  async function sharePsd() {
    if (!S.psd || !S.flat) return;
    try {
      const buf = await busy('PSD 만드는 중…', () => buildPsdBuffer());
      const file = new File([buf], outName(), { type: 'image/vnd.adobe.photoshop' });
      await navigator.share({ files: [file], title: outName() });
    } catch (e) { if (e && e.name === 'AbortError') return; console.error(e); toast('공유하지 못했어요. "PSD 저장" 버튼을 사용해 보세요.', true); }
  }

  /* ---------- 뷰(줌/팬) ---------- */
  let userView = false;
  function applyView() {
    const v = S.view;
    wrap.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.s})`;
    cv.classList.toggle('px', v.s >= 3);
    $('#zPct').textContent = Math.round(v.s * 100) + '%';
  }
  function fitView() {
    if (!S.psd) return;
    const r = stage.getBoundingClientRect();
    const s = Math.min(r.width / S.W, r.height / S.H) * 0.95;
    S.view = { s, x: (r.width - S.W * s) / 2, y: (r.height - S.H * s) / 2 };
    userView = false; applyView();
  }
  function zoomAt(cx, cy, factor) {
    userView = true;
    const v = S.view, ns = Math.min(Math.max(v.s * factor, 0.02), 40), k = ns / v.s;
    v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.s = ns; applyView();
  }
  const rel = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const ptrs = new Map(); let gest = null, moved = false, downT = 0;
  stage.addEventListener('pointerdown', (e) => {
    if (!S.psd) return;
    stage.setPointerCapture(e.pointerId);
    const p = rel(e); ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y });
    if (ptrs.size === 1) { moved = false; downT = performance.now(); }
    if (ptrs.size === 2) { moved = true; gest = pinchState(); }
  });
  function pinchState() {
    const [a, b] = [...ptrs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  stage.addEventListener('pointermove', (e) => {
    const q = ptrs.get(e.pointerId); if (!q) return;
    const p = rel(e), dx = p.x - q.x, dy = p.y - q.y; q.x = p.x; q.y = p.y;
    if (ptrs.size === 1) {
      if (Math.hypot(p.x - q.sx, p.y - q.sy) > 6) moved = true;
      if (moved) { userView = true; S.view.x += dx; S.view.y += dy; applyView(); }
    } else if (ptrs.size === 2 && gest) {
      const n = pinchState();
      zoomAt(gest.mx, gest.my, n.d / gest.d);
      S.view.x += n.mx - gest.mx; S.view.y += n.my - gest.my; applyView();
      gest = n;
    }
  });
  function endPtr(e) {
    const q = ptrs.get(e.pointerId); if (!q) return;
    const wasSingle = ptrs.size === 1;
    ptrs.delete(e.pointerId); gest = null;
    if (ptrs.size === 1) { const r = ptrs.values().next().value; r.sx = r.x; r.sy = r.y; }
    if (e.type === 'pointerup' && wasSingle && !moved && performance.now() - downT < 600) onTap(e);
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', (e) => {
    if (!S.psd) return; e.preventDefault();
    const p = rel(e), f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt(p.x, p.y, f);
  }, { passive: false });
  stage.addEventListener('gesturestart', (e) => e.preventDefault());

  function onTap(e) {
    if (S.mode !== 'touch') return;
    const p = rel(e), v = S.view;
    touchFill(Math.floor((p.x - v.x) / v.s), Math.floor((p.y - v.y) / v.s));
  }

  /* ---------- 팔레트 ---------- */
  const DEFAULT_PALETTE = ['#ffe0cc', '#f5c6a5', '#e8a77f', '#c98a62', '#f2a0a0', '#e0606a', '#c23b4b', '#f7b6d2', '#f9d56e', '#f2a93b', '#e07a2f', '#a8d672', '#5fb760', '#2e8b57', '#86d6d0', '#4fa8d8', '#3a6fd8', '#6a5acd', '#b69cf0', '#8a5a44', '#5a3e36', '#2b2b33', '#9a9aa5', '#ffffff'];
  function renderPalette() {
    const box = $('#palette'); box.innerHTML = '';
    for (const c of S.palette) {
      const b = document.createElement('button');
      b.className = 'sw' + (c.toLowerCase() === S.color.toLowerCase() ? ' on' : '');
      b.style.background = c; b.title = c;
      b.onclick = () => { S.color = c; $('#colorPick').value = c; lsSet('psdflat.color', c); renderPalette(); };
      box.appendChild(b);
    }
  }
  function initPalette() {
    S.palette = lsGet('psdflat.palette', DEFAULT_PALETTE.slice());
    S.color = lsGet('psdflat.color', S.palette[0] || '#e8a0a0');
    $('#colorPick').value = /^#[0-9a-f]{6}$/i.test(S.color) ? S.color : '#e8a0a0';
    renderPalette();
  }
  $('#colorPick').addEventListener('input', (e) => { S.color = e.target.value; renderPalette(); });
  $('#palAdd').onclick = () => {
    const c = $('#colorPick').value.toLowerCase();
    if (!S.palette.some((x) => x.toLowerCase() === c)) S.palette.push(c);
    S.color = c; lsSet('psdflat.palette', S.palette); lsSet('psdflat.color', c); renderPalette();
  };
  $('#palDel').onclick = () => {
    const i = S.palette.findIndex((x) => x.toLowerCase() === S.color.toLowerCase());
    if (i < 0) { toast('팔레트에서 삭제할 색을 먼저 선택하세요.'); return; }
    S.palette.splice(i, 1); S.color = S.palette[0] || '#e8a0a0';
    lsSet('psdflat.palette', S.palette); lsSet('psdflat.color', S.color); $('#colorPick').value = S.color; renderPalette();
  };

  /* ---------- UI 연결 ---------- */
  function refreshButtons() {
    const has = !!(S.psd && S.flat && S.sketch);
    $('#btnSave').disabled = !has; $('#btnShare').disabled = !has;
    $('#btnAuto').disabled = !has; $('#btnClear').disabled = !has;
    $('#btnUndo').disabled = !S.undo.length; $('#btnRedo').disabled = !S.redo.length;
  }
  function setMode(m) {
    S.mode = m;
    $('#modeAuto').classList.toggle('on', m === 'auto'); $('#modeTouch').classList.toggle('on', m === 'touch');
    $('#paneAuto').hidden = m !== 'auto'; $('#paneTouch').hidden = m !== 'touch';
    stage.style.cursor = m === 'touch' ? 'crosshair' : 'grab';
  }
  $('#modeAuto').onclick = () => setMode('auto');
  $('#modeTouch').onclick = () => setMode('touch');
  $('#btnAuto').onclick = runAuto;
  $('#btnClear').onclick = clearFlat;
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnOpen').onclick = () => $('#file').click();
  $('#file').onchange = (e) => { loadFile(e.target.files[0]); e.target.value = ''; };
  $('#btnSave').onclick = savePsd; $('#btnShare').onclick = sharePsd;
  $('#zIn').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.3); };
  $('#zOut').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.3); };
  $('#zFit').onclick = fitView;
  for (const [id, out] of [['gap', 'gapV'], ['exp', 'expV'], ['thr', 'thrV']]) {
    $('#' + id).addEventListener('input', (e) => { $('#' + out).textContent = e.target.value; lsSet('psdflat.' + id, e.target.value); });
    const saved = lsGet('psdflat.' + id, null); if (saved != null) { $('#' + id).value = saved; $('#' + out).textContent = saved; }
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
    document.body.dataset.tab = b.dataset.tab;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
    }
  });
  // 드래그 앤 드롭
  ['dragenter', 'dragover'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.classList.remove('drag'); }));
  stage.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
  window.addEventListener('resize', () => { if (S.psd) applyView(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (S.psd && !userView) fitView(); }).observe(stage);
  // 공유 시트(아이패드 파일 앱 저장용): 파일 공유를 지원하는 기기에서만 노출
  try {
    const probe = new File([new Uint8Array(1)], 'a.psd', { type: 'image/vnd.adobe.photoshop' });
    if (navigator.canShare && navigator.canShare({ files: [probe] }) && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) $('#btnShare').hidden = false;
  } catch (e) { /* 미지원 */ }

  initPalette(); setMode('auto'); renderLayerList(); refreshButtons();
  window.__flatApp = S; window.__zipStore = zipStore; // 디버그/테스트용
})();
