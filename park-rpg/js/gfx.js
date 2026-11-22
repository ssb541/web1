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

      case 'void': px(g, 0, 0, 16, 16, '#0b0e18'); break;
      case 'wallTop': px(g, 0, 0, 16, 16, '#3a3f58'); px(g, 0, 0, 16, 2, '#51587a'); px(g, 0, 14, 16, 2, '#2a2e42'); break;
      case 'wallFace': px(g, 0, 0, 16, 16, '#e6dcc8'); px(g, 0, 0, 16, 1, '#f4ecdc'); px(g, 0, 12, 16, 4, '#9a8a6a'); px(g, 0, 12, 16, 1, '#b5a582'); break;
      case 'doorIn':
        px(g, 0, 0, 16, 16, '#3a3f58'); px(g, 1, 3, 14, 13, '#6b4a2b'); px(g, 2, 4, 12, 12, '#8a5a30'); px(g, 3, 5, 4, 4, '#a9733f'); px(g, 9, 5, 4, 4, '#a9733f');
        px(g, 3, 10, 4, 5, '#a9733f'); px(g, 9, 10, 4, 5, '#a9733f'); px(g, 11, 9, 2, 2, '#ffd24a');
        px(g, 3, 0, 10, 3, '#1f7a44'); px(g, 4, 1, 8, 1, '#7dffb0'); break;
      case 'floorOffice': px(g, 0, 0, 16, 16, '#cdd1dc'); px(g, 0, 0, 8, 8, '#d6dae4'); px(g, 8, 8, 8, 8, '#d6dae4'); px(g, 0, 0, 16, 1, '#b8bdca'); px(g, 0, 0, 1, 16, '#b8bdca'); break;
      case 'floorWood':
        px(g, 0, 0, 16, 16, '#b98a5a');
        [3, 7, 11, 15].forEach((y) => px(g, 0, y, 16, 1, '#9c7348'));
        px(g, 5, 0, 1, 3, '#9c7348'); px(g, 11, 4, 1, 3, '#9c7348'); px(g, 3, 8, 1, 3, '#9c7348'); px(g, 12, 12, 1, 3, '#9c7348'); break;
      case 'floorTileW': px(g, 0, 0, 16, 16, '#e8f0f4'); px(g, 0, 0, 16, 1, '#c5d3da'); px(g, 0, 0, 1, 16, '#c5d3da'); px(g, 8, 0, 1, 16, '#d6e2e8'); px(g, 0, 8, 16, 1, '#d6e2e8'); break;
      case 'floorBalcony': px(g, 0, 0, 16, 16, '#9aa3ad'); px(g, 0, 0, 16, 1, '#818a95'); px(g, 0, 8, 16, 1, '#8b949f'); px(g, 8, 0, 1, 16, '#8b949f'); for (let i = 0; i < 6; i++) px(g, (r() * 16) | 0, (r() * 16) | 0, 1, 1, '#b2bac3'); break;
      case 'counter': px(g, 0, 2, 16, 6, '#b98550'); px(g, 0, 2, 16, 1, '#d6a874'); px(g, 0, 8, 16, 7, '#7a5232'); px(g, 0, 8, 16, 1, '#5a3a22'); px(g, 0, 15, 16, 1, 'rgba(0,0,0,.3)'); px(g, 2, 3, 3, 2, '#fff'); break;
      case 'pcDesk': px(g, 0, 6, 16, 9, '#a8794a'); px(g, 0, 6, 16, 1, '#c99a6a'); px(g, 3, 0, 10, 7, '#222'); px(g, 4, 1, 8, 5, '#5ac8ff'); px(g, 5, 2, 3, 1, '#fff'); px(g, 7, 7, 2, 1, '#333'); px(g, 4, 9, 8, 2, '#ddd'); px(g, 12, 10, 2, 2, '#eee'); break;
      case 'phoneDesk': px(g, 0, 6, 16, 9, '#a8794a'); px(g, 0, 6, 16, 1, '#c99a6a'); px(g, 4, 8, 8, 5, '#e9e4d4'); px(g, 3, 7, 10, 2, '#333'); px(g, 6, 10, 1, 1, '#777'); px(g, 8, 10, 1, 1, '#777'); px(g, 10, 10, 1, 1, '#777'); px(g, 12, 8, 2, 2, '#e23b3b'); break;
      case 'keybox': px(g, 1, 1, 14, 14, '#1b3a28'); px(g, 2, 2, 12, 12, '#2d5a3d'); for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 4; c++) { px(g, 3 + c * 3, 3 + rr * 4, 2, 1, '#bbb'); px(g, 3 + c * 3, 4 + rr * 4, 2, 2, '#ffd24a'); } break;
      case 'chair': px(g, 3, 3, 10, 3, '#36436a'); px(g, 3, 5, 10, 8, '#4a5a8a'); px(g, 4, 6, 8, 5, '#5a6a9a'); px(g, 4, 13, 2, 2, '#222'); px(g, 10, 13, 2, 2, '#222'); break;
      case 'sofa': px(g, 0, 1, 16, 5, '#6f2a2a'); px(g, 0, 5, 16, 9, '#8f3b3b'); px(g, 8, 6, 1, 7, '#6f2a2a'); px(g, 0, 13, 16, 1, '#5a2020'); break;
      case 'tv': px(g, 2, 10, 12, 5, '#5a4030'); px(g, 1, 2, 14, 9, '#111'); px(g, 2, 3, 12, 7, '#3a7aa8'); px(g, 3, 4, 3, 1, '#9fd6ee'); px(g, 8, 6, 4, 2, '#5aa8d8'); break;
      case 'tableL': px(g, 2, 3, 12, 10, '#a8794a'); px(g, 3, 4, 10, 8, '#b98550'); px(g, 2, 13, 12, 1, 'rgba(0,0,0,.25)'); px(g, 6, 6, 4, 3, '#fff'); break;
      case 'tableS': px(g, 3, 4, 10, 9, '#a8794a'); px(g, 4, 5, 8, 7, '#b98550'); px(g, 7, 6, 3, 3, '#fff'); px(g, 8, 7, 1, 1, '#6a3a1a'); break;
      case 'plant':
        px(g, 5, 10, 6, 5, '#b5543a'); px(g, 5, 10, 6, 1, '#d6745a');
        [['#2f7a34', 8, 6, 5, 4], ['#3f9a42', 6, 5, 3, 3], ['#52b04e', 10, 5, 3, 3]].forEach(([c, x, y, rx, ry]) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); });
        break;
      case 'stove': px(g, 0, 3, 16, 12, '#6b7078'); px(g, 1, 4, 14, 8, '#2a2d33'); [[5, 8], [11, 8]].forEach(([x, y]) => { g.fillStyle = '#555'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(x, y, 1.5, 0, 7); g.fill(); }); px(g, 3, 13, 2, 1, '#ddd'); px(g, 11, 13, 2, 1, '#ddd'); break;
      case 'sink': px(g, 0, 3, 16, 12, '#c9ced6'); px(g, 2, 5, 12, 7, '#8fa3b3'); px(g, 3, 6, 10, 5, '#a9bdcb'); px(g, 7, 2, 2, 4, '#ddd'); break;
      case 'fridge': px(g, 2, 0, 12, 15, '#e9edf2'); px(g, 2, 6, 12, 1, '#b9c0ca'); px(g, 11, 2, 1, 3, '#888'); px(g, 11, 8, 1, 4, '#888'); px(g, 2, 14, 12, 1, '#b9c0ca'); break;
      case 'gasDet': px(g, 3, 3, 10, 8, '#f2f2f2'); px(g, 3, 3, 10, 1, '#bbb'); px(g, 4, 5, 5, 4, '#cfd6dd'); px(g, 10, 5, 2, 2, '#3fbf5f'); px(g, 7, 11, 2, 4, '#222'); break;
      case 'gasValve': px(g, 0, 7, 16, 3, '#d6b02a'); px(g, 0, 7, 16, 1, '#f0d060'); px(g, 5, 3, 6, 3, '#c62828'); px(g, 7, 5, 2, 3, '#888'); break;
      case 'detector': g.fillStyle = '#bbb'; g.beginPath(); g.arc(8, 8, 6, 0, 7); g.fill(); g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(8, 8, 5, 0, 7); g.fill(); px(g, 5, 7, 6, 1, '#cfcfcf'); px(g, 5, 9, 6, 1, '#cfcfcf'); px(g, 11, 4, 2, 2, '#e23b3b'); break;
      case 'toilet': px(g, 4, 1, 8, 4, '#f4f4f4'); px(g, 4, 1, 8, 1, '#bbb'); g.fillStyle = '#bbb'; g.beginPath(); g.ellipse(8, 10, 6, 5, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(8, 10, 5, 4, 0, 0, 7); g.fill(); break;
      case 'tub': px(g, 0, 0, 16, 16, '#f4f4f4'); px(g, 2, 2, 12, 12, '#a9d7ee'); px(g, 3, 3, 4, 1, '#d6efff'); break;
      case 'leak': px(g, 0, 4, 16, 3, '#8a8f98'); px(g, 0, 4, 16, 1, '#b0b5be'); px(g, 8, 7, 1, 4, '#5aa8e8'); g.fillStyle = '#5aa8e8'; g.beginPath(); g.ellipse(8, 13, 6, 2, 0, 0, 7); g.fill(); break;
      case 'waterValve': px(g, 0, 9, 16, 3, '#6a7a8a'); px(g, 0, 9, 16, 1, '#9aaabb'); px(g, 7, 6, 2, 4, '#444'); g.fillStyle = '#2a6cc8'; g.beginPath(); g.arc(8, 4, 4, 0, 7); g.fill(); g.fillStyle = '#aad'; g.beginPath(); g.arc(8, 4, 1.5, 0, 7); g.fill(); break;
      case 'washer': px(g, 1, 1, 14, 14, '#e8ecf0'); px(g, 2, 2, 12, 2, '#bbb'); g.fillStyle = '#4a6a8a'; g.beginPath(); g.arc(8, 9, 4.5, 0, 7); g.fill(); g.fillStyle = '#9fd6ee'; g.beginPath(); g.arc(8, 9, 3, 0, 7); g.fill(); break;
      case 'deskW': px(g, 0, 5, 16, 10, '#a8794a'); px(g, 0, 5, 16, 1, '#c99a6a'); px(g, 3, 7, 5, 4, '#fff'); px(g, 9, 2, 5, 5, '#222'); px(g, 10, 3, 3, 3, '#5ac8ff'); break;
      case 'noticeBoard': px(g, 2, 2, 12, 10, '#a8794a'); px(g, 3, 3, 10, 8, '#d8b88a'); px(g, 4, 4, 3, 3, '#fff'); px(g, 8, 4, 4, 3, '#ffe9a0'); px(g, 5, 8, 5, 2, '#ffb0b0'); break;
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
  function drawChar(col, p, rowIdx) {
    const c = mk(16, 16), g = c.getContext('2d');
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
    if (dir !== 'up') px(g, dir === 'down' ? 11 : 9, 9, 1, 1, rowIdx >= 3 ? '#fff6a8' : p.a);
    return c;
  }
  P.player = (col, row) => drawChar(col, PJ.RANKS[Math.min(row, PJ.RANKS.length - 1)].palette, row);

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
    npcFrame(idx, dir, step) { // NPC(동료/입주민): 플레이스홀더 전용, 시트 사용 시 주임 스프라이트로 대체
      const d = dir === 'left' ? 'right' : dir, col = A.player.dirCol[d] * 2 + step, key = 'npc:' + idx + ':' + col;
      if (cache[key]) return cache[key];
      return (cache[key] = images.player ? this.frame('player', col, 1) : drawChar(col, PJ.NPCS[idx % PJ.NPCS.length].palette, 1));
    },
    objectFrame(type, i) { const o = A.objects[type]; return this.frame('objects', Math.max(0, Math.min(o.frames - 1, i)), o.row); },
  };
})();
