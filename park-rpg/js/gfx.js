/* ==========================================================================
 * gfx.js - 스프라이트 시트 로더 + 플레이스홀더 도트 생성기
 *   Gfx.frame(sheet, col, row) → 16x16(프레임 크기) 캔버스
 *   ASSETS.sheets[sheet].src 가 있으면 PNG 에서 잘라 쓰고, 없으면 코드로 그립니다.
 * ========================================================================== */
(function () {
  'use strict';
  const PJ = window.PJ;
  const A = PJ.ASSETS;
  const images = {};
  const cache = {};

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  function rngFor(col, row, salt) {
    let s = ((col + 1) * 374761393 + (row + 1) * 668265263 + (salt || 0) * 2246822519) >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const tileName = {};
  Object.keys(A.tiles).forEach((n) => { tileName[A.tiles[n].join(',')] = n; });

  /* ----------------------------- 타일 -------------------------------------- */
  function drawGrass(g, r, alt) {
    px(g, 0, 0, 16, 16, alt ? '#62b350' : '#5aab49');
    for (let i = 0; i < 9; i++) px(g, (r() * 15) | 0, (r() * 14) | 0, 1, 2, '#4a9a3c');
    for (let i = 0; i < 6; i++) px(g, (r() * 15) | 0, (r() * 15) | 0, 1, 1, '#7ccf62');
    if (alt) { px(g, 4, 10, 1, 1, '#fff7c2'); px(g, 11, 4, 1, 1, '#ffd0e0'); }
  }
  function drawWallBase(g, base, shade, line) {
    px(g, 0, 0, 16, 16, base);
    px(g, 0, 5, 16, 1, line); px(g, 0, 10, 16, 1, line);
    px(g, 0, 14, 16, 2, shade);
  }
  function drawWindow(g, x, y, w, h, lit) {
    px(g, x - 1, y - 1, w + 2, h + 2, '#6b4e33');
    px(g, x, y, w, h, lit || '#9fd6ee');
    px(g, x + (w >> 1), y, 1, h, '#6b4e33'); px(g, x, y + (h >> 1), w, 1, '#6b4e33');
    px(g, x + 1, y + 1, 2, 1, '#ffffff');
  }
  function drawRoof(g, base, dark, light) {
    px(g, 0, 0, 16, 16, base);
    for (let y = 0; y < 16; y += 4) {
      px(g, 0, y + 3, 16, 1, dark);
      for (let x = (y / 4) % 2 ? 4 : 0; x < 16; x += 8) px(g, x, y, 1, 3, dark);
    }
    px(g, 0, 0, 16, 1, light);
  }
  function asphalt(g, r) {
    px(g, 0, 0, 16, 16, '#5f6470');
    for (let i = 0; i < 10; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, 1, 1, r() > 0.5 ? '#6c717e' : '#525660');
  }
  function car(g, body, roof) {
    px(g, 3, 1, 10, 14, '#00000040');
    px(g, 3, 0, 10, 14, body);
    px(g, 4, 3, 8, 3, '#9fd6ee'); px(g, 4, 10, 8, 2, '#8cc3dc');
    px(g, 4, 6, 8, 4, roof);
    px(g, 2, 2, 1, 3, '#222'); px(g, 13, 2, 1, 3, '#222'); px(g, 2, 9, 1, 3, '#222'); px(g, 13, 9, 1, 3, '#222');
    px(g, 4, 0, 2, 1, '#fff6a8'); px(g, 10, 0, 2, 1, '#fff6a8');
    px(g, 4, 13, 2, 1, '#e23'); px(g, 10, 13, 2, 1, '#e23');
  }
  const P = {};
  P.tiles = (col, row) => {
    const c = mk(16, 16), g = c.getContext('2d'), n = tileName[col + ',' + row], r = rngFor(col, row);
    switch (n) {
      case 'grass': drawGrass(g, r, false); break;
      case 'grass2': drawGrass(g, r, true); break;
      case 'path':
        px(g, 0, 0, 16, 16, '#d8cba9');
        px(g, 0, 7, 16, 1, '#bfb08c'); px(g, 0, 15, 16, 1, '#bfb08c');
        px(g, 5, 0, 1, 7, '#bfb08c'); px(g, 13, 0, 1, 7, '#bfb08c'); px(g, 1, 8, 1, 7, '#bfb08c'); px(g, 9, 8, 1, 7, '#bfb08c');
        for (let i = 0; i < 6; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, 1, 1, '#e6dbbd');
        break;
      case 'parking': asphalt(g, r); break;
      case 'parkLine': asphalt(g, r); px(g, 0, 0, 1, 16, '#e9e9e9'); break;
      case 'officeWall': drawWallBase(g, '#efe3c4', '#d3c4a1', '#e2d4b2'); break;
      case 'officeWindow': drawWallBase(g, '#efe3c4', '#d3c4a1', '#e2d4b2'); drawWindow(g, 3, 3, 10, 8); break;
      case 'officeDoor':
        drawWallBase(g, '#efe3c4', '#d3c4a1', '#e2d4b2');
        px(g, 1, 1, 14, 15, '#6b4e33'); px(g, 2, 2, 12, 14, '#8cc8e6'); px(g, 2, 2, 12, 2, '#b6e0f3');
        px(g, 8, 2, 1, 14, '#6b4e33'); px(g, 6, 9, 1, 2, '#ffd24a'); px(g, 10, 9, 1, 2, '#ffd24a'); break;
      case 'officeRoof': drawRoof(g, '#b8473a', '#8f352b', '#d96a58'); break;
      case 'aptWall': drawWallBase(g, '#d8d3c8', '#bdb7aa', '#cdc7ba'); break;
      case 'aptWindow': drawWallBase(g, '#d8d3c8', '#bdb7aa', '#cdc7ba');
        drawWindow(g, 2, 3, 5, 8, r() > 0.6 ? '#ffe9a0' : '#9fd6ee'); drawWindow(g, 9, 3, 5, 8, r() > 0.6 ? '#ffe9a0' : '#9fd6ee'); break;
      case 'aptDoor':
        drawWallBase(g, '#d8d3c8', '#bdb7aa', '#cdc7ba');
        px(g, 1, 1, 14, 15, '#3d4a63'); px(g, 2, 2, 12, 14, '#7aa9c9'); px(g, 8, 2, 1, 14, '#3d4a63'); px(g, 6, 9, 1, 2, '#fff'); px(g, 10, 9, 1, 2, '#fff'); break;
      case 'aptRoof': drawRoof(g, '#6f7f9e', '#56647f', '#8b9bb9'); break;
      case 'tree':
        g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(8, 14, 6, 2, 0, 0, 7); g.fill();
        px(g, 7, 10, 3, 5, '#6b4a2b');
        [['#2f7a34', 8, 7, 7, 6], ['#3f9a42', 7, 6, 5.5, 4.5], ['#62bd5a', 6, 4.5, 3, 2.2]].forEach(([col, x, y, rx, ry]) => {
          g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
        });
        break;
      case 'flower':
        px(g, 0, 3, 16, 12, '#b5835a'); px(g, 1, 4, 14, 10, '#7a5436');
        for (let i = 0; i < 9; i++) {
          const x = 2 + ((r() * 12) | 0), y = 5 + ((r() * 8) | 0);
          px(g, x, y + 1, 1, 2, '#3f9a42'); px(g, x, y, 1, 1, ['#ff6b8b', '#ffd24a', '#ffffff', '#b78cff'][(r() * 4) | 0]);
        }
        break;
      case 'carRed': asphalt(g, r); car(g, '#d94a4a', '#e66'); break;
      case 'carBlue': asphalt(g, r); car(g, '#4a7fd9', '#6a9ae6'); break;
      case 'carGray': asphalt(g, r); car(g, '#9aa0aa', '#b4bac4'); break;
      default: px(g, 0, 0, 16, 16, '#f0f');
    }
    return c;
  };

  /* ---------------------------- 캐릭터 ------------------------------------- */
  // 12x16 도트 템플릿. k=외곽선 h=머리 s=피부 c=상의 w=셔츠 a=포인트 p=바지 b=신발
  const BODY = {
    down: ['...kkkkkk...', '..khhhhhhk..', '.khhhhhhhhk.', '.khsssssshk.', '.kssksskssk.', '.kssssssssk.', '..kssssssk..',
      '.kccwwwwcck.', 'kccccaacccck', 'kscccaacccsk', 'ksccccccccsk', '.kcccccccck.', '.kppppppppk.', '.kpppkkpppk.'],
    up: ['...kkkkkk...', '..khhhhhhk..', '.khhhhhhhhk.', '.khhhhhhhhk.', '.khhhhhhhhk.', '.khhhhhhhhk.', '..khhhhhhk..',
      '.kcccccccck.', 'kcccccccccck', 'ksccccccccsk', 'ksccccccccsk', '.kcccccccck.', '.kppppppppk.', '.kpppkkpppk.'],
    right: ['...kkkkkk...', '..khhhhhhk..', '.khhhhhhhhk.', '.khhhhssssk.', '.khhhhssksk.', '.khhhhssssk.', '..khhhsssk..',
      '..kccwwcck..', '..kcccaccck.', '..kccsscck..', '..kccsscck..', '..kcccccck..', '..kppppppk..', '..kppkkppk..'],
  };
  const LEGS = {
    down: [['.kppk..kppk.', '.kbbk..kbbk.'], ['..kppkkppk..', '..kbbkkbbk..']],
    up: [['.kppk..kppk.', '.kbbk..kbbk.'], ['..kppkkppk..', '..kbbkkbbk..']],
    right: [['..kpppkppk..', '..kbbbkbbk..'], ['...kppppk...', '...kbbbbk...']],
  };
  P.player = (col, row) => {
    const c = mk(16, 16), g = c.getContext('2d');
    const rk = PJ.RANKS[Math.min(row, PJ.RANKS.length - 1)], p = rk.palette;
    const dirs = ['down', 'up', 'right'];
    const dir = dirs[Math.min(col >> 1, 2)], step = col & 1;
    const pal = { k: '#1b1b2b', h: p.hair, s: '#f3c9a0', c: p.c, w: p.w, a: p.a, p: p.p, b: '#2a2a2a' };
    const rows = BODY[dir].concat(LEGS[dir][step]);
    rows.forEach((line, y) => {
      for (let x = 0; x < 12; x++) {
        const ch = line[x];
        if (!ch || ch === '.') continue;
        let col2 = pal[ch];
        if (ch === 'h' && p.hat && y <= 2) col2 = p.hat; // 모자
        px(g, x + 2, y, 1, 1, col2);
      }
    });
    if (p.hat) { // 모자 챙
      if (dir === 'down') px(g, 5, 3, 6, 1, p.hat);
      if (dir === 'right') px(g, 9, 3, 3, 1, p.hat);
    }
    if (p.glasses && dir !== 'up') {
      if (dir === 'down') { px(g, 5, 4, 2, 1, '#ffd24a'); px(g, 9, 4, 2, 1, '#ffd24a'); }
      else px(g, 9, 4, 3, 1, '#ffd24a');
    }
    // 직급 뱃지 (가슴)
    if (dir !== 'up') px(g, dir === 'down' ? 11 : 9, 9, 1, 1, row >= 3 ? '#fff6a8' : p.a);
    return c;
  };

  /* --------------------------- 업무 오브젝트 ------------------------------- */
  P.objects = (col, row) => {
    const c = mk(16, 16), g = c.getContext('2d'), r = rngFor(col, row, 7);
    if (row >= 3) { // 돌발 이벤트 / 보스 아이콘
      const f = col === 1;
      if (row === 3) { // 화재 오경보
        px(g, 3, 5, 10, 9, '#444'); px(g, 4, 6, 8, 7, '#f4f4f4');
        px(g, 5, 2, 6, 4, f ? '#ffd24a' : '#e23b3b'); px(g, 6, 1, 4, 1, f ? '#ffd24a' : '#e23b3b'); px(g, 7, 0, 2, 1, '#ff9b3b');
        px(g, 7, 7, 2, 3, '#e23b3b'); px(g, 7, 11, 2, 1, '#e23b3b');
      } else if (row === 4) { // 엘리베이터 멈춤
        px(g, 2, 1, 12, 14, '#444'); px(g, 3, 2, 10, 12, '#b9bfc9'); px(g, 8, 2, 1, 12, '#444');
        px(g, 6, 3, 4, 2, f ? '#ff5a5a' : '#7a2b2b'); px(g, 5, 7, 2, 2, '#e23b3b'); px(g, 9, 7, 2, 2, '#e23b3b'); px(g, 7, 9, 2, 2, '#e23b3b');
      } else { // 이중주차 빌런 (차 + 분노 마크)
        px(g, 0, 7, 16, 7, '#222'); px(g, 1, 6, 14, 7, f ? '#d94a4a' : '#8a2fd0');
        px(g, 3, 7, 4, 3, '#9fd6ee'); px(g, 9, 7, 4, 3, '#9fd6ee'); px(g, 2, 13, 3, 2, '#111'); px(g, 11, 13, 3, 2, '#111');
        px(g, 11, 1, 1, 4, '#ff3b3b'); px(g, 9, 3, 5, 1, '#ff3b3b'); px(g, 3, 2, 3, 1, '#ff3b3b'); px(g, 4, 1, 1, 3, '#ff3b3b');
      }
      return c;
    }
    if (row === 0) { // 잡초 더미 (col 0 크다 → 2 작다)
      const f = [1, 0.72, 0.45][Math.min(col, 2)];
      g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(8, 13, 7 * f + 1, 2, 0, 0, 7); g.fill();
      const n = 9;
      for (let i = 0; i < n; i++) {
        const x = 8 + Math.round((i - n / 2) * 1.5 * f + (r() - 0.5)), h = Math.max(2, Math.round((5 + r() * 6) * f));
        const lean = i % 3 - 1, colr = i % 4 === 0 ? '#a9a04a' : (i % 2 ? '#3f8f2f' : '#57b13f');
        px(g, x, 13 - h, 1, h, colr); px(g, x + lean, 13 - h, 1, 1, colr); px(g, x + 1, 13 - Math.max(1, h - 2), 1, Math.max(1, h - 2), '#2f7a28');
      }
    } else if (row === 1) { // 눈 더미
      const f = [1, 0.7, 0.45][Math.min(col, 2)], hgt = Math.round(9 * f) + 1, wd = 7 * f + 1;
      for (let i = 0; i < hgt; i++) {
        const t = i / hgt, half = Math.round(Math.sqrt(1 - t * t) * wd);
        const y = 13 - i;
        px(g, 8 - half, y, half * 2, 1, '#f4f8ff');
        px(g, 8 + half - 2, y, 2, 1, '#c4d6ee');
        px(g, 8 - half, y, 1, 1, '#a9c0de'); px(g, 8 + half - 1, y, 1, 1, '#a9c0de');
      }
      px(g, 8 - Math.round(wd), 14, Math.round(wd) * 2, 1, '#a9c0de');
      px(g, 6, 13 - hgt + 3, 2, 1, '#ffffff'); px(g, 9, 13 - hgt + 5, 1, 1, '#ffffff');
    } else { // 민원 말풍선
      const warm = col === 1;
      px(g, 2, 1, 12, 9, '#7a2b2b'); px(g, 1, 2, 14, 7, '#7a2b2b');
      px(g, 2, 2, 12, 7, warm ? '#ffe3b0' : '#ffffff'); px(g, 3, 1, 10, 9, warm ? '#ffe3b0' : '#ffffff');
      px(g, 5, 10, 4, 2, '#7a2b2b'); px(g, 6, 10, 2, 1, warm ? '#ffe3b0' : '#fff'); px(g, 6, 12, 1, 1, '#7a2b2b');
      px(g, 7, 3, 2, 4, '#e23b3b'); px(g, 7, 8, 2, 1, '#e23b3b');
      if (warm) { px(g, 3, 3, 2, 1, '#e23b3b'); px(g, 11, 3, 2, 1, '#e23b3b'); }
    }
    return c;
  };

  /* ------------------------------ 공개 API --------------------------------- */
  PJ.Gfx = {
    load() {
      const jobs = Object.keys(A.sheets).map((name) => new Promise((resolve) => {
        const sh = A.sheets[name];
        if (!sh.src) return resolve();
        const img = new Image();
        img.onload = () => { images[name] = img; resolve(); };
        img.onerror = () => { console.warn('[Gfx] 시트 로딩 실패 → 플레이스홀더 사용:', sh.src); resolve(); };
        img.src = sh.src;
      }));
      return Promise.all(jobs);
    },
    frame(sheet, col, row) {
      const key = sheet + ':' + col + ',' + row;
      if (cache[key]) return cache[key];
      const sh = A.sheets[sheet];
      let c;
      if (images[sheet]) {
        c = mk(sh.frameW, sh.frameH);
        c.getContext('2d').drawImage(images[sheet], col * sh.frameW, row * sh.frameH, sh.frameW, sh.frameH, 0, 0, sh.frameW, sh.frameH);
      } else c = P[sheet](col, row);
      return (cache[key] = c);
    },
    tile(name) { const t = A.tiles[name]; return this.frame('tiles', t[0], t[1]); },
    playerFrame(rank, dir, step) {
      const d = dir === 'left' ? 'right' : dir;
      return this.frame('player', A.player.dirCol[d] * 2 + step, rank);
    },
    objectFrame(type, i) { const o = A.objects[type]; return this.frame('objects', Math.max(0, Math.min(o.frames - 1, i)), o.row); },
  };
})();
