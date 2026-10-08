#!/usr/bin/env python3
"""Render docs/demo/demo.gif from docs/demo/demo-data.json (real recorded output).

demo-data.json holds what was recorded in a throwaway project: the real DevGate scripts
(create-spec.sh, validate-spec.sh, transition-spec.sh, capture.sh) and one real headless
`claude -p --model sonnet` run that filled the scaffolded spec and iterated against
validate-spec.sh (tool calls and results come from the captured session). The prompt was written
for the demo (it dictates the spec's shape), not produced by the /specify skill; the agent passes
the gate partly by self-attesting the Spec Quality Checklist; the approval and the transition were
run by hand by the demo author. Absolute scratch
directory prefixes were stripped from printed paths. This script replays them in a drawn terminal
window: the window chrome, the shell prompt, the syntax colours, the glyph substitutions
(emoji -> ✓ ✗ ●) and the typing animation are a re-enactment, not a screen recording. The
interactive grill and per-section human review of a real /specify session are not shown.

Usage: python3 -m venv .venv && .venv/bin/pip install pillow && .venv/bin/python docs/demo/render.py
"""
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
DATA = json.loads((HERE / "demo-data.json").read_text())

W, H = 940, 440
BG, TITLEBAR, FG = "#1b1d23", "#2b2e36", "#d4d7dd"
DIM, GREEN, BLUE, YELLOW, RED = "#7d8590", "#7ee787", "#79b8ff", "#e3b341", "#ff7b72"
ORANGE, CYAN, MAGENTA, ORANGE_CC = "#ff9e64", "#56d4dd", "#d2a8ff", "#d97757"
PANEL = "#262a33"
FONT_PATHS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Monaco.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/dejavu/DejaVuSansMono.ttf",
]
FONT_FILE = next((p for p in FONT_PATHS if Path(p).exists()), None)
if FONT_FILE is None:
    raise SystemExit("render.py needs a monospace TrueType font: install DejaVu Sans Mono or Menlo")
font = ImageFont.truetype(FONT_FILE, 15)
small = ImageFont.truetype(FONT_FILE, 13)
CW = font.getlength("M")
LH = 21
LEFT, TOP = 22, 52
COLS = int((W - 2 * LEFT) / CW)
STEPS = 5
SUBST = {"✅": "✓", "❌": "✗", "🔴": "●"}


def clean(text):
    for k, v in SUBST.items():
        text = text.replace(k, v)
    return text


def clip_mid(text, width):
    """Shorten the middle of a string so both its start and its end (e.g. a trailing flag) stay visible."""
    text = clean(text)
    if len(text) <= width:
        return text
    keep = width - 1
    return text[: keep // 2 + keep % 2] + "…" + text[len(text) - keep // 2:]


def clip(text, width=COLS):
    text = clean(text)
    return text if len(text) <= width else text[: width - 1] + "…"


# --- tiny shell highlighter -------------------------------------------------------------
def highlight(text, in_quote=None, first=True):
    segs, cur = [], ""
    first = first and in_quote is None
    quote = in_quote

    def flush(color):
        nonlocal cur
        if cur:
            segs.append((cur, color))
        cur = ""

    def word_color(word):
        nonlocal first
        if word.startswith("-"):
            return BLUE
        if word in ("|", "&&", "\\"):
            return MAGENTA
        if first and word:
            first = False
            return GREEN
        if word == "bash" or word.endswith(".sh"):
            return GREEN
        return FG

    for ch in text:
        if quote:
            cur += ch
            if ch == quote:
                flush(ORANGE)
                quote = None
            continue
        if ch in "'\"":
            flush(FG)
            quote, cur = ch, ch
            continue
        if ch == " ":
            flush(word_color(cur))
            segs.append((" ", FG))
            continue
        cur += ch
    flush(ORANGE if quote else word_color(cur))
    return segs, quote


def out_line(text):
    t = clean(text)
    color = RED if t.startswith("✗") else GREEN if t.startswith(("✓", "wrote")) else FG
    if t.startswith("  - "):
        color = YELLOW
    if t.startswith("- [TEST]"):
        return {"segs": [("- ", DIM), ("[TEST]", CYAN), (clip(t[8:], COLS - 8), FG)]}
    if t.lstrip().startswith("- [ ]") or "**Goal**" in t or "**Commit**" in t or "**Refactoring**" in t:
        return {"segs": [(clip(t), FG)]}
    return {"segs": [(clip(t), color)]}


def plain(text, color=FG):
    return {"segs": [(clip(text), color)]}


def shell_prompt():
    return [("~/shop", BLUE), (" ", FG), ("(main)", MAGENTA), (" $ ", GREEN)]


class Scene:
    def __init__(self, title, step, caption):
        self.title, self.step, self.caption = title, step, caption
        self.lines, self.frames, self.quote = [], [], None

    def draw(self, partial=None, cursor=False):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, W, 36], fill=TITLEBAR)
        for i, c in enumerate(["#ff5f56", "#ffbd2e", "#27c93f"]):
            d.ellipse([16 + i * 22, 13, 27 + i * 22, 24], fill=c)
        d.text(((W - small.getlength(self.title)) / 2, 11), self.title, font=small, fill=DIM)
        y = TOP
        shown = self.lines[-16:] + ([partial] if partial else [])
        for k, ln in enumerate(shown):
            if ln.get("bg"):
                d.rectangle([LEFT - 8, y - 2, W - LEFT + 8, y + LH - 3], fill=ln["bg"])
            x = LEFT
            for text, color in ln["segs"]:
                d.text((x, y), text, font=font, fill=color)
                x += CW * len(text)
            if ln.get("note"):
                d.text((x + 14, y + 1), ln["note"], font=small, fill=CYAN)
            if cursor and k == len(shown) - 1:
                d.rectangle([x + 1, y + 1, x + CW - 1, y + LH - 4], fill=FG)
            y += LH
        d.rectangle([0, H - 42, W, H], fill=TITLEBAR)
        badge = f" {self.step}/{STEPS} "
        bw = small.getlength(badge)
        d.rounded_rectangle([18, H - 32, 18 + bw + 4, H - 10], radius=5, fill=ORANGE_CC)
        d.text((20, H - 29), badge, font=small, fill="#1b1d23")
        d.text((18 + bw + 16, H - 29), self.caption, font=small, fill=FG)
        return img

    def add(self, ms, cursor=False):
        self.frames.append((self.draw(cursor=cursor), ms))

    def push(self, ln, ms=250):
        self.lines.append(ln)
        self.add(ms)

    def type(self, make, text, step=4, ms=45):
        for n in range(step, len(text) + step, step):
            self.frames.append((self.draw(make(text[:n]), cursor=True), ms))
        self.lines.append(make(text))

    def type_shell(self, text, prompt=True, step=3, ms=40):
        quote = self.quote

        def make(prefix):
            segs, _ = highlight(prefix, quote, first=prompt)
            return {"segs": (shell_prompt() if prompt else []) + segs}

        self.type(make, text, step, ms)
        _, self.quote = highlight(text, quote, first=prompt)

    def run(self, cmd, out, step=8, hold=700):
        """Type a command at a prompt, then print its recorded output."""
        if self.lines and self.lines[-1] == {"segs": shell_prompt()}:
            self.lines.pop()
        for k, part in enumerate(split_cmd(cmd)):
            self.type_shell(part, prompt=(k == 0), step=step)
        self.add(350)
        for line in out:
            for k, part in enumerate(textwrap.wrap(clean(line), COLS, break_long_words=False) or [""]):
                self.push(out_line(part), 160)
        self.push({"segs": shell_prompt()}, 1)
        self.add(hold, cursor=True)


def split_cmd(cmd, width=COLS - 17):
    """Break a long command with backslash continuations at spaces outside quotes."""
    if len(cmd) <= width:
        return [cmd]
    indent = len(cmd) - len(cmd.lstrip())
    quote, cuts = None, []
    for idx, ch in enumerate(cmd):
        if quote:
            quote = None if ch == quote else quote
        elif ch in "'\"":
            quote = ch
        elif ch == " " and idx > indent:
            cuts.append(idx)
    fitting = [c for c in cuts if c <= width - 2]
    cut = max(fitting) if fitting else (min(cuts) if cuts else -1)
    if cut < 0:  # no safe break point: keep it on one line
        return [cmd]
    return [cmd[:cut] + " \\"] + split_cmd("    " + cmd[cut + 1:], width)


def wrap(text, width):
    out = []
    for para in text.split("\n"):
        out += textwrap.wrap(para, width) or [""]
    return out


def build():
    sp = DATA["spec_path"]
    scenes = []

    s1 = Scene("shop — -zsh", 1, "Scaffold a spec, then run the gate: an unfilled template cannot pass.")
    s1.lines.append({"segs": shell_prompt()})
    s1.add(500, cursor=True)
    s1.run(DATA["scaffold"]["cmd"], [DATA["scaffold"]["out"]], hold=500)
    s1.run(DATA["validate_fail"]["cmd"], DATA["validate_fail"]["out"], hold=2200)
    scenes.append(s1)

    s2 = Scene("shop — claude", 2, "Agent fills the spec against the gate. 1st line = session tag (no-op). Demo prompt, excerpt.")
    s2.add(400)
    paras = DATA["prompt"].split("\n")
    marker_line = paras[0]
    run_line = wrap(paras[2], COLS - 6)[0]
    then_line = wrap(paras[4], COLS - 6)[0].rstrip(" .,") + " …"
    for k, part in enumerate([marker_line, "", run_line, "", then_line]):
        marker = part.startswith(": SPEC_MARKER")

        def make(t, k=k, marker=marker, full=part):
            return {"segs": [("> " if k == 0 else "  ", ORANGE_CC), (t, ORANGE if marker else FG)],
                    "bg": PANEL, "note": "◀ the tag" if (marker and t == full) else None}

        if part == "":
            s2.push({"segs": [("  ", FG)], "bg": PANEL}, 60)
        else:
            s2.type(make, part, step=12, ms=22)
    s2.add(500)
    s2.push(plain(""), 1)
    for tool in DATA["agent_tools"]:
        arg = clip_mid(tool["arg"], COLS - len(tool["tool"]) - 6)
        s2.push({"segs": [("● ", GREEN), (tool["tool"], FG), (f"({arg})", DIM)]}, 650)
        for k, line in enumerate(tool["result"]):
            body = out_line(clip(line, COLS - 5))["segs"][0]
            s2.push({"segs": [("  └ " if k == 0 else "    ", DIM), body]}, 350)
    s2.add(1800)
    scenes.append(s2)

    s3 = Scene("shop — -zsh", 3, "The result: criteria marked [TEST], one increment (= one future PR), a Refactoring box.")
    s3.lines.append({"segs": shell_prompt()})
    s3.add(400, cursor=True)
    s3.run(DATA["spec_excerpt"]["cmd"], DATA["spec_excerpt"]["out"], step=10, hold=3200)
    scenes.append(s3)

    s4 = Scene("shop — -zsh", 4, "Once you approve, the gate re-validates and the spec is ready-to-implement (approval not shown).")
    s4.lines.append({"segs": shell_prompt()})
    s4.add(400, cursor=True)
    s4.run(DATA["transition"]["cmd"], DATA["transition"]["out"], hold=2200)
    scenes.append(s4)

    s5 = Scene("shop — -zsh", 5, "Evidence: capture finds the session by that tag. implement/review phases have not run yet.")
    s5.lines.append({"segs": shell_prompt()})
    s5.add(400, cursor=True)
    s5.run(DATA["capture"]["cmd"], [DATA["capture"]["out"]], hold=500)
    s5.run(DATA["header"]["cmd"], [DATA["header"]["out"]], step=10, hold=2800)
    scenes.append(s5)
    return scenes


def main():
    frames, durations = [], []
    for sc in build():
        for img, ms in sc.frames:
            frames.append(img)
            durations.append(ms)
    pal = [f.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    out = HERE / "demo.gif"
    pal[0].save(out, save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, {len(frames)} frames, {sum(durations) / 1000:.1f}s)")


if __name__ == "__main__":
    main()
