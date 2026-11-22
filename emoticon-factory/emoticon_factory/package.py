"""패키징: 제출 체크리스트 + 한 장 요약 README. 제출(submit)은 하지 않는다."""
import json, shutil
from datetime import datetime
from .core import KST


def package(cfg, res, outdir, history, final_scores, params):
    shutil.rmtree(outdir / "_work", ignore_errors=True)
    spec = json.load(open(outdir.parents[2] / "specs" / "platforms.json", encoding="utf-8"))
    thr = cfg["review"]["pass_score"]
    passed = all(s >= thr for s, _ in final_scores.values())
    unverified = [k for k, v in spec.items() if isinstance(v, dict) and not v.get("verified")]
    sc_tbl = "\n".join(f"| {k} | {s} | {'통과' if s >= thr else '**미달**'} | {', '.join(i[:3]) or '-'} |" for k, (s, i) in final_scores.items())
    hist = "\n".join(f"- {h}" for h in history) or "- (수정 없이 통과)"
    sample = "⚠ **가상 샘플 데이터 기반 — 실제 트렌드 근거 아님.**\n\n" if res["sample_used"] else ""
    (outdir / "README.md").write_text(f"""# {res['topic']} — 한 장 요약 ({res['date']})

{sample}**상태:** {'자체 검수 통과' if passed else '자체 검수 미달 — 사람 검토 필요'} · 승인 모드 `{cfg['general']['approval_mode']}` ({'사람 승인 전 제출 금지' if cfg['general']['approval_mode']=='manual' else '자동 진행'}) · 제출은 아직 하지 않음

## 구성
- `character_sheet.svg` 캐릭터 시트(도형마다 id), `psd/character_sheet_layers.psd` 도형별 레이어 PSD
- `kakao_static/` 멈티 32컷(360×360 PNG), `kakao_animated/` PNG 21 + GIF 3
- `ogq/` 스티커 PNG 24(가정 규격 740×640) + APNG 3
- `report.md` 트렌드 근거 리포트, `analysis.json`

## 자체 점수 (기준 {thr}점, 대리 지표 기반)
| 항목 | 점수 | 판정 | 문제 |
|--|--|--|--|
{sc_tbl}

## 자동 수정 이력
{hist}

## 제출 체크리스트
- [ ] **규격 재확인**: 미검증 규격 → {', '.join(unverified)} (specs/platforms.json, 공식 제안 가이드로 확인)
- [ ] 이미지를 사람이 직접 훑어보기 (자동 점수는 가독성·일관성의 대리 지표일 뿐)
- [ ] 데이터가 샘플이 아닌 실수집인지 확인{' (이번 회차는 샘플 사용)' if res['sample_used'] else ''}
- [ ] 신청서 **AI 사용 여부: '사용함'으로 사실대로 기재** (캐릭터·이미지 모두 AI/코드로 생성)
- [ ] 기존 이모티콘·타 IP와 유사하지 않은지 검색 확인
- [ ] 승인 모드 manual → 사람 승인 후에만 제출
""", encoding="utf-8")
    (outdir / "params.json").write_text(json.dumps({"params": params, "generated": datetime.now(KST).isoformat(timespec="seconds")}, ensure_ascii=False), encoding="utf-8")
    return passed
