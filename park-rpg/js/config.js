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
      // 실내 맵(관리사무소/세대) 타일
      floorOffice: [0, 3], floorWood: [1, 3], floorTileW: [2, 3], floorBalcony: [3, 3], wallTop: [4, 3], wallFace: [5, 3],
      doorIn: [6, 3], void: [7, 3], counter: [8, 3],
      pcDesk: [0, 4], phoneDesk: [1, 4], keybox: [2, 4], chair: [3, 4], sofa: [4, 4], tv: [5, 4], tableL: [6, 4], tableS: [7, 4], plant: [8, 4],
      stove: [0, 5], sink: [1, 5], fridge: [2, 5], gasDet: [3, 5], gasValve: [4, 5], detector: [5, 5], toilet: [6, 5], tub: [7, 5], leak: [8, 5],
      waterValve: [0, 6], washer: [1, 6], deskW: [2, 6], noticeBoard: [3, 6],
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
      fire:      { row: 3, frames: 2 }, // 돌발 이벤트: 화재 오경보
      elevator:  { row: 4, frames: 2 }, // 돌발 이벤트: 엘리베이터 멈춤
      villain:   { row: 5, frames: 2 }, // 네임드 보스: 이중주차 빌런
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
    { // 히든 전직(엔딩): 소장 이후
      id: 'bosajang', name: '박사장', title: '터프팅 공방 대표', maxLv: 60, hidden: true,
      speed: 104, power: 3.0, expMult: 2.4, goldMult: 2.6, reachBonus: 16, hpMult: 2.4,
      palette: { c: '#c8793a', a: '#ff7ab8', w: '#f2f2f2', p: '#4a3a32', hair: '#c4c4c4', hat: '#ff7ab8', glasses: true },
      promote: { lv: 50, gold: 30000, tasks: { weed: 300, snow: 200, complaint: 150 }, bosses: 3, items: 5,
        label: '2027 퇴사 후 터프팅 공방 창업' },
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
    kind:     { id: 'kind',     name: '친절한 안내',  icon: '😊', group: 'complaint', type: 'single', target: ['complaint', 'event'], dmg: 3.0, cd: 7.0,  reach: 40, bonus: 2.0, unlockLv: 2, baseCost: 50, key: '3', desc: '민원(과 돌발 상황)을 크게 처리하고 추가 보상을 받는다.' },
    // 기본 응대: Space 로 민원 상대할 때 자동 사용 (강화 대상 아님)
    urgent:   { id: 'urgent',   name: '긴급 대응',    icon: '🚨', group: 'event',     type: 'single', target: 'event',     dmg: 1.6, cd: 0.35, reach: 34, unlockLv: 1, baseCost: 0, hidden: true, desc: '' },
    answer:   { id: 'answer',   name: '기본 응대',    icon: '💬', group: 'complaint', type: 'single', target: 'complaint', dmg: 1.0, cd: 0.5,  reach: 34, unlockLv: 1, baseCost: 0, hidden: true, desc: '' },
  };

  /* --------------------------- 현장 업무 오브젝트 -------------------------- */
  // zone: grass(잔디밭) / paved(보행로+주차장) / path(보행로)
  PJ.OBJECTS = {
    weed:      { id: 'weed',      name: '잡초 더미', hp: 3, exp: 6,  gold: 4,  max: 9, interval: 3.2, zone: 'grass' },
    snow:      { id: 'snow',      name: '눈 더미',   hp: 4, exp: 8,  gold: 6,  max: 7, interval: 4.0, zone: 'paved' },
    complaint: { id: 'complaint', name: '민원',      hp: 3, exp: 14, gold: 12, max: 3, interval: 8.0, zone: 'path', ttl: 50 },
  };

  /* ----------------------- 돌발 당직 이벤트 / 네임드 보스 -------------------- */
  PJ.EVENT = { interval: 45, first: 30, mult: 2.5 };           // 이벤트 주기(초), 첫 발생, 보상 배율
  PJ.FEVER = { dur: 10, speed: 1.35, rate: 1.8 };              // 피버: 지속시간, 이속 배율, 쿨/공속 배율
  PJ.EVENTS = [
    { id: 'elevator', text: '🛗 엘리베이터 멈춤!', sprite: 'elevator', hp: 6, ttl: 30, exp: 30, gold: 25, tile: [14, 5], win: '엘리베이터 정상 운행!' },
    { id: 'villain', text: '🚗 이중주차 빌런 출현!', name: '이중주차 빌런', sprite: 'villain', boss: true, hp: 16, ttl: 45, exp: 80, gold: 60, zone: 'parking', win: '빌런 퇴치 완료!' },
  ];

  /* ------------------------ 관리실 유머 장비 도감 ---------------------------- */
  // 확률 드롭(중복 획득 시 Lv↑, 최대 5). perLv: 레벨당 효과
  PJ.ITEMS = [
    { id: 'hotpack', name: '편의점 핫팩', icon: '🔥', desc: '새벽 3교대의 필수품. 주머니에서 꺼내는 순간 세상이 따뜻해진다.', effect: '눈 더미 보상 +10%/Lv' },
    { id: 'quietMower', name: '무소음 예초기', icon: '🌱', desc: "'무소음'이라 적혀 있지만 민원은 소리 대신 눈빛으로 들어온다.", effect: '제초 스킬 위력 +10%/Lv' },
    { id: 'earmuff', name: '방한 귀마개', icon: '🎧', desc: '민원 목소리가 한결 부드럽게 들린다. 발걸음도 가벼워진다.', effect: '이동속도 +5%/Lv' },
    { id: 'coffee', name: '아메리카노 샷추가', icon: '☕', desc: '관리실 인생은 샷 추가 전과 후로 나뉜다.', effect: '스킬 쿨타임 -4%/Lv' },
    { id: 'catSnack', name: '고양이 간식', icon: '🐟', desc: '단지 길고양이의 신뢰를 얻었다. 민원인도 어쩐지 순해진다.', effect: '민원·돌발 골드 +10%/Lv' },
  ];
  PJ.ITEM_MAX = 5;

  /* ---------------- 박주임 겉대사 / 속마음(구름) 말풍선 ---------------------- */
  PJ.SPEECH = {
    say: ['네, 바로 확인하겠습니다!', '금방 처리해 드리겠습니다~', '불편 드려 죄송합니다!', '관리사무소입니다, 바로 가겠습니다!', '안전하게 마무리했습니다!'],
    think: {
      any: ['집에 가서 칼바람 한 판 하고 싶다...', '올겨울 눈 적당히 왔으면...', '퇴근까지 몇 시간 남았지...', '커피... 커피가 필요해...', '월급날이 언제더라...'],
      weed: ['이 풀, 어제도 뽑았는데...', '잡초는 왜 이렇게 성실할까...'],
      snow: ['올겨울 눈 적당히 왔으면...', '제설함 열쇠 어디 뒀더라...'],
      complaint: ['방금 전화로 말씀하셨잖아요...', '친절, 친절, 친절...'],
      boss: ['저 차 주인, 오늘도 전화 안 받겠지...', '이 맛에 관리실 한다... 아니다.'],
      night: ['6시 이후엔 제발 전화 안 왔으면...', '야간수당이 아니면 진작 집에 갔다...', '아침 9시는 대체 언제 오는 거야...', '라면 끓일 시간은 있으려나...'],
      visit: ['제발 오경보이길...', '엘리베이터 없이 8층은 좀...'],
    },
    bossSay: ['주차선은 지켜 주세요!'],
    nightSay: ['네, 관리사무소입니다. 도와드리겠습니다!', '확인해 보겠습니다, 잠시만요~'],
    visitSay: ['지금 바로 올라가겠습니다!', '점검 나왔습니다, 잠시만 실례하겠습니다!'],
    event: ['긴급 상황입니다, 침착하게 대응하겠습니다!'],
  };

  /* ------------------ 근무 시계 / 세대 방문 민원 / 야간 당직 ----------------- */
  // 09:00 출근 → 18:00 야간 당직 → 다음날 09:00 퇴근 정산 (게임 시간 1초당 minPerSec 분)
  PJ.TIME = { minPerSec: 2.6, start: 540, dusk: 1080, end: 1980 };

  // 주간 '세대 방문 민원': 동 입구 → 세대 내부 맵에서 미션 처리
  PJ.VISIT = {
    first: 22, interval: 38, ttl: 100, mult: 2.0, max: 2, exp: 28, gold: 24,
    buildings: ['101', '102', '103'],
    types: {
      fire: { title: '화재 오경보', text: (b, u) => `${b}동 ${u}호 화재 오경보!`, steps: [
        { id: 'detector', label: '천장 화재감지기 교체', verb: '감지기 교체 중…', done: '감지기 교체 완료 — 오경보 해제!', hp: 6 }] },
      gas: { title: '가스 경보', text: (b, u) => `${b}동 ${u}호 가스경보!`, steps: [
        { id: 'gasDet', label: '가스감지기 전원잭 분리', verb: '전원잭 분리 중…', done: '전원잭 분리 — 경보음 정지!', hp: 5 }] },
      leak: { title: '누수 점검', text: (b, u) => `${b}동 ${u}호 누수 점검!`, steps: [
        { id: 'leak', label: '누수 위치 확인', verb: '배관 점검 중…', done: '배관 이음새 누수 발견! 밸브를 잠그세요', hp: 4 },
        { id: 'waterValve', label: '베란다 밸브 잠금', verb: '밸브 잠그는 중…', done: '밸브 잠금 — 누수 차단!', hp: 4 }] },
    },
  };

  // 야간 당직: 내방 민원(데스크) ↔ 전화 민원 번갈아 발생
  PJ.NIGHT = {
    first: 6, gapMin: 4, gapMax: 8, ttl: { walkin: 30, call: 24 }, mult: 1.8, exp: 22, gold: 20,
    walkin: [
      { id: 'pass', title: '방문차량증 발급', text: '방문차량증 발급해 주세요~', station: 'desk', verb: '방문차량증 발급 중…' },
      { id: 'regcar', title: '신규 차량 등록', text: '신규 차량 등록하러 왔어요', station: 'pc', verb: '차량 정보 입력 중…' },
      { id: 'misc', title: '기타 문의 (열쇠 대여)', text: '공용 열쇠 좀 빌릴 수 있을까요?', station: 'keybox', verb: '열쇠 찾는 중…' },
    ],
    call: [
      { id: 'noise', title: '층간소음 중재', text: '윗집이 너무 시끄러워요!!', station: 'phone', verb: '민원인 달래는 중…' },
      { id: 'smoke', title: '세대 내 흡연 민원', text: '아랫집 담배 냄새가 올라와요', station: 'phone', verb: '세대에 안내방송 중…' },
      { id: 'parking', title: '주차 시비', text: '제 자리에 누가 주차했어요!', station: 'phone', verb: '차주에게 연락 중…' },
    ],
  };

  // 관리실 동료 / 입주민 NPC 팔레트 (플레이스홀더 도트용)
  PJ.NPCS = [
    { name: '김대리', palette: { c: '#8a6ac8', a: '#ffffff', w: '#f2f2f2', p: '#3a3550', hair: '#2a1d14', hat: null, glasses: false } },
    { name: '이과장', palette: { c: '#c8793a', a: '#ffd24a', w: '#f2f2f2', p: '#4a3a32', hair: '#555555', hat: null, glasses: true } },
    { name: '입주민A', palette: { c: '#d86a8a', a: '#ffffff', w: '#f2f2f2', p: '#40405a', hair: '#7a4a2a', hat: null, glasses: false } },
    { name: '입주민B', palette: { c: '#4aa8a0', a: '#ffffff', w: '#f2f2f2', p: '#304048', hair: '#222222', hat: null, glasses: true } },
    { name: '입주민C', palette: { c: '#d8c24a', a: '#ffffff', w: '#f2f2f2', p: '#503a30', hair: '#aa6a3a', hat: '#d8c24a', glasses: false } },
  ];
})();
