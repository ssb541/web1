"""자체 검수: 평가 기준표 4항목(0~100). 이미지를 사람이 보듯 평가하지 못하므로 측정 가능한 '대리 지표'를 쓴다.
미달 시 params를 조정해 최대 N회 재제작(자동 수정)."""
import json
from pathlib import Path
from PIL import Image, ImageSequence
from .core import ROOT
from .design import char_colors, INK
from .produce import PHRASE_TEXT, BASE


def _hex(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def spec_check(outdir):
    spec = json.load(open(ROOT / "specs" / "platforms.json", encoding="utf-8"))
    ok, issues = [], []

    def chk(cond, code):
        ok.append(bool(cond))
        if not cond:
            issues.append(code)
    ks, ka, og = spec["kakao_static"], spec["kakao_animated"], spec["ogq_sticker"]
    files = sorted((outdir / "kakao_static").glob("*.png"))
    chk(len(files) == ks["count"], f"kakao_static 개수 {len(files)}!={ks['count']}")
    for f in files:
        im = Image.open(f)
        chk(im.size == (ks["width"], ks["height"]), f"{f.name} 크기 {im.size}")
        chk(im.mode == "RGBA" and im.getpixel((0, 0))[3] == 0, f"{f.name} 투명 배경 아님")
        chk(f.stat().st_size <= ks["max_kb"] * 1024, f"size_big:{f.name} {f.stat().st_size // 1024}KB")
    pngs, gifs = list((outdir / "kakao_animated").glob("*.png")), list((outdir / "kakao_animated").glob("*.gif"))
    chk(len(pngs) == ka["count_png"] and len(gifs) == ka["count_gif"], "kakao_animated 구성(21 PNG + 3 GIF)")
    for g in gifs:
        im = Image.open(g)
        chk(im.n_frames <= ka["max_gif_frames"], f"{g.name} 프레임 {im.n_frames}")
        chk(im.size == (ka["width"], ka["height"]), f"{g.name} 크기")
        chk(g.stat().st_size <= ka["max_kb"] * 1024, f"size_big:{g.name}")
    og_png = sorted(p for p in (outdir / "ogq").glob("*.png") if p.name[0].isdigit())
    chk(len(og_png) == og["assumed_count"], "ogq 개수(가정값)")
    for p in og_png[:3]:
        chk(Image.open(p).size == (og["width"], og["height"]), f"{p.name} 크기(가정값)")
    for p in (outdir / "ogq").glob("anim*.png"):
        n = Image.open(p).n_frames
        chk(og["assumed_apng_frames"][0] <= n <= og["assumed_apng_frames"][1], f"{p.name} APNG 프레임 {n}")
    chk((outdir / "psd" / "character_sheet_layers.psd").stat().st_size > 1000, "PSD 존재")
    return round(100 * sum(ok) / len(ok)), issues


def readability(outdir):
    issues, ok = [], []
    for f in sorted((outdir / "kakao_static").glob("*.png")):
        im = Image.open(f).convert("RGBA")
        a = im.getchannel("A")
        bb = a.getbbox()
        cov = sum(1 for v in a.resize((96, 96)).getdata() if v > 128) / 96 ** 2
        ok.append(0.22 <= cov <= 0.7)
        if cov < 0.22: issues.append("cov_low")
        if cov > 0.7: issues.append("cov_high")
        m = min(bb[0], bb[1], 360 - bb[2], 360 - bb[3])
        ok.append(m >= 8)
        if m < 8: issues.append("margin")
        # 96px 썸네일에서 이목구비(잉크색) 픽셀이 보이는가
        small = im.resize((96, 96), Image.LANCZOS)
        ink = _hex(INK)
        n = sum(1 for r, g, b, al in small.getdata() if al > 200 and max(abs(r - ink[0]), abs(g - ink[1]), abs(b - ink[2])) < 60)
        ok.append(n >= 110)
        if n < 110: issues.append("face_small")
    return round(100 * sum(ok) / len(ok)), sorted(set(issues))


def consistency(outdir, palette):
    cols = list(char_colors(palette).values()) + [INK, "#FF9AA8", "#FFFFFF", "#7CC4F0", "#FF5C7A"]
    allowed = [_hex(c) for c in cols]
    tot = good = 0
    for f in sorted((outdir / "kakao_static").glob("*.png")):
        for r, g, b, a in Image.open(f).convert("RGBA").getdata():
            if a == 255:
                tot += 1
                good += min(max(abs(r - c[0]), abs(g - c[1]), abs(b - c[2])) for c in allowed) < 45
    s = round(100 * good / max(tot, 1))
    return s, ([] if s >= 85 else ["off_palette"])


def trend_fit(res, params):
    want = [PHRASE_TEXT[p] for p, _ in res.get("phrases", []) if p in PHRASE_TEXT]
    have = {c[2] for c in BASE[:len(BASE)]} | set(params.get("extra_phrases", []))
    missing = [w for w in want if w not in have]
    return round(100 * (1 - len(missing) / max(len(want), 1))), ([f"phrase_missing:{m}" for m in missing])


def score(outdir, res, params):
    spec_s, spec_i = spec_check(outdir)
    read_s, read_i = readability(outdir)
    con_s, con_i = consistency(outdir, res.get("palette"))
    tr_s, tr_i = trend_fit(res, params)
    return {"규격 충족": (spec_s, spec_i), "가독성": (read_s, read_i), "일관성": (con_s, con_i), "트렌드 적합": (tr_s, tr_i)}


def adjust(params, sc):
    p = json.loads(json.dumps(params))
    notes = []
    for code in sc["가독성"][1]:
        if code == "cov_low": p["char_r"] = min(p["char_r"] + 10, 125); notes.append("캐릭터 크기 +10")
        if code in ("cov_high", "margin"): p["char_r"] = max(p["char_r"] - 8, 70); notes.append("캐릭터 크기 -8")
        if code == "face_small": p["face_k"] = round(p["face_k"] + 0.3, 2); notes.append("표정 크기 +0.3")
    for code in sc["트렌드 적합"][1]:
        p["extra_phrases"] = sorted(set(p["extra_phrases"]) | {code.split(":", 1)[1]}); notes.append(f"문구 추가 {code.split(':', 1)[1]}")
    return p, notes
