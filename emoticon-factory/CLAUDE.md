# 프로젝트: 이모티콘 공장 (emoticon-factory)

## 목표
사람이 개입하지 않아도 매일 자동으로: 신규 이모티콘 분석 → 오늘의 주제 선정 → 캐릭터 시안(트렌드 근거 리포트 포함) → 제출용 세트 제작 → 자체 검수·수정 → 결과 폴더 저장.
사용자는 "승인 모드" 스위치(manual/auto)로만 개입한다. 처음엔 manual, 데이터가 쌓이면 auto.

## 실행 환경
- Claude Pro 구독 안에서 동작. API 키는 쓰지 않는다. (외부 LLM 호출 없음. 1단계는 표준 라이브러리, 2단계는 Pillow + node/playwright(Chromium) 사용)
- 매일 11:00(KST) 클라우드 예약 실행(docs/SCHEDULE.md 참고). 한도에 걸려도 조용히 죽지 말고 로그를 남기고 다음 실행에서 이어서 한다(state: DB `step_runs`).

## 파이프라인
1. collect: 카카오 이모티콘샵·OGQ의 신규/인기/키워드 검색 수집. robots.txt 확인, 요청 간격, 최소 수집. SQLite 저장.
2. analyze: 키워드·색감·포즈·문구·포화도·빈틈 분석 → 주제 후보 → 오늘의 주제 1개 + 근거 리포트.
3. design: 캐릭터 시트 SVG (도형마다 id, 레이어 분리 가능).
4. produce: 멈티 32컷, 움티, 플랫폼 규격 PNG/APNG/GIF, 레이어 PSD. (specs/platforms.json 기준. 규격은 verified=false — 제3자/가정값)  ← 구현(2단계)
5. review: 가독성·일관성·트렌드 적합·규격 충족 점수, 미달 시 최대 3회 자동 수정(대리 지표). ← 구현(2단계)
6. package: output/날짜/주제/ 정리, 체크리스트, README. ← 구현(2단계)
7. submit: 1차는 제출 직전 폴더까지. AI 사용 여부는 사실대로 기재. ← 미구현
8. learn: 심사 결과를 DB에 입력받아 반영. ← 테이블만 준비(`reviews_feedback`)

## 공통 규칙
- 모든 단계에 로그, 재시도, 실행 비용·시간 상한. 설정은 `config.toml` 하나로 관리(승인 모드, 상한, 플랫폼 목록).
- 수집은 robots.txt를 지키고 최소한만. 차단되면 우회하지 않는다.
- 샘플(seed) 데이터는 `is_sample=1`로 표시하고 리포트에 반드시 명시한다. 실제 데이터인 척하지 않는다.

## 구현 단계
- [x] 1단계: collect + analyze + design(SVG 1개) + 근거 리포트
- [x] 2단계: produce/review/package  - [ ] 3단계: submit 자동화  - [ ] 4단계: learn

## 실행
`python -m emoticon_factory run` (전체) / `collect|analyze|design|produce|review|package` (단계별, `--force`로 재실행) / `status` / `feedback`
테스트: `python -m unittest discover -s tests`
