#!/usr/bin/env python3
"""Render docs/demo/demo.gif from docs/demo/demo-data.json.

demo-data.json is condensed from one real, complete run of the DevGate workflow in a throwaway
Node project (see its "provenance" field): /specify, /deliver-increment with its three subagents,
a merge, DONE and /learn, driven turn by turn with headless `claude -p`. Agent text is verbatim
(shortened with "…"); this script only replays it in a drawn Claude Code style window. The window
chrome, colours, typing animation and markdown rendering are a re-enactment, not a screen
recording. Emoji are drawn with Apple Color Emoji when available (macOS), else replaced by plain symbols (✓ ✗ ↻ ■ …).

Usage: python3 -m venv .venv && .venv/bin/pip install 'pillow>=9.1' && .venv/bin/python docs/demo/render.py
"""
import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
DATA = json.loads((HERE / "demo-data.json").read_text(encoding="utf-8"))

W, H = 940, 480
BG, TITLEBAR, FG = "#1b1d23", "#2b2e36", "#d4d7dd"
DIM, GREEN, YELLOW, CYAN = "#7d8590", "#7ee787", "#e3b341", "#56d4dd"
QUOTE, ORANGE_CC = "#a9b4c0", "#d97757"
PANEL = "#262a33"
MONO_PATHS = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Monaco.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/dejavu/DejaVuSansMono.ttf",
]
MONO = next((p for p in MONO_PATHS if Path(p).exists()), None)
if MONO is None:
    raise SystemExit("render.py needs a monospace TrueType font: install DejaVu Sans Mono or Menlo")
EMOJI_FONT = Path("/System/Library/Fonts/Apple Color Emoji.ttc")
font = ImageFont.truetype(MONO, 15)
small = ImageFont.truetype(MONO, 13)
emoji_font = ImageFont.truetype(str(EMOJI_FONT), 160) if EMOJI_FONT.exists() else None
CW = font.getlength("M")
LH = 21
LEFT, TOP = 22, 52
COLS = int((W - 2 * LEFT) / CW)
VISIBLE = 18
FALLBACK = {"✅": "✓", "❌": "✗", "🔧": "✎", "🔄": "↻", "🛑": "■", "🗑": "✗", "🏁": "»", "🥊": "»"}
EMOJI = set("✅❌🔧🔄🛑🗑🏁🥊")
_emoji_cache = {}


def cells(text):
    """Display width in monospace cells (emoji are 2 cells wide when drawn as images)."""
    return sum(2 if (ch in EMOJI and emoji_font) else 1 for ch in text if ch != "️")


def clean(text):
    text = text.replace("\ufe0f", "").replace("✔", "✓")
    if not emoji_font:
        for k, v in FALLBACK.items():
            text = text.replace(k, v)
    return text


def emoji_image(ch):
    if ch not in _emoji_cache:
        img = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        ImageDraw.Draw(img).text((0, 0), ch, font=emoji_font, embedded_color=True)
        img = img.crop(img.getbbox()) if img.getbbox() else img
        size = int(CW * 2 - 2)
        _emoji_cache[ch] = img.resize((size, size), Image.LANCZOS)
    return _emoji_cache[ch]


def draw_text(img, d, x, y, text, color, f=font):
    for ch in text:
        if ch in EMOJI and emoji_font:
            e = emoji_image(ch)
            img.paste(e, (int(x) + 1, int(y) - 1), e)
            x += CW * 2
        else:
            d.text((x, y), ch, font=f, fill=color)
            x += f.getlength("M") if f is font else f.getlength(ch)
    return x


def wrap(text, width):
    out = []
    for para in text.split("\n"):
        out += textwrap.wrap(para, width, break_long_words=True, break_on_hyphens=False) or [""]
    return out


def agent_color(text):
    t = text.strip()
    if t.startswith("STATUS:") or t.startswith("VERDICT:"):
        return GREEN
    if t.startswith("Verdict?") or t.startswith("Did I get it right"):
        return YELLOW
    return FG


class Scene:
    def __init__(self, step, total, title, caption):
        self.step, self.total, self.title, self.caption = step, total, title, caption
        self.lines, self.frames = [], []

    def draw(self, partial=None, cursor=False):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, W, 36], fill=TITLEBAR)
        for i, c in enumerate(["#ff5f56", "#ffbd2e", "#27c93f"]):
            d.ellipse([16 + i * 22, 13, 27 + i * 22, 24], fill=c)
        d.text(((W - small.getlength(self.title)) / 2, 11), self.title, font=small, fill=DIM)
        y = TOP
        shown = (self.lines + ([partial] if partial else []))[-VISIBLE:]
        for k, ln in enumerate(shown):
            if ln.get("bg"):
                d.rectangle([LEFT - 8, y - 2, W - LEFT + 8, y + LH - 3], fill=ln["bg"])
            x = LEFT
            for text, color in ln["segs"]:
                x = draw_text(img, d, x, y, text, color)
            if cursor and k == len(shown) - 1:
                d.rectangle([x + 1, y + 1, x + CW - 1, y + LH - 4], fill=FG)
            y += LH
        d.rectangle([0, H - 42, W, H], fill=TITLEBAR)
        badge = f" {self.step}/{self.total} "
        bw = small.getlength(badge)
        d.rounded_rectangle([18, H - 32, 18 + bw + 4, H - 10], radius=5, fill=ORANGE_CC)
        d.text((20, H - 29), badge, font=small, fill="#1b1d23")
        assert 18 + bw + 16 + small.getlength(self.caption) < W - 8, f"caption too long: {self.caption}"
        d.text((18 + bw + 16, H - 29), self.caption, font=small, fill=FG)
        return img

    def add(self, ms, cursor=False):
        self.frames.append((self.draw(cursor=cursor), ms))

    def push(self, ln, ms):
        self.lines.append(ln)
        self.add(ms)

    def blank(self):
        self.lines.append({"segs": [("", FG)]})

    # --- event renderers -------------------------------------------------------------------
    def user(self, text):
        text = clean(text)
        parts = wrap(text, COLS - 4)
        for k, part in enumerate(parts):
            prefix = "> " if k == 0 else "  "
            for n in range(18, len(part) + 18, 18):
                self.frames.append((self.draw({"segs": [(prefix, ORANGE_CC), (part[:n], FG)], "bg": PANEL}, cursor=True), 28))
            self.lines.append({"segs": [(prefix, ORANGE_CC), (part, FG)], "bg": PANEL})
        self.add(300)

    def agent(self, lines):
        self.blank()
        first = True
        for raw in lines:
            raw = clean(raw.replace("`", "").replace("**", ""))
            heading = raw.startswith("## ") or raw.startswith("### ")
            raw = raw.lstrip("# ").strip() if heading else raw
            quote = raw.startswith("> ")
            body = raw[2:] if quote else raw
            for k, part in enumerate(wrap(body, COLS - 4)):
                dot = ("● ", FG) if first else ("  ", FG)
                first = False
                color = CYAN if heading else QUOTE if quote else DIM if part == "…" else agent_color(part)
                prefix = [("▎ ", DIM)] if quote else []
                self.push({"segs": [dot] + prefix + [(part, color)]}, 70 + 2 * len(part))
        self.add(500)

    def tool(self, name, arg, result):
        self.blank()
        head_w = COLS - len(name) - 6
        arg = arg if len(arg) <= head_w else arg[: head_w - 1] + "…"
        self.push({"segs": [("● ", GREEN), (name, FG), (f"({arg})", DIM)]}, 450)
        for k, line in enumerate(result):
            color = DIM if line == "…" else GREEN if line.startswith(("STATUS:", "VERDICT:", "✓")) or line.startswith("https://") else FG
            for part in wrap(clean(line), COLS - 6)[:1]:
                self.push({"segs": [("  └ " if k == 0 else "    ", DIM), (part, color)]}, 300)
        self.add(300)


def build():
    scenes = []
    total = len(DATA["scenes"])
    for i, sc in enumerate(DATA["scenes"], 1):
        s = Scene(i, total, sc["title"], sc["caption"])
        s.add(500, cursor=True)
        for ev in sc["events"]:
            if "user" in ev:
                s.user(ev["user"])
            elif "agent" in ev:
                s.agent(ev["agent"])
            elif "tool" in ev:
                s.tool(ev["tool"], ev["arg"], ev["result"])
        s.add(2500)
        scenes.append(s)
    return scenes


def main():
    frames, durations = [], []
    for sc in build():
        for img, ms in sc.frames:
            frames.append(img)
            durations.append(ms)
    # one shared palette (built from a sample of frames) so colours do not flicker between frames
    step = max(1, len(frames) // 24)
    sample = Image.new("RGB", (W, H * 24))
    for k, f in enumerate(frames[::step][:24]):
        sample.paste(f, (0, k * H))
    base = sample.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = [f.quantize(palette=base, dither=Image.Dither.NONE) for f in frames]
    out = HERE / "demo.gif"
    pal[0].save(out, save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, {len(frames)} frames, {sum(durations) / 1000:.1f}s)")


if __name__ == "__main__":
    main()
