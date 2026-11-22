# 에셋 교체 가이드

`js/config.js` 의 `PJ.ASSETS.sheets` 에서 각 시트의 `src` 에 PNG 경로를 넣으면
플레이스홀더 대신 해당 이미지를 사용합니다. (로딩 실패 시 자동 복귀)

| 시트 | 프레임 | 배치 규칙 |
|---|---|---|
| `tiles` | 16x16 | `ASSETS.tiles` 의 이름 → [col,row] 칸. 나무/화단/차량은 배경 투명 |
| `player` | 16x16 | 행 = 직급(0주임~3소장), 열 = [아래0,아래1,위0,위1,오른0,오른1] (왼쪽은 자동 반전) |
| `objects` | 16x16 | 0행 잡초(3단계 크다→작다), 1행 눈(3단계), 2행 민원(2프레임) |

프레임 크기를 바꾸려면 `frameW/frameH` 와 `anchor`(발/중심 위치)를 함께 수정하세요.
예: `player: { src: 'assets/player.png', frameW: 16, frameH: 16 }`
