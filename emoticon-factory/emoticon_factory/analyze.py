"""분석: 키워드·색감·문구·포화도·빈틈 -> 주제 후보 -> 오늘의 주제 1개 + 근거 리포트.
한계(1단계): 이미지를 보지 못하므로 색감/포즈/문구는 '제목 텍스트' 기반 추정이다. 리포트에 명시한다."""
import json, re
from collections import Counter
from .core import ROOT, today_kst

STOP = {"의","과","와","이","가","은","는","를","을","에","한","한마디","모음","세트","일상","하루","친구들","데일리"}
# 주제 후보(theme): 제목에서 감지할 단서 단어. 포화도 = 해당 단서가 든 제목 비율.
THEMES = {
 "동물 일상(곰/고양이/강아지)": ["곰","곰돌이","고양이","냥","냥이","강아지","식빵","오리","토끼","햄","햄찌","햄스터","병아리","펭귄","공룡","앵무새"],
 "직장인 공감": ["직장인","퇴근","야근","MZ","피곤","졸린","생존"],
 "인사/응원/사랑 표현": ["인사","사랑","사랑해","응원","화이팅","감사","감동","고백","설레는"],
 "리액션/무표정": ["리액션","반응","무표정","눈치","답장","무심한"],
 "도형 캐릭터": ["도형","동그라미","세모","네모","삼각형","기하학","별별","두부"],
 "음식 의인화": ["감자","두부","식빵","빵빵한"],
}
COLOR_WORDS = {"파스텔":"#F6C9D8","말랑":"#FFE3A3","별":"#FFD84D","동그라미":"#9AD0F5","세모":"#F5A3A3","네모":"#A8E0B5"}
PHRASES = ["사랑해","화이팅","감사","퇴근","인사","답장","피곤","설레","응원","리액션"]
SAMPLE_NOTE = "⚠ 이 리포트의 일부/전부는 가상 샘플 데이터에 기반합니다. 실제 트렌드 근거가 아닙니다."


JOSA = ("의", "은", "는", "이", "가", "을", "를", "과", "와", "에")


def tokens(title):
    out = []
    for t in re.findall(r"[가-힣A-Za-z]+", title):
        if len(t) > 2 and t.endswith(JOSA):   # 단순 조사 제거(형태소 분석기 없음)
            t = t[:-1]
        if t not in STOP and len(t) > 1:
            out.append(t)
    return out


def load_items(cfg, db, log):
    rows = [dict(r) for r in db.execute("SELECT * FROM items WHERE is_sample=0")]
    sample_used = False
    if len(rows) < cfg["analyze"]["min_real_items"]:
        seed = json.load(open(ROOT / cfg["analyze"]["seed_file"], encoding="utf-8"))
        rows += [dict(i, is_sample=1) for i in seed["items"]]
        sample_used = True
        log.warning("실데이터 %d건 < %d건 -> 샘플 데이터 병행(리포트에 명시)", len(rows) - len(seed["items"]), cfg["analyze"]["min_real_items"])
    return rows, sample_used


def analyze(cfg, db, log):
    rows, sample_used = load_items(cfg, db, log)
    n = len(rows)
    kw = Counter(t for r in rows for t in tokens(r["title"]))
    pop = Counter(t for r in rows if r["kind"] == "popular" for t in tokens(r["title"]))
    new = Counter(t for r in rows if r["kind"] == "new" for t in tokens(r["title"]))
    n_pop = max(1, sum(r["kind"] == "popular" for r in rows))
    n_new = max(1, sum(r["kind"] == "new" for r in rows))
    search_n = [r for r in rows if r["kind"] == "search"]

    cands, hint = [], cfg["general"]["preferred_theme_hint"]
    feedback = {r["topic"]: (1 if r["result"] == "approved" else -1) for r in db.execute("SELECT topic,result FROM reviews_feedback")}
    for theme, cues in THEMES.items():
        hit = [r for r in rows if any(c in r["title"] for c in cues)]
        saturation = len(hit) / n                                   # 높을수록 레드오션
        pop_rate = sum(any(c in r["title"] for c in cues) for r in rows if r["kind"] == "popular") / n_pop
        new_rate = sum(any(c in r["title"] for c in cues) for r in rows if r["kind"] == "new") / n_new
        momentum = new_rate - pop_rate                              # 신작에서 늘고 있나
        demand = pop_rate                                           # 인기 상위에 존재 = 수요 증거
        gap = max(0.0, demand - saturation * 0.5) if saturation < 0.25 else 0.0
        score = 0.35 * demand + 0.25 * max(momentum, 0) + 0.3 * (1 - saturation) + 0.2 * gap
        if theme == hint:
            score += cfg["general"]["hint_bonus"]
        score += 0.1 * feedback.get(theme, 0)
        cands.append(dict(theme=theme, score=round(score, 3), saturation=round(saturation, 3), demand=round(demand, 3),
                          momentum=round(momentum, 3), gap=round(gap, 3), n=len(hit), examples=[r["title"] for r in hit[:3]]))
    cands.sort(key=lambda c: -c["score"])
    top = cands[0]

    palette_votes = Counter()
    for r in rows:
        for w, c in COLOR_WORDS.items():
            if w in r["title"]:
                palette_votes[c] += 1
    phrases = Counter(p for r in rows for p in PHRASES if p in r["title"])
    result = dict(date=today_kst(), n_items=n, sample_used=sample_used, topic=top["theme"], candidates=cands,
                  top_keywords=kw.most_common(12), popular_keywords=pop.most_common(8), new_keywords=new.most_common(8),
                  palette=[c for c, _ in palette_votes.most_common(4)], phrases=phrases.most_common(6),
                  search_count=len(search_n), by_platform=dict(Counter(r["platform"] for r in rows)))
    db.execute("DELETE FROM topics WHERE run_date=?", (result["date"],))
    for c in cands:
        db.execute("INSERT INTO topics VALUES(?,?,?,?,?)", (result["date"], c["theme"], c["score"], int(c is top), json.dumps(c, ensure_ascii=False)))
    db.commit()
    return result


def slug(s):
    return re.sub(r"[^0-9A-Za-z가-힣]+", "-", s).strip("-")


def write_report(cfg, res, svg_name):
    d = ROOT / cfg["general"]["output_dir"] / res["date"] / slug(res["topic"])
    d.mkdir(parents=True, exist_ok=True)
    top = res["candidates"][0]
    L = [f"# 오늘의 주제: {res['topic']}  ({res['date']})", ""]
    if res["sample_used"]:
        L += [f"> **{SAMPLE_NOTE}**", ">", f"> 분석 항목 수 {res['n_items']}건 (플랫폼별: {res['by_platform']}). 실수집이 막혔거나 부족하면 샘플로 대체됩니다.", ""]
    L += ["## 1. 한 줄 결론",
          f"'{res['topic']}'은(는) 포화도 {top['saturation']:.0%}, 인기 목록 내 비중(수요) {top['demand']:.0%}, 신작-인기 모멘텀 {top['momentum']:+.0%}로 후보 중 종합점수 {top['score']}가 가장 높다.",
          ""]
    L += ["## 2. 주제 후보 비교", "", "| 순위 | 주제 | 점수 | 포화도 | 수요 | 모멘텀 | 빈틈 | 예시 제목 |", "|--|--|--|--|--|--|--|--|"]
    for i, c in enumerate(res["candidates"], 1):
        L.append(f"| {i} | {c['theme']} | {c['score']} | {c['saturation']:.0%} | {c['demand']:.0%} | {c['momentum']:+.0%} | {c['gap']:.0%} | {' / '.join(c['examples'])} |")
    L += ["", "점수 = 0.35×수요 + 0.25×모멘텀(+) + 0.30×(1−포화도) + 0.20×빈틈 (+선호 힌트/심사 피드백 보정). 가중치는 analyze.py에 있다.", "",
          "## 3. 근거 데이터",
          f"- 상위 키워드: {', '.join(f'{k}({v})' for k, v in res['top_keywords'])}",
          f"- 인기 목록 키워드: {', '.join(f'{k}({v})' for k, v in res['popular_keywords'])}",
          f"- 신작 키워드: {', '.join(f'{k}({v})' for k, v in res['new_keywords'])}",
          f"- 자주 쓰는 문구: {', '.join(f'{k}({v})' for k, v in res['phrases'])}",
          f"- 제목에서 추정한 색감 단서 팔레트: {', '.join(res['palette']) or '없음(기본 파스텔 사용)'}",
          "", "## 4. 트렌드가 이래서 이런 캐릭터를 만들었다",
          f"- 포화도가 가장 높은 후보는 '{max(res['candidates'], key=lambda c: c['saturation'])['theme']}'({max(c['saturation'] for c in res['candidates']):.0%})다. 선정 주제 '{res['topic']}'의 포화도는 {top['saturation']:.0%}로 상대적으로 비어 있다.",
          f"- 선호 힌트 보정(+{cfg['general']['hint_bonus']})이 적용되었다. 데이터만으로는 1위가 아닐 수 있다(점수표 참고). 힌트 제외 시 점수는 {round(top['score'] - (cfg['general']['hint_bonus'] if top['theme'] == cfg['general']['preferred_theme_hint'] else 0), 3)}.",
          "- 단순한 도형(원·삼각형·사각형)은 레이어 분리와 애니메이션이 쉽고, 작은 크기에서도 가독성이 높다.",
          "- 표정 4종(기쁨/졸림/놀람/응원)은 인기 목록에 자주 나오는 반응·인사·응원 문구군과 맞춘다.",
          f"- 시안: `{svg_name}` (도형마다 id 부여, 레이어 분리 가능).", "",
          "## 5. 한계와 주의",
          "- 1단계는 제목 텍스트만으로 색감·포즈·문구를 추정한다. 이미지 분석은 후속 단계.",
          "- 이 시안은 AI가 생성했다. 제출 시 신청서의 AI 사용 여부 항목에 사실대로 기재해야 한다.",
          "- 수집 로그(`fetch_log` 테이블)에서 robots.txt 확인/차단 내역을 볼 수 있다."]
    (d / "report.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    (d / "analysis.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    return d
