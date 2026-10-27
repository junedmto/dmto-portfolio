"""Turns a filled-in pixel-font template (SVG) into a real font.

    python3 build_font.py my-letters.svg out-folder "Font Name"

Writes <name>.ttf, <name>.woff2 and a preview PNG into out-folder.

How it reads the SVG: everything outside the layers called "guides" and
"labels" counts as artwork. Each shape is assigned to the template box its
centre falls in, so the shapes can be loose rectangles, paths or compound
paths. Black shapes add to a letter; white shapes cut away from it.
"""
import os
import sys
import math
from svgelements import SVG, Path, Shape, Group, Move, Line, QuadraticBezier, CubicBezier, Arc, Close, Color
import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from layout import *

SCALE = 100.0 / U            # template units -> font units (1 pixel = 100 units)
SNAP = 0.25                  # snap points to quarter pixels, to clean up hand-drawn edges
ADVANCE_GAP = 100            # one pixel of space after each letter
SPACE_WIDTH = 400


def walk(node, skip=False):
    for child in node:
        if isinstance(child, Group):
            gid = (child.values or {}).get("id", "") if hasattr(child, "values") else ""
            yield from walk(child, skip or gid in ("guides", "labels"))
        elif isinstance(child, Shape) and not skip:
            yield child


def to_pathops(shape):
    p = Path(shape)
    p.reify()
    out = pathops.Path()
    last = None
    for seg in p:
        if isinstance(seg, Move):
            out.moveTo(seg.end.x, seg.end.y)
        elif isinstance(seg, Close):
            out.close()
        elif isinstance(seg, Line):
            out.lineTo(seg.end.x, seg.end.y)
        elif isinstance(seg, QuadraticBezier):
            out.quadTo(seg.control.x, seg.control.y, seg.end.x, seg.end.y)
        elif isinstance(seg, CubicBezier):
            out.cubicTo(seg.control1.x, seg.control1.y, seg.control2.x, seg.control2.y, seg.end.x, seg.end.y)
        elif isinstance(seg, Arc):
            for c in seg.as_cubic_curves():
                out.cubicTo(c.control1.x, c.control1.y, c.control2.x, c.control2.y, c.end.x, c.end.y)
    out.close()
    rule = (shape.values or {}).get("fill-rule", "nonzero") if hasattr(shape, "values") else "nonzero"
    out.fillType = pathops.FillType.EVEN_ODD if rule == "evenodd" else pathops.FillType.WINDING
    return out


def colour_kind(shape):
    f = shape.fill
    if f is None or f.value is None:
        return "none"
    c = Color(f)
    if c.alpha == 0:
        return "none"
    lum = 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue
    return "white" if lum > 200 else "black"


def cell_of(cx, cy):
    col = int((cx - MARGIN) // CELL_W)
    row = int((cy - (MARGIN + HEADER)) // CELL_H)
    if col < 0 or col >= COLS or row < 0:
        return None
    i = row * COLS + col
    return i if i < len(CHARS) else None


def collect(svg_path):
    svg = SVG.parse(svg_path, reify=True)
    cells = {}
    ignored = 0
    for shape in walk(svg):
        kind = colour_kind(shape)
        if kind == "none":
            ignored += 1
            continue
        try:
            bb = shape.bbox()
        except Exception:
            continue
        if bb is None:
            continue
        i = cell_of((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2)
        if i is None:
            continue
        cells.setdefault(i, []).append((kind, to_pathops(shape)))
    if ignored:
        print(f"note: {ignored} shapes with no fill (outline-only) were skipped. Use Object > Path > Outline Stroke first.")
    return cells


def combine(parts):
    result = None
    for kind, p in parts:
        p2 = pathops.Path(p)
        p2.simplify(fix_winding=True)
        if result is None:
            if kind == "black":
                result = p2
            continue
        result = pathops.op(result, p2, pathops.PathOp.UNION if kind == "black" else pathops.PathOp.DIFFERENCE, fix_winding=True)
    return result


def snap(v):
    return round(v / (U * SNAP)) * (U * SNAP)


def to_font_space(path, i, shift_x=None):
    """Cell coordinates -> font units; returns (path, xmin, xmax) with xmin shifted to 0."""
    x0 = MARGIN + (i % COLS) * CELL_W
    y0 = MARGIN + HEADER + (i // COLS) * CELL_H
    xs = []
    out = pathops.Path()
    pen = out.getPen()
    segs = list(path.segments)
    def tx(pt, dx):
        return (snap(pt[0] - x0) - dx) * SCALE, (BASELINE * U - snap(pt[1] - y0)) * SCALE
    # find xmin first
    allx = [snap(pt[0] - x0) for _, pts in segs for pt in pts]
    xmin = min(allx) if allx else 0
    xmax = max(allx) if allx else 0
    dx = xmin if shift_x is None else shift_x
    for verb, pts in segs:
        tp = [tx(pt, dx) for pt in pts]
        if verb == "moveTo":
            pen.moveTo(tp[0])
        elif verb == "lineTo":
            pen.lineTo(tp[0])
        elif verb == "qCurveTo":
            pen.qCurveTo(*tp)
        elif verb == "curveTo":
            pen.curveTo(*tp)
        elif verb == "closePath":
            pen.closePath()
        elif verb == "endPath":
            pen.endPath()
    return out, xmin, xmax


def draw_glyph(path):
    gp = TTGlyphPen(None)
    cu = Cu2QuPen(gp, 1.0, reverse_direction=True)
    path.draw(cu)
    return gp.glyph()


def translated(path, dx, dy=0):
    out = pathops.Path()
    pen = out.getPen()
    for verb, pts in path.segments:
        tp = [(x + dx, y + dy) for x, y in pts]
        if verb in ("closePath", "endPath"):
            getattr(pen, verb)()
        else:
            getattr(pen, verb)(*tp)
    return out


def bounds(path):
    b = path.bounds
    return b  # (xmin, ymin, xmax, ymax)


def main(svg_file, out_dir, family):
    os.makedirs(out_dir, exist_ok=True)
    cells = collect(svg_file)
    glyphs = {}    # name -> pathops.Path in font units (xmin at 0)
    advances = {}
    cmap = {}
    marks = {}

    def glyph_name(ch):
        return "uni%04X" % ord(ch)

    drawn, missing = [], []
    for i, ch in enumerate(CHARS):
        if ch is None:
            continue
        if i not in cells:
            missing.append(ch)
            continue
        merged = combine(cells[i])
        if merged is None or not list(merged.segments):
            missing.append(ch)
            continue
        path, xmin, xmax = to_font_space(merged, i)
        name = glyph_name(ch)
        width = (xmax - xmin) * SCALE
        glyphs[name] = path
        advances[name] = int(round(width + ADVANCE_GAP))
        cmap[ord(ch)] = name
        drawn.append(ch)
        if ch in ACCENT_MARKS.values():
            # keep the mark's own position (relative to its box) for composing
            p_free, mn, mx = to_font_space(merged, i, shift_x=0)
            marks[ch] = (p_free, (mn - LEFT * U) * SCALE, (mx - LEFT * U) * SCALE)
    # lowercase letters use the same drawings
    for c in range(ord("a"), ord("z") + 1):
        up = chr(c).upper()
        if ord(up) in cmap:
            cmap[c] = cmap[ord(up)]
    # composed accented letters
    comps = {"Á": ("A", "´"), "É": ("E", "´"), "Í": ("I", "´"), "Ó": ("O", "´"), "Ú": ("U", "´"),
             "À": ("A", "`"), "È": ("E", "`"), "Ì": ("I", "`"), "Ò": ("O", "`"), "Ù": ("U", "`"),
             "Ä": ("A", "¨"), "Ë": ("E", "¨"), "Ï": ("I", "¨"), "Ö": ("O", "¨"), "Ü": ("U", "¨"),
             "Ñ": ("N", "~"),
             "Â": ("A", "^"), "Ê": ("E", "^"), "Î": ("I", "^"), "Ô": ("O", "^"), "Û": ("U", "^")}
    for ch, (base, mark) in comps.items():
        bn = glyph_name(base)
        if bn not in glyphs or mark not in marks:
            continue
        mpath, mmin, mmax = marks[mark]
        bb = bounds(glyphs[bn])
        base_centre = (bb[0] + bb[2]) / 2
        # marks were stored relative to the left drawing limit; centre over the letter
        mb = bounds(mpath)
        mark_centre = (mb[0] + mb[2]) / 2
        # Marks drawn inside the capital-letter zone are lifted so they float one
        # pixel above the capitals; marks already drawn above that stay as drawn.
        lift = 0 if mb[1] >= 700 else 800 - mb[1]
        placed = translated(mpath, base_centre - mark_centre, lift)
        merged = pathops.op(glyphs[bn], placed, pathops.PathOp.UNION, fix_winding=True)
        name = glyph_name(ch)
        glyphs[name] = merged
        advances[name] = advances[bn]
        cmap[ord(ch)] = name
        cmap[ord(ch.lower())] = name

    # .notdef: an empty box
    nd = pathops.Path()
    pen = nd.getPen()
    for (x1, y1, x2, y2), rev in (((50, 0, 450, 700), False), ((150, 100, 350, 600), True)):
        pts = [(x1, y1), (x1, y2), (x2, y2), (x2, y1)] if not rev else [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
        pen.moveTo(pts[0])
        for p in pts[1:]:
            pen.lineTo(p)
        pen.closePath()
    glyphs[".notdef"] = nd
    advances[".notdef"] = 500
    glyphs["space"] = pathops.Path()
    advances["space"] = SPACE_WIDTH
    cmap[32] = "space"

    order = [".notdef", "space"] + sorted(n for n in glyphs if n not in (".notdef", "space"))
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf({n: draw_glyph(glyphs[n]) for n in order})
    fb.setupHorizontalMetrics({n: (advances[n], 0) for n in order})
    fb.setupHorizontalHeader(ascent=1000, descent=-300)
    fb.setupNameTable({"familyName": family, "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=1000, sTypoDescender=-300, usWinAscent=1100, usWinDescent=300, sCapHeight=700, sxHeight=700)
    fb.setupPost()
    safe = family.replace(" ", "")
    ttf = os.path.join(out_dir, safe + ".ttf")
    fb.save(ttf)
    from fontTools.ttLib import TTFont
    f = TTFont(ttf)
    f.flavor = "woff2"
    f.save(os.path.join(out_dir, safe + ".woff2"))
    print(f"drawn: {len(drawn)} characters")
    if missing:
        print("not drawn:", " ".join(missing))
    print("wrote", ttf)
    return ttf


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "DMTO Pixel")
