import sys, json
from .core import load_config, setup_logging, connect, Budget, run_step, today_kst, ROOT
from .collect import collect
from .analyze import analyze, write_report, slug
from .design import design
from .produce import produce, DEFAULT_PARAMS
from .review import score, adjust
from .package import package


def main(argv):
    cmd = argv[0] if argv else "run"
    cfg = load_config()
    log = setup_logging(cfg)
    db = connect(cfg)
    budget = Budget(cfg)
    st = {}
    force = "--force" in argv

    def do_collect():
        return collect(cfg, db, log, budget)

    def do_analyze():
        st["res"] = analyze(cfg, db, log)
        return f"주제={st['res']['topic']} (샘플사용={st['res']['sample_used']})"

    def do_design():
        res = st.get("res") or analyze(cfg, db, log)
        outdir = ROOT / cfg["general"]["output_dir"] / res["date"] / slug(res["topic"])
        outdir.mkdir(parents=True, exist_ok=True)
        p, msg = design(cfg, res, outdir)
        d = write_report(cfg, res, p.name)
        (d / "APPROVAL.txt").write_text(f"approval_mode={cfg['general']['approval_mode']}\n" +
            ("manual: 사람이 검토·승인하기 전에는 다음 단계로 넘어가지 않습니다.\n" if cfg["general"]["approval_mode"] == "manual" else "auto: 자동 진행 허용.\n"), encoding="utf-8")
        return f"{msg}; 결과 폴더 {d.relative_to(ROOT)}"

    def load_res():
        res = st.get("res") or analyze(cfg, db, log)
        return res, ROOT / cfg["general"]["output_dir"] / res["date"] / slug(res["topic"])

    def do_produce():
        res, outdir = load_res()
        if not (outdir / "character_sheet.svg").exists():
            raise RuntimeError("character_sheet.svg 없음 - design 먼저")
        pf = outdir / "params.state.json"
        params = json.loads(pf.read_text()) if pf.exists() and "--fresh" not in argv else dict(DEFAULT_PARAMS)
        info = produce(cfg, res, outdir, params, log)
        pf.write_text(json.dumps(params))
        return f"produce {info}"

    def do_review():
        res, outdir = load_res()
        rcfg, params, history = cfg["review"], json.loads((outdir / "params.state.json").read_text()), []
        for rnd in range(rcfg["max_fix_rounds"] + 1):
            budget.check()
            sc = score(outdir, res, params)
            log.info("검수 %d회차: %s", rnd, {k: v[0] for k, v in sc.items()})
            bad = {k: v for k, v in sc.items() if v[0] < rcfg["pass_score"]}
            if not bad or rnd == rcfg["max_fix_rounds"]:
                break
            params, notes = adjust(params, sc)
            if not notes:
                history.append(f"{rnd + 1}회차: 미달({', '.join(bad)}) - 자동 수정 방법 없음")
                break
            history.append(f"{rnd + 1}회차: 미달({', '.join(f'{k} {v[0]}' for k, v in bad.items())}) → " + ", ".join(notes))
            produce(cfg, res, outdir, params, log)
        (outdir / "params.state.json").write_text(json.dumps(params))
        st["review"] = (sc, history, params)
        (outdir / "review.json").write_text(json.dumps({"scores": {k: v[0] for k, v in sc.items()}, "issues": {k: v[1] for k, v in sc.items()}, "history": history}, ensure_ascii=False, indent=1), encoding="utf-8")
        return f"점수 { {k: v[0] for k, v in sc.items()} }, 수정 {len(history)}회"

    def do_package():
        res, outdir = load_res()
        rv = st.get("review")
        if rv is None:
            rj = json.loads((outdir / "review.json").read_text())
            sc = {k: (v, rj["issues"][k]) for k, v in rj["scores"].items()}
            rv = (sc, rj["history"], json.loads((outdir / "params.state.json").read_text()))
        ok = package(cfg, res, outdir, rv[1], rv[0], rv[2])
        return f"package {'통과' if ok else '미달(사람 검토 필요)'}"

    steps = {"collect": do_collect, "analyze": do_analyze, "design": do_design,
             "produce": do_produce, "review": do_review, "package": do_package}
    if cmd == "status":
        for r in db.execute("SELECT * FROM step_runs ORDER BY run_date DESC, started DESC LIMIT 15"):
            print(dict(r))
        return 0
    if cmd == "feedback":  # python -m emoticon_factory feedback <topic> approved|rejected [사유]
        topic, result, reason = argv[1], argv[2], " ".join(argv[3:])
        db.execute("INSERT INTO reviews_feedback(run_date,topic,result,reason,entered_at) VALUES(?,?,?,?,?)", (today_kst(), topic, result, reason, today_kst()))
        db.commit()
        print("저장됨")
        return 0
    todo = list(steps) if cmd == "run" else [cmd]
    exit_code = 0
    for s in todo:
        if s == "design" and "res" not in st and cmd == "run" and not db.execute("SELECT 1 FROM step_runs WHERE run_date=? AND step='analyze' AND status='done'", (today_kst(),)).fetchone():
            log.error("analyze 미완료 - design 건너뜀"); exit_code = 1; continue
        status = run_step(db, cfg, log, s, steps[s], force=force)
        if status in ("failed", "paused"):
            exit_code = 2 if status == "paused" else 1
            if s == "collect":
                log.warning("collect %s -> 샘플/기존 데이터로 분석 계속", status)
                continue
            break
    return exit_code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
