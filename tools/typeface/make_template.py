"""Writes pixel-font-template.svg: one box per character, with guides."""
import sys
from layout import *

def cell_origin(i):
    return MARGIN + (i % COLS) * CELL_W, MARGIN + HEADER + (i // COLS) * CELL_H

def main(out):
    rows = (len(CHARS) + COLS - 1) // COLS
    W = MARGIN * 2 + COLS * CELL_W
    H = MARGIN * 2 + 60 + rows * CELL_H
    g = []   # guides
    l = []   # labels
    # pixel grid + guides per cell
    for i, ch in enumerate(CHARS):
        x0, y0 = cell_origin(i)
        # faint pixel grid
        for k in range(1, 12):
            g.append(f'<line x1="{x0 + k*U}" y1="{y0}" x2="{x0 + k*U}" y2="{y0 + CELL_H}" stroke="#e6e6e6" stroke-width="0.5"/>')
        for k in range(1, 14):
            g.append(f'<line x1="{x0}" y1="{y0 + k*U}" x2="{x0 + CELL_W}" y2="{y0 + k*U}" stroke="#e6e6e6" stroke-width="0.5"/>')
        # drawing width limits
        for px in (LEFT, RIGHT):
            g.append(f'<line x1="{x0 + px*U}" y1="{y0}" x2="{x0 + px*U}" y2="{y0 + CELL_H}" stroke="#9cc4ff" stroke-width="1" stroke-dasharray="4 3"/>')
        # cap line and baseline
        g.append(f'<line x1="{x0}" y1="{y0 + CAP_TOP*U}" x2="{x0 + CELL_W}" y2="{y0 + CAP_TOP*U}" stroke="#2d7bf7" stroke-width="1"/>')
        g.append(f'<line x1="{x0}" y1="{y0 + BASELINE*U}" x2="{x0 + CELL_W}" y2="{y0 + BASELINE*U}" stroke="#ff3b6b" stroke-width="1.5"/>')
        # cell border
        g.append(f'<rect x="{x0}" y="{y0}" width="{CELL_W}" height="{CELL_H}" fill="none" stroke="#999" stroke-width="1"/>')
        label = ch if ch else "spare"
        label = label.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
        l.append(f'<text x="{x0 + 6}" y="{y0 + CELL_H - 6}" font-family="Arial, sans-serif" font-size="14" fill="#8a8a8a">{label}</text>')
    title = ('<text x="%d" y="%d" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#111">Pixel font template</text>' % (MARGIN, MARGIN + 18))
    help_ = [
        "Draw each character in black INSIDE its box, on the layer called \"art\". Red line = baseline (letters sit on it). Blue line = top of capitals.",
        "Dashed blue lines = widest a letter may be (8 pixels). One grid square = one pixel of your style. Tails (comma, Q, J) may go below the red line.",
        "Accent marks (last row) go in the zone ABOVE the blue line, where they would sit over a capital letter. Delete or hide the layers \"guides\" and \"labels\" before saving.",
    ]
    for k, t in enumerate(help_):
        title += f'<text x="{MARGIN}" y="{MARGIN + 38 + k*16}" font-family="Arial, sans-serif" font-size="12" fill="#555">{t}</text>'
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n'
           f'<g id="guides">\n<rect width="{W}" height="{H}" fill="#ffffff"/>\n' + "\n".join(g) + '\n</g>\n'
           f'<g id="labels">\n{title}\n' + "\n".join(l) + '\n</g>\n'
           f'<g id="art"></g>\n</svg>\n')
    open(out, "w", encoding="utf-8").write(svg)
    print("wrote", out, W, "x", H)

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "pixel-font-template.svg")
