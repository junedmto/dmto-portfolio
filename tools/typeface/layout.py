"""Shared description of the pixel-font template (used by the template maker
and the font builder, so they can never disagree)."""

U = 20            # one pixel of your pixel style, in template units
CELL_W = 12 * U   # each character gets a box 12 pixels wide ...
CELL_H = 14 * U   # ... and 14 pixels tall
COLS = 10
MARGIN = 40
HEADER = 90  # space above the first row for the instructions

# Vertical layout inside a cell, counted in pixels from the top of the cell:
ACCENT_TOP = 0    # 0-3  : room for accents above capital letters
CAP_TOP = 3       # 3-10 : capital letters live here (7 pixels tall)
BASELINE = 10     # the line letters sit on
DESC_BOTTOM = 13  # 10-13: room for tails (comma, Q, J, semicolon, brackets)
# Horizontal: letters can be up to 8 pixels wide, between pixel 2 and pixel 10.
LEFT = 2
RIGHT = 10

CHARS = (
    list("ABCDEFGHIJ")
    + list("KLMNOPQRST")
    + list("UVWXYZ0123")
    + list("456789.,:;")
    + list("!?-_+=/&@#")
    + list("%*'\"()[]<>")
    + ["´", "`", "¨", "~", "^", "$", "€", "·", None, None]
)
# The last row: five accent marks (acute, grave, diaeresis, tilde, circumflex),
# then $ € and a middle dot, then two spare boxes.

ACCENT_MARKS = {"acute": "´", "grave": "`", "diaeresis": "¨", "tilde": "~", "circumflex": "^"}
