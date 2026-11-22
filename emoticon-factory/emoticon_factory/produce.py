"""제작: 멈티 32컷, 움티 3종(GIF/APNG), 플랫폼 규격 PNG, 도형별 레이어 PSD.
렌더링은 Chromium(node+playwright), 이미지 합성은 Pillow. spec은 specs/platforms.json."""
import copy, json, math, struct, subprocess, tempfile, xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from .core import ROOT
from .design import body, face, char_colors, INK

FONT = "WenQuanYi Zen Hei, Noto Sans CJK KR, sans-serif"
DEFAULT_PARAMS = {"char_r": 100, "text_px": 40, "face_k": 1.0, "extra_phrases": []}
# (캐릭터, 표정, 문구, 포즈(각도, 크기, dx, dy)) - 앞쪽 일부 문구는 트렌드 문구군과 겹친다
BASE = [("circle", "happy", "안녕!"), ("triangle", "love", "사랑해"), ("square", "cheer", "화이팅!"), ("circle", "happy", "굿모닝"),
        ("triangle", "happy", "고마워"), ("square", "sad", "미안해"), ("circle", "surprised", "헉!"), ("triangle", "sleepy", "졸려…"),
        ("square", "cheer", "퇴근!"), ("circle", "happy", "OK"), ("triangle", "cheer", "ㅋㅋ"), ("square", "love", "최고"),
        ("circle", "cheer", "힘내!"), ("triangle", "sad", "배고파"), ("square", "happy", "좋아"), ("circle", "sad", "슬퍼"),
        ("triangle", "surprised", "깜짝"), ("square", "sleepy", "zzz"), ("circle", "love", "두근"), ("triangle", "happy", "하이"),
        ("square", "surprised", "엥?"), ("circle", "sleepy", "피곤"), ("triangle", "cheer", "가자!"), ("square", "happy", "넵"),
        ("circle", "cheer", "아자!"), ("triangle", "love", "고마워요"), ("square", "cheer", "수고!"), ("circle", "happy", "잘자"),
        ("triangle", "sad", "힝"), ("square", "love", "사랑"), ("circle", "surprised", "와!"), ("triangle", "cheer", "굿!")]
POSES = [(0, 1, 0, 0), (-8, 1, 0, 0), (8, 1.04, 0, 0), (0, 1.06, 0, -4)]
PHRASE_TEXT = {"사랑해": "사랑해", "화이팅": "화이팅!", "감사": "고마워", "퇴근": "퇴근!", "인사": "안녕!", "답장": "ㅇㅋ",
               "피곤": "피곤", "설레": "두근", "응원": "힘내!", "리액션": "헉!"}


def cut_svg(idx, kind, expr, phrase, colors, params, size=360, pose=(0, 1, 0, 0), tag="c"):
    r, k = params["char_r"], params["face_k"]
    a, sc, dx, dy = pose
    cid = f"{tag}{idx:02d}"
    cx, cy = size / 2 + dx, size * 0.44 + dy
    fy = cy + (r * 0.36 if kind == "triangle" else r * 0.04)
    s = 1.4 * r / 110 * k
    t = params["text_px"] * size / 360
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<g id="{cid}-char" transform="rotate({a} {cx:.0f} {cy:.0f}) translate({cx:.0f} {cy:.0f}) scale({sc}) translate({-cx:.0f} {-cy:.0f})">'
            + body(cid, kind, round(cx), round(cy), r * size / 360, colors[kind]) + face(cid, round(cx), round(fy), expr, s * size / 360) + '</g>'
            f'<text id="{cid}-text" x="{size/2}" y="{size*0.93:.0f}" text-anchor="middle" font-size="{t:.0f}" font-weight="700" font-family="{FONT}" '
            f'fill="{INK}" stroke="#fff" stroke-width="{t*0.2:.0f}" paint-order="stroke" stroke-linejoin="round">{phrase}</text></svg>')


def run_render(items):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(items, f)
    r = subprocess.run(["node", str(ROOT / "emoticon_factory" / "render.js"), f.name], capture_output=True, text=True, timeout=300,
                       cwd=str(ROOT))
    Path(f.name).unlink(missing_ok=True)
    if r.returncode:
        raise RuntimeError("렌더 실패(node/playwright 필요): " + r.stderr[-400:])


def cut_list(params, trend_phrases):
    cuts = [list(c) for c in BASE]
    for i, ph in enumerate(params.get("extra_phrases", [])):   # 리뷰 단계가 누락 트렌드 문구를 뒤쪽 컷에 주입
        cuts[-1 - i][2] = ph
    return cuts


def save_gif(frames, path, ms):
    ps = []
    for fr in frames:
        al = fr.getchannel("A")
        p = fr.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=255)
        p.paste(255, al.point(lambda v: 255 if v < 128 else 0))
        ps.append(p)
    ps[0].save(path, save_all=True, append_images=ps[1:], duration=ms, loop=0, disposal=2, transparency=255, optimize=False)


def anim_frames(kind, n=12):
    out = []
    for i in range(n):
        ph = i / n * 2 * math.pi
        out.append({"bounce": (0, 1 + 0.04 * math.cos(2 * ph), 0, -abs(math.sin(ph)) * 28),
                    "wiggle": (math.sin(ph) * 10, 1, 0, 0),
                    "pop": (0, 0.8 + 0.3 * abs(math.sin(ph / 2)), 0, 0)}[kind])
    return out


def produce(cfg, res, outdir, params, log):
    spec = json.load(open(ROOT / "specs" / "platforms.json", encoding="utf-8"))
    colors = char_colors(res.get("palette"))
    trend = [PHRASE_TEXT.get(p) for p, _ in res.get("phrases", []) if PHRASE_TEXT.get(p)]
    cuts = cut_list(params, trend)
    work = outdir / "_work"
    work.mkdir(exist_ok=True)
    items = []
    for i, (k, e, ph) in enumerate(cuts, 1):
        items.append({"svg": cut_svg(i, k, e, ph, colors, params, 360, POSES[i % 4]), "w": 360, "h": 360, "out": str(work / f"cut{i:02d}_360.png")})
        items.append({"svg": cut_svg(i, k, e, ph, colors, params, 740, POSES[i % 4]), "w": 740, "h": 740, "out": str(work / f"cut{i:02d}_740.png")})
    anims = [("bounce", "circle", "cheer", "아자!"), ("wiggle", "triangle", "love", "사랑해"), ("pop", "square", "surprised", "짠!")]
    for name, k, e, ph in anims:
        for fi, pose in enumerate(anim_frames(name)):
            items.append({"svg": cut_svg(90, k, e, ph, colors, params, 360, pose, tag="a"), "w": 360, "h": 360, "out": str(work / f"anim_{name}_{fi:02d}.png")})
    sheet = (outdir / "character_sheet.svg").read_text(encoding="utf-8")
    layers = layer_svgs(sheet)
    for n, (lid, svg) in enumerate(layers):
        items.append({"svg": svg, "w": 1200, "h": 760, "out": str(work / f"layer_{n:03d}.png")})
    items.append({"svg": sheet, "w": 1200, "h": 760, "out": str(work / "sheet_full.png")})
    run_render(items)
    # --- 플랫폼별 정리
    ks = outdir / "kakao_static"; ka = outdir / "kakao_animated"; og = outdir / "ogq"; ps = outdir / "psd"
    for d in (ks, ka, og, ps):
        d.mkdir(exist_ok=True)
    for i in range(1, 33):
        Image.open(work / f"cut{i:02d}_360.png").save(ks / f"{i:02d}.png", optimize=True)
    for i in range(1, 22):  # 움티 세트의 PNG 21종 (정지 컷 재사용)
        Image.open(work / f"cut{i:02d}_360.png").save(ka / f"{i:02d}.png", optimize=True)
    for gi, (name, *_r) in enumerate(anims, 1):
        frames = [Image.open(work / f"anim_{name}_{fi:02d}.png").convert("RGBA") for fi in range(12)]
        save_gif(frames, ka / f"gif{gi}_{name}.gif", 80)
        frames[0].save(og / f"anim{gi}_{name}.png", save_all=True, append_images=frames[1:], duration=80, loop=0, format="PNG")  # APNG
    sw, sh = spec["ogq_sticker"]["width"], spec["ogq_sticker"]["height"]
    for i in range(1, spec["ogq_sticker"]["assumed_count"] + 1):
        im = Image.open(work / f"cut{i:02d}_740.png").convert("RGBA")
        canvas = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
        im = im.resize((sh, sh))
        canvas.paste(im, ((sw - sh) // 2, 0), im)
        canvas.save(og / f"{i:02d}.png", optimize=True)
    write_psd(work, layers, ps / "character_sheet_layers.psd", 1200, 760)
    return {"cuts": len(cuts), "layers": len(layers), "anims": [a[0] for a in anims]}


# ---------------- PSD ----------------
def layer_svgs(sheet):
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    root = ET.fromstring(sheet)
    ns = "{http://www.w3.org/2000/svg}"
    leaves = [e for e in root.iter() if e.get("id") and e.tag in (ns + t for t in ("circle", "ellipse", "rect", "polygon", "path", "text"))]
    out = []
    for e in leaves:
        r = ET.Element(root.tag, {k: v for k, v in root.attrib.items()})
        r.append(copy.deepcopy(e))
        out.append((e.get("id"), ET.tostring(r, encoding="unicode")))
    return out


def write_psd(work, layers, path, W, H):
    recs, datas = [], []
    for n, (lid, _) in enumerate(layers):
        im = Image.open(work / f"layer_{n:03d}.png").convert("RGBA")
        bb = im.getchannel("A").getbbox() or (0, 0, 1, 1)
        im = im.crop(bb)
        w, h = im.size
        chans = [im.getchannel(c).tobytes() for c in "ARGB"]
        name = lid.encode("ascii", "replace")[:200]
        pas = bytes([len(name)]) + name
        pas += b"\0" * (-len(pas) % 4)
        extra = struct.pack(">I", 0) + struct.pack(">I", 0) + pas
        rec = struct.pack(">iiiih", bb[1], bb[0], bb[3], bb[2], 4)
        for cid, c in zip((-1, 0, 1, 2), chans):
            rec += struct.pack(">hI", cid, 2 + len(c))
        rec += b"8BIM" + b"norm" + bytes([255, 0, 0, 0]) + struct.pack(">I", len(extra)) + extra
        recs.append(rec)
        datas.append(b"".join(struct.pack(">h", 0) + c for c in chans))
    info = struct.pack(">h", len(layers)) + b"".join(recs) + b"".join(datas)
    if len(info) % 2:
        info += b"\0"
    layer_section = struct.pack(">I", len(info)) + info + struct.pack(">I", 0)   # + 전역 마스크 0
    full = Image.open(work / "sheet_full.png").convert("RGB")
    comp = struct.pack(">h", 0) + b"".join(full.getchannel(c).tobytes() for c in "RGB")
    with open(path, "wb") as f:
        f.write(b"8BPS" + struct.pack(">H6xHIIHH", 1, 3, H, W, 8, 3))
        f.write(struct.pack(">I", 0) + struct.pack(">I", 0))
        f.write(struct.pack(">I", len(layer_section)) + layer_section)
        f.write(comp)
