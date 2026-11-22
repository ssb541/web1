/* ==========================================================================
 * 박주임 키우기 RPG - 설정/데이터 (config.js)
 *  - ASSETS : 그래픽 에셋 설정 (★ 도트 PNG로 교체할 때 여기만 수정)
 *  - RANKS  : 직급(주임→대리→과장→소장) 데이터
 *  - SKILLS : 스킬 데이터
 *  - OBJECTS: 현장 업무 오브젝트(잡초/눈/민원) 데이터
 *  - MAP    : 아파트 단지 맵 정의
 * ========================================================================== */
(function () {
  'use strict';
  const PJ = (window.PJ = window.PJ || {});

  /* ------------------------------------------------------------------------
   * ASSETS  ― 에셋 교체 가이드는 assets/README.md 참고
   *
   *  각 sheet 의 src 가 null 이면 코드로 그린 '플레이스홀더 도트'를 사용합니다.
   *  src 에 PNG 경로를 넣으면 그 스프라이트 시트에서 (col,row) 칸을 잘라 씁니다.
   *  (파일 로딩에 실패하면 자동으로 플레이스홀더로 되돌아갑니다.)
   *
   *  예) player: { src: 'assets/player.png', frameW: 16, frameH: 16, ... }
   * ---------------------------------------------------------------------- */
  PJ.ASSETS = {
    tile: 16, // 맵 타일 한 칸 크기(px). 맵 로직 기준 값

    sheets: {
      tiles:   { src: null, frameW: 16, frameH: 16 }, // 타일 시트
      player:  { src: null, frameW: 16, frameH: 16 }, // 캐릭터 시트
      objects: { src: null, frameW: 16, frameH: 16 }, // 업무 오브젝트 시트
    },

    // tiles 시트: 이름 → [col, row]
    tiles: {
      grass: [0, 0], grass2: [1, 0], path: [2, 0], parking: [3, 0], parkLine: [4, 0],
      officeWall: [5, 0], officeRoof: [6, 0], officeDoor: [7, 0], officeWindow: [8, 0],
      tree: [0, 1], flower: [1, 1], aptWall: [2, 1], aptRoof: [3, 1], aptWindow: [4, 1], aptDoor: [5, 1],
      carRed: [0, 2], carBlue: [1, 2], carGray: [2, 2],
    },

    // player 시트: row = 직급 인덱스(0~3), col = 방향*2 + 걷기프레임
    //   방향: down=0, up=1, right=2 (left 는 right 를 좌우반전)
    //   즉 한 줄에 [아래0,아래1,위0,위1,오른0,오른1] 6칸
    player: {
      dirCol: { down: 0, up: 1, right: 2 },
      anchor: [8, 15], // 프레임 안에서 '발 위치'(px)
    },

    // objects 시트: 이름 → { row, frames }  (한 줄에 frames 칸)
    //   weed/snow : 처리 진행도에 따라 0(크다) → frames-1(작다) 프레임 사용
    //   complaint : 프레임을 번갈아 재생(말풍선 깜빡임)
    objects: {
      weed:      { row: 0, frames: 3 },
      snow:      { row: 1, frames: 3 },
      complaint: { row: 2, frames: 2 },
      anchor: [8, 8],
    },
  };

  /* ------------------------------ 직급 ------------------------------------ */
  PJ.RANKS = [
    {
      id: 'juim', name: '주임', title: '새내기 현장 주임', maxLv: 10,
      speed: 72, power: 1.0, expMult: 1.0, goldMult: 1.0, reachBonus: 0, hpMult: 1.0,
      palette: { c: '#4a90d9', a: '#f2c94c', w: '#f2f2f2', p: '#394264', hair: '#3a281c', hat: '#2f6fb5', glasses: false },
      promote: null,
    },
    {
      id: 'daeri', name: '대리', title: '믿음직한 현장 대리', maxLv: 20,
      speed: 80, power: 1.3, expMult: 1.2, goldMult: 1.2, reachBonus: 4, hpMult: 1.35,
      palette: { c: '#3fae6a', a: '#ffffff', w: '#f2f2f2', p: '#30403a', hair: '#3a281c', hat: '#2d8a50', glasses: false },
      promote: { lv: 10, gold: 500, tasks: { weed: 15, snow: 10, complaint: 5 } },
    },
    {
      id: 'gwajang', name: '과장', title: '노련한 관리과장', maxLv: 30,
      speed: 88, power: 1.7, expMult: 1.5, goldMult: 1.5, reachBonus: 8, hpMult: 1.7,
      palette: { c: '#2b3a67', a: '#d64545', w: '#ffffff', p: '#262b3f', hair: '#2a1d14', hat: null, glasses: false },
      promote: { lv: 20, gold: 3000, tasks: { weed: 60, snow: 40, complaint: 25 } },
    },
    {
      id: 'sojang', name: '소장', title: '전설의 관리소장', maxLv: 50,
      speed: 96, power: 2.3, expMult: 1.9, goldMult: 2.0, reachBonus: 12, hpMult: 2.05,
      palette: { c: '#202329', a: '#ffd24a', w: '#ffffff', p: '#16181d', hair: '#c4c4c4', hat: null, glasses: true },
      promote: { lv: 30, gold: 12000, tasks: { weed: 150, snow: 100, complaint: 70 } },
    },
  ];

  /* ------------------------------ 스킬 ------------------------------------ */
  // type: single(단일 대상) / area(범위, 3틱 연속 타격)
  // dmg: 기본 위력, cd: 쿨타임(초), reach/radius: 사거리(px), bonus: 처리 시 보상 배율
  PJ.SKILLS = {
    weedPull: { id: 'weedPull', name: '잡초 뽑기',   icon: '🌿', group: 'weed',      type: 'single', target: 'weed',      dmg: 1.2, cd: 0.32, reach: 28, unlockLv: 1, baseCost: 20, desc: '가까운 잡초 더미를 뽑는 기본 제초 스킬.' },
    mower:    { id: 'mower',    name: '예초기 돌리기', icon: '🚜', group: 'weed',      type: 'area',   target: 'weed',      dmg: 3.2, cd: 6.0,  radius: 56, unlockLv: 3, baseCost: 60, key: '1', desc: '주변 잡초를 한꺼번에 갈아버리는 범위 스킬.' },
    shovel:   { id: 'shovel',   name: '눈 삽 치우기', icon: '⛏️', group: 'snow',      type: 'single', target: 'snow',      dmg: 1.3, cd: 0.36, reach: 28, unlockLv: 1, baseCost: 20, desc: '가까운 눈 더미를 삽으로 퍼내는 기본 제설 스킬.' },
    blower:   { id: 'blower',   name: '제설기 가동',  icon: '❄️', group: 'snow',      type: 'area',   target: 'snow',      dmg: 4.5, cd: 8.0,  radius: 64, bonus: 1.35, unlockLv: 5, baseCost: 90, key: '2', desc: '넓은 범위의 눈을 날려버리는 고효율 스킬. 보상 보너스!' },
    kind:     { id: 'kind',     name: '친절한 안내',  icon: '😊', group: 'complaint', type: 'single', target: 'complaint', dmg: 3.0, cd: 7.0,  reach: 40, bonus: 2.0, unlockLv: 2, baseCost: 50, key: '3', desc: '민원을 한 번에 해결하고 추가 보상을 받는다.' },
    // 기본 응대: Space 로 민원 상대할 때 자동 사용 (강화 대상 아님)
    answer:   { id: 'answer',   name: '기본 응대',    icon: '💬', group: 'complaint', type: 'single', target: 'complaint', dmg: 1.0, cd: 0.5,  reach: 34, unlockLv: 1, baseCost: 0, hidden: true, desc: '' },
  };

  /* --------------------------- 현장 업무 오브젝트 -------------------------- */
  // zone: grass(잔디밭) / paved(보행로+주차장) / path(보행로)
  PJ.OBJECTS = {
    weed:      { id: 'weed',      name: '잡초 더미', hp: 3, exp: 6,  gold: 4,  max: 9, interval: 3.2, zone: 'grass' },
    snow:      { id: 'snow',      name: '눈 더미',   hp: 4, exp: 8,  gold: 6,  max: 7, interval: 4.0, zone: 'paved' },
    complaint: { id: 'complaint', name: '민원',      hp: 3, exp: 14, gold: 12, max: 3, interval: 8.0, zone: 'path', ttl: 50 },
  };

  /* ------------------------------- 맵 ------------------------------------- */
  (function buildMap() {
    const W = 30, H = 20;
    const ground = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => ((x * 7 + y * 13) % 5 === 0 ? 'grass2' : 'grass')));
    const deco = Array.from({ length: H }, () => Array(W).fill(null));
    const rect = (x0, y0, x1, y1, fn) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y); };

    // 보행로
    rect(1, 5, 28, 6, (x, y) => (ground[y][x] = 'path'));
    rect(9, 7, 10, 18, (x, y) => (ground[y][x] = 'path'));
    rect(17, 7, 18, 16, (x, y) => (ground[y][x] = 'path'));
    rect(1, 17, 28, 18, (x, y) => (ground[y][x] = 'path'));
    // 주차장
    rect(19, 7, 28, 16, (x, y) => (ground[y][x] = x % 2 === 0 ? 'parkLine' : 'parking'));

    // 관리사무소 (x2~7, y1~4)
    rect(2, 1, 7, 2, (x, y) => (ground[y][x] = 'officeRoof'));
    rect(2, 3, 7, 3, (x, y) => (ground[y][x] = x % 2 === 1 ? 'officeWindow' : 'officeWall'));
    rect(2, 4, 7, 4, (x, y) => (ground[y][x] = 'officeWall'));
    ground[4][4] = 'officeDoor'; ground[4][5] = 'officeDoor';
    // 아파트 두 동
    const apt = (x0, x1, d0) => {
      rect(x0, 1, x1, 1, (x, y) => (ground[y][x] = 'aptRoof'));
      rect(x0, 2, x1, 3, (x, y) => (ground[y][x] = (x + y) % 2 === 0 ? 'aptWindow' : 'aptWall'));
      rect(x0, 4, x1, 4, (x, y) => (ground[y][x] = 'aptWall'));
      ground[4][d0] = 'aptDoor'; ground[4][d0 + 1] = 'aptDoor';
    };
    apt(11, 16, 13);
    apt(20, 27, 23);

    // 외곽 나무
    for (let x = 0; x < W; x++) { deco[0][x] = 'tree'; deco[H - 1][x] = 'tree'; }
    for (let y = 0; y < H; y++) { deco[y][0] = 'tree'; deco[y][W - 1] = 'tree'; }
    // 조경
    [[2, 8], [7, 8], [3, 14], [7, 15], [12, 8], [15, 15], [1, 11], [16, 9]].forEach(([x, y]) => (deco[y][x] = 'tree'));
    [[4, 11], [5, 11], [4, 12], [5, 12], [13, 11], [14, 11], [13, 12], [14, 12]].forEach(([x, y]) => (deco[y][x] = 'flower'));
    // 주차된 차
    [[20, 9, 'carRed'], [22, 9, 'carBlue'], [24, 9, 'carGray'], [27, 9, 'carRed'],
     [21, 14, 'carGray'], [25, 14, 'carBlue'], [27, 14, 'carRed']].forEach(([x, y, n]) => (deco[y][x] = n));

    const SOLID = new Set(['officeRoof', 'officeWall', 'officeWindow', 'officeDoor', 'aptRoof', 'aptWall', 'aptWindow', 'aptDoor',
      'tree', 'flower', 'carRed', 'carBlue', 'carGray']);

    PJ.MAP = {
      w: W, h: H, ground, deco,
      solid(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
        return SOLID.has(ground[ty][tx]) || (deco[ty][tx] !== null && SOLID.has(deco[ty][tx]));
      },
      spawn: { x: 5, y: 5 }, // 시작 위치(타일)
      // 맵 위에 표시할 구역 이름 (타일 좌표 기준 중심)
      labels: [
        { text: '관리사무소', x: 4.5, y: 1.9, color: '#fff' },
        { text: '주차장', x: 23.5, y: 7.6, color: '#fff' },
        { text: '중앙 화단', x: 13.5, y: 10.2, color: '#fff' },
        { text: '동측 잔디밭', x: 4.5, y: 9.6, color: '#fff' },
        { text: '보행로', x: 19.5, y: 5.5, color: '#fff' },
      ],
    };
  })();
})();
