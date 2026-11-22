"""캐릭터 시트 SVG 생성. 모든 도형에 고유 id, 캐릭터/표정은 그룹(<g id>)으로 묶어 레이어 분리 가능."""
import xml.etree.ElementTree as ET
from .core import ROOT
from .analyze import slug

DEFAULT_PALETTE = ["#9AD0F5", "#F5A3A3", "#A8E0B5", "#FFE3A3"]
EXPRESSIONS = ["happy", "sleepy", "surprised", "cheer"]
INK = "#3B3355"


def face(cid, x, y, kind, s=1.0):
    """눈·입 도형. x,y는 얼굴 중심."""
    p = f"{cid}-{kind}"
    e = 14 * s
    out = [f'<g id="{p}">']
    if kind == "sleepy":
        out += [f'<path id="{p}-eye-l" d="M{x-e-8*s:.0f} {y} q{8*s:.0f} {6*s:.0f} {16*s:.0f} 0" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>',
                f'<path id="{p}-eye-r" d="M{x+e-8*s:.0f} {y} q{8*s:.0f} {6*s:.0f} {16*s:.0f} 0" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>',
                f'<ellipse id="{p}-mouth" cx="{x}" cy="{y+16*s:.0f}" rx="{4*s:.0f}" ry="{3*s:.0f}" fill="{INK}"/>']
    elif kind == "surprised":
        out += [f'<circle id="{p}-eye-l" cx="{x-e:.0f}" cy="{y}" r="{6*s:.0f}" fill="{INK}"/>',
                f'<circle id="{p}-eye-r" cx="{x+e:.0f}" cy="{y}" r="{6*s:.0f}" fill="{INK}"/>',
                f'<ellipse id="{p}-mouth" cx="{x}" cy="{y+20*s:.0f}" rx="{6*s:.0f}" ry="{8*s:.0f}" fill="{INK}"/>']
    elif kind == "cheer":
        out += [f'<path id="{p}-eye-l" d="M{x-e-7*s:.0f} {y+3} l{7*s:.0f} {-7*s:.0f} l{7*s:.0f} {7*s:.0f}" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
                f'<path id="{p}-eye-r" d="M{x+e-7*s:.0f} {y+3} l{7*s:.0f} {-7*s:.0f} l{7*s:.0f} {7*s:.0f}" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
                f'<path id="{p}-mouth" d="M{x-12*s:.0f} {y+12*s:.0f} q{12*s:.0f} {16*s:.0f} {24*s:.0f} 0 z" fill="{INK}"/>']
    else:  # happy
        out += [f'<circle id="{p}-eye-l" cx="{x-e:.0f}" cy="{y}" r="{5*s:.0f}" fill="{INK}"/>',
                f'<circle id="{p}-eye-r" cx="{x+e:.0f}" cy="{y}" r="{5*s:.0f}" fill="{INK}"/>',
                f'<path id="{p}-mouth" d="M{x-10*s:.0f} {y+14*s:.0f} q{10*s:.0f} {12*s:.0f} {20*s:.0f} 0" stroke="{INK}" stroke-width="3" fill="none" stroke-linecap="round"/>']
    out.append(f'<ellipse id="{p}-blush-l" cx="{x-e-10*s:.0f}" cy="{y+12*s:.0f}" rx="{6*s:.0f}" ry="{4*s:.0f}" fill="#FF9AA8" opacity=".55"/>')
    out.append(f'<ellipse id="{p}-blush-r" cx="{x+e+10*s:.0f}" cy="{y+12*s:.0f}" rx="{6*s:.0f}" ry="{4*s:.0f}" fill="#FF9AA8" opacity=".55"/>')
    out.append("</g>")
    return "".join(out)


def body(cid, kind, x, y, r, color):
    st = f'fill="{color}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"'
    if kind == "circle":
        return f'<circle id="{cid}-body" cx="{x}" cy="{y}" r="{r}" {st}/>'
    if kind == "triangle":
        return f'<polygon id="{cid}-body" points="{x},{y-r} {x+r*1.05:.0f},{y+r*0.8:.0f} {x-r*1.05:.0f},{y+r*0.8:.0f}" {st}/>'
    return f'<rect id="{cid}-body" x="{x-r}" y="{y-r}" width="{2*r}" height="{2*r}" rx="14" {st}/>'


def build_svg(palette=None, topic="도형 캐릭터"):
    pal = (list(palette or []) + DEFAULT_PALETTE)[:3] if palette else DEFAULT_PALETTE[:3]
    chars = [("circle", "동글이", pal[0]), ("triangle", "세모", pal[1]), ("square", "네모", pal[2])]
    W, H = 1200, 760
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">',
             f'<title>캐릭터 시트 - {topic}</title>',
             f'<rect id="bg" width="{W}" height="{H}" fill="#FFFDF7"/>',
             f'<text id="title" x="40" y="52" font-size="30" font-family="sans-serif" fill="{INK}">캐릭터 시트 · {topic}</text>']
    for i, (kind, name, color) in enumerate(chars):
        cx = 200 + i * 400
        cid = kind
        parts.append(f'<g id="char-{cid}">')
        parts.append(f'<text id="{cid}-label" x="{cx}" y="100" text-anchor="middle" font-size="22" font-family="sans-serif" fill="{INK}">{name}</text>')
        parts.append(f'<ellipse id="{cid}-shadow" cx="{cx}" cy="400" rx="95" ry="14" fill="#000" opacity=".1"/>')
        parts.append(f'<g id="{cid}-main">' + body(cid, kind, cx, 280, 110, color) + face(cid, cx, 285 if kind != "triangle" else 320, "happy", 1.4) + '</g>')
        # 표정 4종 (작은 시트)
        for j, ex in enumerate(EXPRESSIONS):
            ex_x, ex_y = cx - 150 + j * 100, 540
            sub = f"{cid}{j}"
            parts.append(f'<g id="{cid}-expr-{ex}">' + body(sub, kind, ex_x, ex_y, 38, color) + face(sub, ex_x, ex_y + (8 if kind == "triangle" else 2), ex, .6) +
                         f'<text id="{cid}-expr-{ex}-label" x="{ex_x}" y="{ex_y+68}" text-anchor="middle" font-size="13" font-family="sans-serif" fill="{INK}">{ex}</text></g>')
        parts.append('</g>')
    parts.append('</svg>')
    return "\n".join(parts)


def validate_svg(svg):
    root = ET.fromstring(svg)
    ids = [e.get("id") for e in root.iter() if e.get("id")]
    dup = {i for i in ids if ids.count(i) > 1}
    shapes = [e for e in root.iter() if e.tag.split("}")[1] in ("circle", "ellipse", "rect", "polygon", "path")]
    missing = [e.tag for e in shapes if not e.get("id")]
    if dup or missing:
        raise ValueError(f"id 중복 {dup} / id 없는 도형 {len(missing)}개")
    return len(ids), len(shapes)


def design(cfg, res, outdir):
    svg = build_svg(res.get("palette"), res["topic"])
    n_ids, n_shapes = validate_svg(svg)
    p = outdir / "character_sheet.svg"
    p.write_text(svg, encoding="utf-8")
    return p, f"SVG 생성: id {n_ids}개, 도형 {n_shapes}개 모두 id 보유"
