"""설정·로그·DB·예산(상한)·단계 실행기(재시도/재개)."""
import logging, sqlite3, time, tomllib, traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))


def today_kst():
    return datetime.now(KST).strftime("%Y-%m-%d")


def load_config(path=None):
    with open(path or ROOT / "config.toml", "rb") as f:
        return tomllib.load(f)


def setup_logging(cfg):
    d = ROOT / cfg["general"]["log_dir"]
    d.mkdir(parents=True, exist_ok=True)
    log = logging.getLogger("factory")
    if not log.handlers:
        log.setLevel(logging.INFO)
        fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
        for h in (logging.FileHandler(d / f"{today_kst()}.log", encoding="utf-8"), logging.StreamHandler()):
            h.setFormatter(fmt)
            log.addHandler(h)
    return log


SCHEMA = """
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY, platform TEXT, kind TEXT, keyword TEXT, title TEXT, url TEXT,
  rank INTEGER, collected_at TEXT, collected_date TEXT, is_sample INTEGER DEFAULT 0,
  UNIQUE(platform, kind, title, collected_date));
CREATE TABLE IF NOT EXISTS fetch_log(
  id INTEGER PRIMARY KEY, ts TEXT, platform TEXT, url TEXT, status TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS step_runs(
  run_date TEXT, step TEXT, status TEXT, started TEXT, finished TEXT, detail TEXT,
  PRIMARY KEY(run_date, step));
CREATE TABLE IF NOT EXISTS topics(
  run_date TEXT, theme TEXT, score REAL, chosen INTEGER, detail TEXT);
CREATE TABLE IF NOT EXISTS reviews_feedback(
  id INTEGER PRIMARY KEY, run_date TEXT, topic TEXT, platform TEXT,
  result TEXT CHECK(result IN ('approved','rejected')), reason TEXT, entered_at TEXT);
"""


def connect(cfg):
    p = ROOT / cfg["general"]["db_path"]
    p.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(p)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    # collected_date 컬럼은 UNIQUE 용 (구버전 호환 없이 신규 DB 전제)
    return db


class BudgetExceeded(Exception):
    pass


class Budget:
    """실행 시간/요청 수 상한. 초과 시 BudgetExceeded -> 단계 'paused'로 기록, 다음 실행에서 이어감."""
    def __init__(self, cfg):
        self.t0 = time.time()
        self.max_s = cfg["limits"]["max_run_seconds"]
        self.max_req = cfg["limits"]["max_http_requests"]
        self.req = 0

    def check(self):
        if time.time() - self.t0 > self.max_s:
            raise BudgetExceeded(f"시간 상한 {self.max_s}s 초과")

    def count_request(self):
        self.check()
        if self.req >= self.max_req:
            raise BudgetExceeded(f"요청 상한 {self.max_req} 도달")
        self.req += 1


def run_step(db, cfg, log, name, fn, run_date=None, force=False):
    """단계 실행: 완료된 단계는 건너뜀(재개), 실패 시 재시도, 상한 초과는 paused."""
    run_date = run_date or today_kst()
    row = db.execute("SELECT status FROM step_runs WHERE run_date=? AND step=?", (run_date, name)).fetchone()
    if row and row["status"] == "done" and not force:
        log.info("[%s] 오늘 이미 완료 - 건너뜀", name)
        return "skipped"
    retries = cfg["limits"]["max_retries"]
    for attempt in range(retries + 1):
        started = datetime.now(KST).isoformat(timespec="seconds")
        try:
            detail = fn() or ""
            status = "done"
            break
        except BudgetExceeded as e:
            status, detail = "paused", f"상한 도달: {e} (다음 실행에서 이어서)"
            log.warning("[%s] %s", name, detail)
            break
        except Exception as e:  # noqa
            status, detail = "failed", f"{type(e).__name__}: {e}"
            log.error("[%s] 시도 %d/%d 실패: %s\n%s", name, attempt + 1, retries + 1, detail, traceback.format_exc())
            if attempt < retries:
                time.sleep(cfg["limits"]["retry_backoff_seconds"])
    db.execute("INSERT OR REPLACE INTO step_runs VALUES(?,?,?,?,?,?)",
               (run_date, name, status, started, datetime.now(KST).isoformat(timespec="seconds"), str(detail)[:2000]))
    db.commit()
    log.info("[%s] %s %s", name, status, detail)
    return status
