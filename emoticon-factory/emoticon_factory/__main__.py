import sys, json
from .core import load_config, setup_logging, connect, Budget, run_step, today_kst, ROOT
from .collect import collect
from .analyze import analyze, write_report, slug
from .design import design


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

    steps = {"collect": do_collect, "analyze": do_analyze, "design": do_design}
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
