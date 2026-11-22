"""수집: robots.txt 준수, 요청 간격, 상한, 최소 수집. 차단/실패는 로그만 남기고 우회하지 않는다."""
import json, re, time, urllib.request, urllib.robotparser
from html.parser import HTMLParser
from datetime import datetime
from .core import KST, today_kst


class _Titles(HTMLParser):
    """a/img의 title·alt·텍스트에서 이모티콘 제목 후보를 뽑는 느슨한 파서."""
    def __init__(self):
        super().__init__()
        self.found, self._href, self._buf = [], None, []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a":
            self._href, self._buf = a.get("href"), []
        if tag == "img" and a.get("alt"):
            self.found.append((a["alt"].strip(), self._href))

    def handle_data(self, data):
        if self._href is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            t = " ".join("".join(self._buf).split())
            if 2 <= len(t) <= 40:
                self.found.append((t, self._href))
            self._href = None


def parse_titles(body, limit):
    body = body.strip()
    out = []
    if body[:1] in "{[":
        try:
            def walk(o):
                if isinstance(o, dict):
                    for k, v in o.items():
                        if k in ("title", "name", "itemName") and isinstance(v, str):
                            out.append((v.strip(), None))
                        else:
                            walk(v)
                elif isinstance(o, list):
                    for v in o:
                        walk(v)
            walk(json.loads(body))
        except ValueError:
            pass
    else:
        p = _Titles()
        p.feed(body)
        out = p.found
    seen, res = set(), []
    for t, h in out:
        if t and t not in seen and len(t) >= 2:
            seen.add(t)
            res.append((t, h))
    return res[:limit]


def _get(url, ua, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept-Language": "ko"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(2_000_000).decode("utf-8", "replace")


def collect(cfg, db, log, budget):
    lim = cfg["limits"]
    ua, gap = lim["user_agent"], lim["request_interval_seconds"]
    total, notes = 0, []
    now, today = datetime.now(KST).isoformat(timespec="seconds"), today_kst()

    def flog(plat, url, status, detail=""):
        db.execute("INSERT INTO fetch_log(ts,platform,url,status,detail) VALUES(?,?,?,?,?)", (now, plat, url, status, detail[:300]))
        db.commit()

    for plat, pc in cfg["platforms"].items():
        if not pc.get("enabled"):
            continue
        rp = urllib.robotparser.RobotFileParser()
        try:
            budget.count_request()
            rp.parse(_get(pc["robots_url"], ua).splitlines())
            flog(plat, pc["robots_url"], "ok", "robots.txt 확인")
        except Exception as e:
            # robots.txt를 확인하지 못하면 보수적으로 해당 플랫폼 수집 생략
            flog(plat, pc["robots_url"], "skip", f"robots.txt 확인 실패 -> 수집 생략: {e}")
            notes.append(f"{plat}: robots.txt 확인 실패로 생략 ({type(e).__name__})")
            continue
        time.sleep(gap)
        for src in pc["sources"]:
            if not rp.can_fetch(ua, src["url"]):
                flog(plat, src["url"], "disallowed", "robots.txt가 금지 -> 수집 안 함")
                notes.append(f"{plat}/{src['kind']}: robots.txt 금지")
                continue
            for attempt in range(lim["max_retries"] + 1):
                try:
                    budget.count_request()
                    body = _get(src["url"], ua)
                    titles = parse_titles(body, lim["max_items_per_page"])
                    for i, (t, h) in enumerate(titles, 1):
                        db.execute("INSERT OR IGNORE INTO items(platform,kind,keyword,title,url,rank,collected_at,collected_date,is_sample) VALUES(?,?,?,?,?,?,?,?,0)",
                                   (plat, src["kind"], src.get("keyword"), t, h, i, now, today))
                    db.commit()
                    total += len(titles)
                    flog(plat, src["url"], "ok", f"{len(titles)}건")
                    break
                except Exception as e:
                    if type(e).__name__ == "BudgetExceeded":
                        raise
                    flog(plat, src["url"], "error", f"시도{attempt + 1}: {e}")
                    if attempt < lim["max_retries"]:
                        time.sleep(lim["retry_backoff_seconds"])
                    else:
                        notes.append(f"{plat}/{src['kind']}: 실패 ({type(e).__name__})")
            time.sleep(gap)
    return f"수집 {total}건. " + "; ".join(notes)
