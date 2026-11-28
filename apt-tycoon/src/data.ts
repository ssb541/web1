// 상수 & 정의 데이터
export const N = 24; // 맵 크기 (N x N), 마지막 행(y=N-1)은 도로
export const TW = 32; // 타일 가로 (아이소메트릭 2:1)
export const TH = 16;
export const DAY_SEC = 5; // 1x 속도에서 하루가 흐르는 실제 초
export const MONTH_DAYS = 30;
export const POST_R = 6; // 직원 배치 구역 반경(타일)

export const SEASON_NAMES = ['봄', '여름', '가을', '겨울'];
export const SEASON_ICON = ['🌸', '☀️', '🍁', '❄️'];

export type BType = 'apt' | 'office' | 'guard' | 'parking' | 'playground' | 'recycle' | 'garden' | 'tree';

export interface BDef {
  key: BType;
  name: string;
  icon: string;
  w: number;
  h: number;
  cost: number;
  upkeep: number; // 월 유지비
  maxLevel: number;
  up: number[]; // up[level-1] = 해당 레벨에서 다음 레벨로 올리는 비용
  desc: string;
  buildable: boolean;
}

export const BDEFS: Record<BType, BDef> = {
  apt: { key: 'apt', name: '아파트 동', icon: '🏢', w: 3, h: 2, cost: 1800, upkeep: 40, maxLevel: 3, up: [2200, 3500], desc: '입주 세대가 늘어 관리비 수입이 커집니다. 업그레이드하면 층수↑ 세대수↑', buildable: true },
  office: { key: 'office', name: '관리사무소', icon: '🏛️', w: 2, h: 2, cost: 0, upkeep: 30, maxLevel: 2, up: [1500], desc: '직원 정원이 늘어납니다 (6명 → 10명).', buildable: false },
  guard: { key: 'guard', name: '경비실', icon: '💂', w: 1, h: 1, cost: 300, upkeep: 10, maxLevel: 1, up: [], desc: '단지 치안 점수를 올려줍니다.', buildable: true },
  parking: { key: 'parking', name: '주차장', icon: '🅿️', w: 2, h: 2, cost: 600, upkeep: 15, maxLevel: 2, up: [800], desc: '주차면 8면 (지붕형 업그레이드 시 12면).', buildable: true },
  playground: { key: 'playground', name: '놀이터', icon: '🛝', w: 2, h: 2, cost: 700, upkeep: 15, maxLevel: 2, up: [900], desc: '아이·엄마 입주민의 만족도를 크게 올립니다.', buildable: true },
  recycle: { key: 'recycle', name: '분리수거장', icon: '♻️', w: 2, h: 1, cost: 400, upkeep: 10, maxLevel: 2, up: [500], desc: '쓰레기 발생을 줄여줍니다. 자주 치워주세요.', buildable: true },
  garden: { key: 'garden', name: '화단', icon: '🌷', w: 1, h: 1, cost: 60, upkeep: 2, maxLevel: 1, up: [], desc: '계절마다 꽃이 피는 작은 화단. 조경 점수 +1', buildable: true },
  tree: { key: 'tree', name: '조경수', icon: '🌳', w: 1, h: 1, cost: 100, upkeep: 3, maxLevel: 1, up: [], desc: '계절마다 색이 바뀌는 나무. 조경 점수 +1.5', buildable: true },
};

export const BUILD_ORDER: BType[] = ['apt', 'parking', 'playground', 'recycle', 'guard', 'garden', 'tree'];

export type Role = 'manager' | 'tech' | 'guard' | 'cleaner';
export interface RoleDef {
  key: Role;
  name: string;
  icon: string;
  hire: number;
  salary: number; // 월급
  desc: string;
  color: string;
}
export const ROLES: Record<Role, RoleDef> = {
  manager: { key: 'manager', name: '관리주임', icon: '📋', hire: 100, salary: 280, desc: '층간소음 등 대인 민원 중재, 단지 순회로 민원 게이지 완화', color: '#2f4f9d' },
  tech: { key: 'tech', name: '기전기사', icon: '🔧', hire: 80, salary: 250, desc: '승강기·동파·방역, 시설 정비로 노후도 관리', color: '#e08a1e' },
  guard: { key: 'guard', name: '경비원', icon: '💂', hire: 60, salary: 200, desc: '이중주차 정리, 단지 순찰로 치안 확보', color: '#1d3b5a' },
  cleaner: { key: 'cleaner', name: '미화원', icon: '🧹', hire: 40, salary: 170, desc: '쓰레기 청소, 예초, 제설, 낙엽 처리', color: '#3d9a55' },
};
export const ROLE_ORDER: Role[] = ['manager', 'tech', 'guard', 'cleaner'];

export const FEE_PER_HH = 50; // 세대당 월 관리비(만원)
export const APT_HH = [0, 15, 28, 40]; // 레벨별 세대수
export const APT_FLOORS = [0, 5, 7, 10];
export const PARK_SLOTS = [0, 8, 12];

export const MONEY_UNIT = '만원';
export function fmt(n: number): string {
  const s = Math.round(n);
  return s.toLocaleString('ko-KR');
}
export function monthNumber(mi: number): number {
  return ((mi + 2) % 12) + 1; // mi=0 → 3월
}
export function seasonOf(mi: number): number {
  return Math.floor((mi % 12) / 3);
}
export const RANKS = [
  { title: '관리주임', need: 0, days: 0, minSat: 0 },
  { title: '관리과장', need: 2, days: 20, minSat: 50 },
  { title: '관리소장', need: 3, days: 30, minSat: 62 },
  { title: '단지 총괄소장', need: 4, days: 40, minSat: 75 },
  { title: '명품 5성 단지 소장', need: 5, days: 60, minSat: 85 },
];
