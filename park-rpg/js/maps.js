/* ==========================================================================
 * maps.js - 맵 3종: 단지(complex) / 관리사무소 내부(office) / 아파트 세대 내부(unit)
 *   모든 맵은 30x20 타일. 공통 필드:
 *     ground/deco(타일 이름 2차원 배열), solid(tx,ty), spawn, labels, lights(야간 조명),
 *     inter: 상호작용 지점 [{id, kind:'door'|'flavor', rect:[tx,ty,tw,th], ...}]
 * ========================================================================== */
(function () {
  'use strict';
  const PJ = window.PJ;
  const W = 30, H = 20;
  const SOLID = new Set([
    'officeRoof', 'officeWall', 'officeWindow', 'officeDoor', 'aptRoof', 'aptWall', 'aptWindow', 'aptDoor',
    'tree', 'flower', 'carRed', 'carBlue', 'carGray',
    'wallTop', 'wallFace', 'doorIn', 'void', 'counter', 'pcDesk', 'phoneDesk', 'keybox', 'chair', 'sofa', 'tv', 'tableL', 'tableS',
    'plant', 'stove', 'sink', 'fridge', 'gasDet', 'gasValve', 'toilet', 'tub', 'leak', 'waterValve', 'washer', 'deskW', 'noticeBoard',
  ]);
  const rect = (x0, y0, x1, y1, fn) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y); };

  function make(id, kind, ground, deco, extra) {
    return Object.assign({
      id, kind, w: W, h: H, ground, deco,
      solid(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
        return SOLID.has(ground[ty][tx]) || (deco[ty][tx] !== null && SOLID.has(deco[ty][tx]));
      },
      labels: [], lights: [], inter: [], targets: {},
    }, extra);
  }
  const blank = (name) => Array.from({ length: H }, () => Array(W).fill(name));
  const noDeco = () => Array.from({ length: H }, () => Array(W).fill(null));

  /* ============================== 단지 =================================== */
  (function complex() {
    const ground = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => ((x * 7 + y * 13) % 5 === 0 ? 'grass2' : 'grass')));
    const deco = noDeco();
    rect(1, 5, 28, 6, (x, y) => (ground[y][x] = 'path'));
    rect(9, 7, 10, 18, (x, y) => (ground[y][x] = 'path'));
    rect(17, 7, 18, 16, (x, y) => (ground[y][x] = 'path'));
    rect(1, 17, 28, 18, (x, y) => (ground[y][x] = 'path'));
    rect(19, 7, 28, 16, (x, y) => (ground[y][x] = x % 2 === 0 ? 'parkLine' : 'parking'));

    // 관리사무소 (x2~7, y1~4), 문 (4,4)(5,4)
    rect(2, 1, 7, 2, (x, y) => (ground[y][x] = 'officeRoof'));
    rect(2, 3, 7, 3, (x, y) => (ground[y][x] = x % 2 === 1 ? 'officeWindow' : 'officeWall'));
    rect(2, 4, 7, 4, (x, y) => (ground[y][x] = 'officeWall'));
    ground[4][4] = 'officeDoor'; ground[4][5] = 'officeDoor';
    // 아파트 3개 동: 101동(11~16) / 102동(19~22) / 103동(24~27)
    const apt = (x0, x1, d0) => {
      rect(x0, 1, x1, 1, (x, y) => (ground[y][x] = 'aptRoof'));
      rect(x0, 2, x1, 3, (x, y) => (ground[y][x] = (x + y) % 2 === 0 ? 'aptWindow' : 'aptWall'));
      rect(x0, 4, x1, 4, (x, y) => (ground[y][x] = 'aptWall'));
      ground[4][d0] = 'aptDoor'; ground[4][d0 + 1] = 'aptDoor';
    };
    apt(11, 16, 13); apt(19, 22, 20); apt(24, 27, 25);

    for (let x = 0; x < W; x++) { deco[0][x] = 'tree'; deco[H - 1][x] = 'tree'; }
    for (let y = 0; y < H; y++) { deco[y][0] = 'tree'; deco[y][W - 1] = 'tree'; }
    [[2, 8], [7, 8], [3, 14], [7, 15], [12, 8], [15, 15], [1, 11], [16, 9]].forEach(([x, y]) => (deco[y][x] = 'tree'));
    [[4, 11], [5, 11], [4, 12], [5, 12], [13, 11], [14, 11], [13, 12], [14, 12]].forEach(([x, y]) => (deco[y][x] = 'flower'));
    [[20, 9, 'carRed'], [22, 9, 'carBlue'], [24, 9, 'carGray'], [27, 9, 'carRed'],
     [21, 14, 'carGray'], [25, 14, 'carBlue'], [27, 14, 'carRed']].forEach(([x, y, n]) => (deco[y][x] = n));

    PJ.MAPS = PJ.MAPS || {};
    PJ.MAPS.complex = make('complex', 'outdoor', ground, deco, {
      spawn: { x: 5, y: 5 },
      labels: [
        { text: '관리사무소', x: 4.5, y: 1.9 }, { text: '101동', x: 14, y: 1.9 }, { text: '102동', x: 21, y: 1.9 }, { text: '103동', x: 26, y: 1.9 },
        { text: '주차장', x: 23.5, y: 7.6 }, { text: '중앙 화단', x: 13.5, y: 10.2 }, { text: '서측 잔디밭', x: 4.5, y: 9.6 },
        { text: '보행로', x: 11.5, y: 6.5 },
      ],
      // 야간 조명(가로등) 위치 [tx, ty, 반경px]
      lights: [[5, 5.4, 46], [14, 5.4, 46], [21, 5.4, 46], [26, 5.4, 46], [9.5, 12, 40], [17.5, 12, 40], [24, 12, 50], [12, 17.5, 40], [4, 17.5, 40], [24, 17.5, 40]],
      inter: [
        { id: 'door_office', kind: 'door', rect: [4, 4, 2, 1], label: '관리사무소', to: 'office' },
        { id: 'door_101', kind: 'door', rect: [13, 4, 2, 1], label: '101동 입구', to: 'unit', bld: '101' },
        { id: 'door_102', kind: 'door', rect: [20, 4, 2, 1], label: '102동 입구', to: 'unit', bld: '102' },
        { id: 'door_103', kind: 'door', rect: [25, 4, 2, 1], label: '103동 입구', to: 'unit', bld: '103' },
      ],
    });
  })();

  /* ========================= 관리사무소 내부 ============================== */
  (function office() {
    const g = blank('void'), d = noDeco();
    rect(6, 4, 23, 15, (x, y) => (g[y][x] = 'wallTop'));          // 외벽
    rect(7, 5, 22, 5, (x, y) => (g[y][x] = 'wallFace'));          // 안쪽 벽면
    rect(7, 6, 22, 14, (x, y) => (g[y][x] = 'floorOffice'));      // 바닥
    g[15][14] = 'doorIn'; g[15][15] = 'doorIn';                   // 출입문
    // 벽 장식
    d[5][9] = 'keybox'; d[5][10] = 'keybox'; d[5][13] = 'noticeBoard'; d[5][19] = 'noticeBoard';
    // 안내 데스크(카운터), PC, 전화기
    rect(11, 10, 18, 10, (x, y) => (d[y][x] = 'counter'));
    d[8][13] = 'pcDesk'; d[8][16] = 'phoneDesk';
    d[8][14] = 'deskW';
    // 동료 책상
    d[8][8] = 'deskW'; d[8][9] = 'deskW'; d[8][20] = 'deskW'; d[8][21] = 'deskW';
    // 휴게 공간: 의자 + 작은 탁자
    d[13][19] = 'chair'; d[13][20] = 'tableS'; d[13][21] = 'chair'; d[13][22] = 'plant'; d[13][7] = 'plant';
    d[12][8] = 'chair'; d[12][9] = 'tableS';

    PJ.MAPS.office = make('office', 'office', g, d, {
      spawn: { x: 14, y: 14 },
      labels: [{ text: '관리사무소', x: 14.5, y: 3.4 }, { text: '안내 데스크', x: 14.5, y: 11.1 }, { text: '휴게 공간', x: 20.5, y: 11.8 }, { text: '열쇠함', x: 10, y: 6.4 }, { text: 'PC', x: 13.5, y: 7.2 }, { text: '전화', x: 16.5, y: 7.2 }],
      lights: [[15, 9.5, 78], [13.5, 8, 36], [16.5, 8, 30], [14.5, 14.5, 34], [20.5, 13, 34]],
      visitor: { x: 15, y: 12 },        // 내방 민원인이 서는 칸(타일)
      colleagues: [{ i: 0, x: 8, y: 7 }, { i: 1, x: 20, y: 7 }],
      targets: { // 야간 민원 처리 지점
        desk: { rect: [11, 10, 8, 1], side: 'N', label: '안내 데스크' },
        pc: { rect: [13, 8, 1, 1], label: 'PC' },
        phone: { rect: [16, 8, 1, 1], label: '전화기' },
        keybox: { rect: [9, 5, 2, 1], label: '열쇠함' },
      },
      inter: [
        { id: 'exit', kind: 'door', rect: [14, 15, 2, 1], label: '단지로 나가기', to: 'complex' },
        { id: 'desk', kind: 'flavor', rect: [11, 10, 8, 1], side: 'N', label: '안내 데스크',
          say: '데스크 정리 중입니다!', think: '이 데스크가 6시 이후엔 내 전쟁터다...' },
        { id: 'pc', kind: 'flavor', rect: [13, 8, 1, 1], label: 'PC', say: '민원 접수 대장 확인 중!', think: '엑셀 칸이 또 밀렸다...' },
        { id: 'phone', kind: 'flavor', rect: [16, 8, 1, 1], label: '전화기', say: '지금은 조용하네요.', think: '6시 이후엔 제발 전화 안 왔으면...' },
        { id: 'keybox', kind: 'flavor', rect: [9, 5, 2, 1], label: '열쇠함', say: '열쇠 정리 완료!', think: '102동 예비키가 또 사라졌다...' },
        { id: 'chair1', kind: 'flavor', rect: [19, 13, 1, 1], label: '휴게 의자', say: '잠깐 앉았다 가겠습니다.', think: '집에 가서 칼바람 한 판 하고 싶다...' },
        { id: 'chair2', kind: 'flavor', rect: [21, 13, 1, 1], label: '휴게 의자', say: '커피 한 모금만...', think: '아메리카노 샷추가가 간절하다...' },
        { id: 'chair3', kind: 'flavor', rect: [8, 12, 1, 1], label: '휴게 의자', say: '다리가 좀 쉬어야겠네요.', think: '올겨울 눈 적당히 왔으면...' },
      ],
    });
  })();

  /* ========================= 아파트 세대 내부 ============================= */
  (function unit() {
    const g = blank('void'), d = noDeco();
    rect(6, 4, 23, 16, (x, y) => (g[y][x] = 'wallTop'));
    rect(7, 5, 14, 10, (x, y) => (g[y][x] = 'floorWood'));        // 거실
    rect(16, 5, 22, 10, (x, y) => (g[y][x] = 'floorTileW'));      // 주방
    rect(15, 8, 15, 9, (x, y) => (g[y][x] = 'floorWood'));        // 거실-주방 통로
    rect(7, 12, 12, 15, (x, y) => (g[y][x] = 'floorTileW'));      // 욕실
    rect(14, 12, 22, 15, (x, y) => (g[y][x] = 'floorBalcony'));   // 베란다
    rect(9, 11, 10, 11, (x, y) => (g[y][x] = 'floorTileW'));      // 욕실 문턱
    rect(17, 11, 18, 11, (x, y) => (g[y][x] = 'floorBalcony'));   // 베란다 문턱
    g[8][6] = 'doorIn'; g[9][6] = 'doorIn';                       // 현관문
    // 거실
    d[5][9] = 'tv'; d[5][10] = 'tv'; d[7][10] = 'tableL';
    d[9][9] = 'sofa'; d[9][10] = 'sofa'; d[9][11] = 'sofa'; d[7][13] = 'plant';
    d[4][12] = 'detector'; // 천장 화재감지기
    // 주방
    d[5][17] = 'gasValve'; d[5][18] = 'gasDet'; d[5][19] = 'stove'; d[5][20] = 'stove'; d[5][21] = 'sink'; d[5][22] = 'fridge';
    d[8][19] = 'tableL';
    // 욕실
    d[13][7] = 'toilet'; d[12][8] = 'leak'; d[14][11] = 'tub'; d[14][12] = 'tub'; d[15][11] = 'tub'; d[15][12] = 'tub';
    // 베란다
    d[12][21] = 'waterValve'; d[13][14] = 'washer'; d[15][22] = 'plant'; d[15][14] = 'plant';

    PJ.MAPS.unit = make('unit', 'unit', g, d, {
      spawn: { x: 7, y: 8 },
      labels: [{ text: '거실', x: 11, y: 6.6 }, { text: '주방', x: 19.5, y: 6.9 }, { text: '욕실', x: 9.5, y: 14.6 }, { text: '베란다', x: 17.5, y: 14.3 }, { text: '천장 감지기', x: 12.5, y: 3.5 }],
      lights: [],
      targets: { // 방문 민원 미션 지점
        detector: { rect: [12, 4, 1, 1], label: '화재감지기' },
        gasDet: { rect: [18, 5, 1, 1], label: '가스감지기' },
        leak: { rect: [8, 12, 1, 1], label: '누수 배관' },
        waterValve: { rect: [21, 12, 1, 1], label: '베란다 밸브' },
      },
      inter: [
        { id: 'exit', kind: 'door', rect: [6, 8, 1, 2], label: '현관 (단지로 나가기)', to: 'complex' },
        { id: 'gasValve', kind: 'flavor', rect: [17, 5, 1, 1], label: '가스 밸브', say: '가스 밸브 잠금 상태 확인!', think: '레버가 이렇게 뻑뻑하면 안 되는데...' },
        { id: 'stove', kind: 'flavor', rect: [19, 5, 2, 1], label: '가스레인지', say: '불은 꺼져 있네요.', think: '라면 끓여 먹고 싶다...' },
        { id: 'tv', kind: 'flavor', rect: [9, 5, 2, 1], label: 'TV', say: '(TV는 켜져 있다)', think: '이 집 TV 크기 부럽다...' },
        { id: 'toilet', kind: 'flavor', rect: [7, 13, 1, 1], label: '변기', say: '이상 없습니다.', think: '화장실 급하다...' },
      ],
    });
  })();

  PJ.MAP = PJ.MAPS.complex; // 호환용 별칭
})();
