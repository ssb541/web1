"""제출 준비(1차): 제출 직전 폴더와 신청서 초안까지만 만든다. 실제 제출/로그인은 하지 않는다.
차단 조건이 하나라도 있으면 SUBMIT_STATUS.md에 이유를 적고 READY가 되지 않는다."""
import json, shutil
from .core import ROOT

AI_DISCLOSURE = {"used": True, "detail": "캐릭터 디자인(SVG)과 컷 이미지를 AI(Claude)가 작성한 코드로 생성했고, 사람이 검수한다. 손그림이 아니다."}


def submit_prep(cfg, res, outdir, sc, history):
    spec = json.load(open(ROOT / "specs" / "platforms.json", encoding="utf-8"))
    thr = cfg["review"]["pass_score"]
    blockers = []
    if res["sample_used"]:
        blockers.append("분석 데이터에 가상 샘플이 포함됨 (실수집 후 재실행)")
    unv = [k for k, v in spec.items() if isinstance(v, dict) and not v.get("verified")]
    if unv:
        blockers.append("플랫폼 규격 미검증: " + ", ".join(unv))
    low = [f"{k} {s}" for k, (s, _) in sc.items() if s < thr]
    if low:
        blockers.append("자체 검수 미달: " + ", ".join(low))
    if not (outdir / "HUMAN_CHECKED").exists():
        blockers.append("사람 확인 표시 없음 (이미지를 직접 확인한 뒤 빈 파일 `HUMAN_CHECKED` 생성)")
    if cfg["general"]["approval_mode"] == "manual" and not (outdir / "APPROVED").exists():
        blockers.append("manual 모드: 사람 승인 파일 `APPROVED` 필요")
    kw = [k for k, _ in res["top_keywords"][:6]]
    form = {"title_candidates": [f"{res['topic']} 친구들", "동글이·세모·네모", "말랑 도형 친구들"],
            "description": f"원·삼각형·사각형 도형 친구들이 안부, 응원, 사랑 표현을 전합니다. ({res['topic']})",
            "tags": kw, "ai_disclosure": AI_DISCLOSURE,
            "sets": {"kakao_static": 32, "kakao_animated": "PNG 21 + GIF 3", "ogq": "PNG 24 + APNG 3"},
            "note": "초안이다. 실제 신청서 항목은 각 플랫폼 화면에서 확인해 채울 것. AI 사용 여부는 사실대로 '사용'."}
    sub = outdir / "submission"
    sub.mkdir(exist_ok=True)
    for d in ("kakao_static", "kakao_animated", "ogq"):
        shutil.copytree(outdir / d, sub / d, dirs_exist_ok=True)
    (sub / "application_draft.json").write_text(json.dumps(form, ensure_ascii=False, indent=1), encoding="utf-8")
    ready = not blockers
    (outdir / "SUBMIT_STATUS.md").write_text(
        f"# 제출 상태: {'READY (사람이 직접 제출)' if ready else 'BLOCKED'}\n\n" +
        ("모든 조건 충족. 브라우저 제출 자동화는 아직 없으므로 `submission/` 폴더를 사용해 직접 제출한다.\n" if ready else
         "## 막힌 이유\n" + "\n".join(f"- {b}" for b in blockers) + "\n"), encoding="utf-8")
    return ready, blockers
