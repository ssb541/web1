/* 밑색(Flat) 영역 분리 / 채우기 알고리즘 — DOM 비의존 (브라우저 & Node 공용) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Flat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 스케치 레이어(imageData)를 문서 크기 W×H 의 선 마스크(1=선)로 변환 */
  function buildLineMask(img, left, top, W, H, thr) {
    const mask = new Uint8Array(W * H);
    if (!img || !img.data) return mask;
    const { data, width, height } = img;
    left = left | 0; top = top | 0;
    // 완전 불투명 레이어(흰 종이 위 검은 선)면 밝기로, 아니면 알파로 선을 판정
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] >= 250) opaque++;
    const useLum = opaque / (width * height) > 0.98;
    const lumLimit = 255 - thr;
    for (let y = 0; y < height; y++) {
      const dy = y + top;
      if (dy < 0 || dy >= H) continue;
      for (let x = 0; x < width; x++) {
        const dx = x + left;
        if (dx < 0 || dx >= W) continue;
        const i = (y * width + x) * 4;
        let isLine;
        if (useLum) isLine = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) < lumLimit;
        else isLine = data[i + 3] >= thr;
        if (isLine) mask[dy * W + dx] = 1;
      }
    }
    return mask;
  }

  /** 정사각 윈도우 팽창 (반지름 R). O(N) */
  function dilate(mask, W, H, R) {
    if (R <= 0) return mask;
    const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    const pre = new Int32Array(W + 1);
    for (let y = 0; y < H; y++) {
      const o = y * W;
      for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + mask[o + x];
      for (let x = 0; x < W; x++) {
        const lo = x - R < 0 ? 0 : x - R, hi = x + R > W - 1 ? W - 1 : x + R;
        tmp[o + x] = pre[hi + 1] - pre[lo] > 0 ? 1 : 0;
      }
    }
    const cnt = new Int32Array(W);
    for (let y = 0; y < Math.min(R, H); y++) for (let x = 0; x < W; x++) cnt[x] += tmp[y * W + x];
    for (let y = 0; y < H; y++) {
      const add = y + R, rem = y - R - 1;
      if (add < H) for (let x = 0; x < W; x++) cnt[x] += tmp[add * W + x];
      if (rem >= 0) for (let x = 0; x < W; x++) cnt[x] -= tmp[rem * W + x];
      const o = y * W;
      for (let x = 0; x < W; x++) out[o + x] = cnt[x] > 0 ? 1 : 0;
    }
    return out;
  }

  /** blocked 가 아닌 픽셀을 4-연결로 라벨링 (스캔라인 flood fill) */
  function labelFree(blocked, W, H) {
    const N = W * H, labels = new Int32Array(N);
    const areas = [0], border = [false];
    let count = 0;
    for (let s = 0; s < N; s++) {
      if (blocked[s] || labels[s]) continue;
      count++;
      let area = 0, bd = false;
      const stack = [s];
      while (stack.length) {
        const p = stack.pop();
        if (labels[p] || blocked[p]) continue;
        const y = (p / W) | 0, row = y * W;
        let l = p - row, r = l;
        while (l > 0 && !blocked[row + l - 1] && !labels[row + l - 1]) l--;
        while (r < W - 1 && !blocked[row + r + 1] && !labels[row + r + 1]) r++;
        for (let i = l; i <= r; i++) labels[row + i] = count;
        area += r - l + 1;
        if (l === 0 || r === W - 1 || y === 0 || y === H - 1) bd = true;
        for (let dy = -1; dy <= 1; dy += 2) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          const base = ny * W;
          let inRun = false;
          for (let i = l; i <= r; i++) {
            const q = base + i, ok = !blocked[q] && !labels[q];
            if (ok && !inRun) { stack.push(q); inRun = true; } else if (!ok) inRun = false;
          }
        }
      }
      areas.push(area); border.push(bd);
    }
    return { labels, count, areas, border };
  }

  /**
   * 영역 맵 계산.
   * gap    : 선 틈새 막기 (px, 0~15)
   * expand : 선 아래로 번지는 px (1~3)
   * 반환 labels: 픽셀별 영역 id (0 = 없음), bg: 외곽 배경 id, valid[id], bbox[id*4..]
   */
  function computeRegions(lineMask, W, H, opts) {
    const gap = Math.max(0, opts.gap | 0), expand = Math.max(0, opts.expand | 0);
    const minArea = opts.minArea == null ? 6 : opts.minArea;
    const N = W * H;
    const R = Math.ceil(gap / 2);
    const blocked = dilate(lineMask, W, H, R);
    const { labels, count, areas, border } = labelFree(blocked, W, H);

    // 외곽 배경 = 화면 가장자리에 닿은 영역 중 가장 큰 것
    let bg = 0, bgArea = -1;
    for (let i = 1; i <= count; i++) if (border[i] && areas[i] > bgArea) { bg = i; bgArea = areas[i]; }

    // 티끌 영역 제거
    const valid = new Uint8Array(count + 1);
    for (let i = 1; i <= count; i++) valid[i] = (areas[i] >= minArea || i === bg) ? 1 : 0;
    for (let p = 0; p < N; p++) { const l = labels[p]; if (l && !valid[l]) labels[p] = 0; }

    const queue = new Int32Array(N);
    const neighbors = (p, fn) => {
      const y = (p / W) | 0, x = p - y * W;
      if (x > 0) fn(p - 1);
      if (x < W - 1) fn(p + 1);
      if (y > 0) fn(p - W);
      if (y < H - 1) fn(p + W);
    };

    // 단계 A: 선이 아닌 빈 픽셀(틈새 막은 띠 포함)을 가까운 영역에 배정
    let qh = 0, qt = 0;
    for (let p = 0; p < N; p++) {
      if (!labels[p]) continue;
      let seed = false;
      neighbors(p, (q) => { if (!labels[q] && !lineMask[q]) seed = true; });
      if (seed) queue[qt++] = p;
    }
    while (qh < qt) {
      const p = queue[qh++], lab = labels[p];
      neighbors(p, (q) => { if (!labels[q] && !lineMask[q]) { labels[q] = lab; queue[qt++] = q; } });
    }

    // 단계 B: 선 픽셀 안으로 expand px 만큼 번지게 (흰 테두리 방지)
    qh = 0; qt = 0;
    if (expand > 0) {
      for (let p = 0; p < N; p++) {
        if (!labels[p]) continue;
        let seed = false;
        neighbors(p, (q) => { if (!labels[q]) seed = true; });
        if (seed) queue[qt++] = p;
      }
      for (let step = 0; step < expand; step++) {
        const end = qt;
        if (qh >= end) break;
        while (qh < end) {
          const p = queue[qh++], lab = labels[p];
          neighbors(p, (q) => { if (!labels[q]) { labels[q] = lab; queue[qt++] = q; } });
        }
      }
    }

    // 영역별 bbox
    const bbox = new Int32Array((count + 1) * 4);
    for (let i = 0; i <= count; i++) { bbox[i * 4] = W; bbox[i * 4 + 1] = H; bbox[i * 4 + 2] = -1; bbox[i * 4 + 3] = -1; }
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const l = labels[row + x];
        if (!l) continue;
        const b = l * 4;
        if (x < bbox[b]) bbox[b] = x;
        if (y < bbox[b + 1]) bbox[b + 1] = y;
        if (x > bbox[b + 2]) bbox[b + 2] = x;
        if (y > bbox[b + 3]) bbox[b + 3] = y;
      }
    }
    let regionCount = 0;
    for (let i = 1; i <= count; i++) if (valid[i] && i !== bg) regionCount++;
    return { labels, W, H, count, bg, valid, bbox, regionCount };
  }

  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }
  /** 영역 id → 구분하기 쉬운 색 */
  function colorForLabel(i) {
    return hsl2rgb(i * 137.508, 0.5 + (i % 3) * 0.12, 0.5 + (i % 4) * 0.06);
  }

  function rectOfLabel(reg, label) {
    const b = label * 4, x = reg.bbox[b], y = reg.bbox[b + 1];
    return { x, y, w: reg.bbox[b + 2] - x + 1, h: reg.bbox[b + 3] - y + 1 };
  }

  /** 한 영역을 단색으로 칠함 */
  function paintRegion(reg, label, rgb, out) {
    const r = rectOfLabel(reg, label), W = reg.W, labels = reg.labels;
    for (let y = r.y; y < r.y + r.h; y++) {
      let p = y * W + r.x;
      for (let x = 0; x < r.w; x++, p++) {
        if (labels[p] === label) { const o = p * 4; out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255; }
      }
    }
    return r;
  }

  /** 외곽 배경을 제외한 모든 영역을 서로 다른 색으로 칠함. 칠한 영역의 사각형 반환 */
  function paintAll(reg, out) {
    const { labels, W, H, valid, bg, count, bbox } = reg;
    const table = new Uint8Array((count + 1) * 3);
    for (let i = 1; i <= count; i++) { const c = colorForLabel(i); table[i * 3] = c[0]; table[i * 3 + 1] = c[1]; table[i * 3 + 2] = c[2]; }
    const N = W * H;
    for (let p = 0; p < N; p++) {
      const l = labels[p];
      if (l && valid[l] && l !== bg) { const o = p * 4, t = l * 3; out[o] = table[t]; out[o + 1] = table[t + 1]; out[o + 2] = table[t + 2]; out[o + 3] = 255; }
    }
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 1; i <= count; i++) {
      if (!valid[i] || i === bg || bbox[i * 4 + 2] < 0) continue;
      x0 = Math.min(x0, bbox[i * 4]); y0 = Math.min(y0, bbox[i * 4 + 1]);
      x1 = Math.max(x1, bbox[i * 4 + 2]); y1 = Math.max(y1, bbox[i * 4 + 3]);
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** (x,y) 에서 가장 가까운 영역 id. 선 한가운데 등 id 0 인 곳은 주변 radius 안에서 탐색 */
  function labelAt(reg, x, y, radius) {
    const { labels, W, H } = reg;
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const l0 = labels[y * W + x];
    if (l0) return l0;
    for (let r = 1; r <= (radius || 8); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const l = labels[yy * W + xx];
          if (l) return l;
        }
      }
    }
    return 0;
  }

  return { buildLineMask, dilate, labelFree, computeRegions, colorForLabel, rectOfLabel, paintRegion, paintAll, labelAt };
});
