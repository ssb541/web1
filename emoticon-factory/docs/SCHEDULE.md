# 매일 11:00(KST) 예약 실행 구성

공식 문서(code.claude.com/docs/en/routines, 2026-11 확인) 요약:
- Pro 플랜 포함. claude.ai/code/routines 에서 만들거나 CLI `/schedule`. **클라우드 세션 안에서는 `/schedule`이 안 됨** → 웹 UI에서 생성.
- 최소 간격 1시간. cron은 UTC 기준, `CRON_TZ=Asia/Seoul` 접두로 KST 지정 가능. 정각은 몇 분 늦게 시작될 수 있어 **11:03** 권장.
  - cron: `CRON_TZ=Asia/Seoul 3 11 * * *`
- 한도: 예약 실행 계정당 시간당 100회(하루 1회라 무관). 실행은 구독 사용량을 일반 세션처럼 소모한다. 한도 도달 시 실행이 거절/중단됨(사용량 크레딧 없으면 창이 리셋될 때까지).
- 실행은 저장소를 새로 clone하고 `claude/` 브랜치에 푸시한다 → 결과(output/, data/factory.db)는 **커밋·푸시해야 다음 실행에 남는다.** (컨테이너는 휘발성)
- 환경 네트워크: 기본 Limited. 수집하려면 환경의 Allowed domains에 `e.kakao.com`, `ogqmarket.naver.com`(및 필요 시 하위 호스트)을 추가해야 함. 이 개발 샌드박스에서는 차단되어 있어 수집 URL을 검증하지 못했다.

## 만들기 (웹 UI)
1. claude.ai/code/routines → New → 저장소 `ssb541/web1`, 환경 선택(위 도메인 허용).
2. 트리거: Schedule → Custom → 위 cron.
3. 프롬프트:
```
emoticon-factory 폴더에서 `python -m emoticon_factory run`을 실행한다.
종료코드 2(상한 도달/paused)나 1(실패)이면 logs/의 오늘 로그를 요약해 남기고 중단한다(다음 실행이 이어받음).
끝나면 data/factory.db, logs/, output/ 변경을 커밋하고 claude/ 브랜치로 푸시한다. 질문하지 말고 진행한다.
```
## 한도에 걸렸을 때
- 코드 쪽: 시간(600s)·요청(30회) 상한 초과 → 단계 상태 `paused` 기록, 종료코드 2. 오류 → 재시도 후 `failed` 기록. 완료된 단계는 다음 실행에서 건너뜀(`python -m emoticon_factory status`).
- 구독 한도로 세션 자체가 못 뜬 경우는 코드가 실행되지 않으므로 로그가 남지 않는다. routines 페이지의 실행 이력에서 확인하고 다음 날 실행이 자동 재시도한다.
