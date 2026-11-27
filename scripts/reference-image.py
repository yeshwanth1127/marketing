"""Inspect and prepare uploaded artwork, and measure differences after rendering."""
import csv
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from collections import Counter, defaultdict

from PIL import Image, ImageChops, ImageDraw, ImageOps, ImageStat

Image.MAX_IMAGE_PIXELS = 24_000_000


def artwork(path):
    with Image.open(path) as source:
        if source.width * source.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError("Reference image exceeds 24 megapixels")
        return ImageOps.exif_transpose(source).convert("RGBA")


def hex_color(rgb):
    return "#%02x%02x%02x" % tuple(rgb[:3])


def dominant(image, count=1):
    return [rgb for rgb, _ in Counter(image.getdata()).most_common(count)]


def rect(slot, size):
    w, h = size
    return (
        round(slot["x"] * w / 100), round(slot["y"] * h / 100),
        min(w, round((slot["x"] + slot["width"]) * w / 100)),
        min(h, round((slot["y"] + slot["height"]) * h / 100)),
    )


def sample_slot(image, slot):
    left, top, right, bottom = rect(slot, image.size)
    crop = image.crop((left, top, right, bottom)).convert("RGB")
    if not crop.width or not crop.height:
        return slot
    border = Image.new("RGB", (crop.width * 2 + crop.height * 2, 1))
    border.putdata([*crop.crop((0, 0, crop.width, 1)).getdata(),
                    *crop.crop((0, crop.height-1, crop.width, crop.height)).getdata(),
                    *crop.crop((0, 0, 1, crop.height)).getdata(),
                    *crop.crop((crop.width-1, 0, crop.width, crop.height)).getdata()])
    background = dominant(border)[0]
    colors = dominant(crop, 40)
    foreground = next((rgb for rgb in colors if sum(abs(a-b) for a, b in zip(rgb, background)) > 85), None)
    return {**slot, "fill": hex_color(background),
            "color": hex_color(foreground) if foreground else slot.get("color", "#111111")}


def ocr_slots(image, image_path):
    binary = shutil.which("tesseract")
    if not binary and os.name == "nt":
        for root in ("LOCALAPPDATA", "ProgramFiles"):
            if os.environ.get(root):
                installed = Path(os.environ[root]) / "Tesseract-OCR" / "tesseract.exe"
                if installed.is_file():
                    binary = str(installed)
                    break
    if not binary:
        return []
    try:
        output = subprocess.run(
            [binary, image_path, "stdout", "--psm", "11", "tsv"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15, check=True,
        ).stdout
    except (subprocess.SubprocessError, OSError):
        return []
    lines = defaultdict(list)
    for word in csv.DictReader(io.StringIO(output), delimiter="\t"):
        if word.get("text", "").strip() and float(word["conf"]) >= 45:
            lines[tuple(word[key] for key in ("block_num", "par_num", "line_num"))].append(word)

    found = []
    for words in lines.values():
        label = " ".join(w["text"].strip() for w in words)
        if len(label) < 2:
            continue
        left = min(int(w["left"]) for w in words)
        top = min(int(w["top"]) for w in words)
        right = max(int(w["left"]) + int(w["width"]) for w in words)
        bottom = max(int(w["top"]) + int(w["height"]) for w in words)
        found.append((label, left, top, right, bottom))
    if not found:
        return []
    headline = max(range(len(found)), key=lambda i: found[i][4] - found[i][2])
    wordmark = next((i for i, (_, left, top, right, _) in enumerate(found)
                    if i != headline and top < image.height*0.2 and right-left < image.width*0.35), -1)
    slots = []
    body_row = 0
    for i, (label, left, top, right, bottom) in enumerate(found[:28]):
        text_height = bottom - top
        pad = max(2, round(text_height * 0.16))
        x, y = max(0, left-pad), max(0, top-pad)
        x2, y2 = min(image.width, right+pad), min(image.height, bottom+pad)
        cta = label.casefold().startswith(("learn more", "get started", "shop now", "book now", "sign up", "contact us", "discover", "visit us"))
        kind = "headline" if i == headline else "cta" if cta else "logo" if i == wordmark else "body"
        slots.append({
            "kind": kind, "row": body_row if kind == "body" else 0,
            "x": 100*x/image.width, "y": 100*y/image.height,
            "width": 100*(x2-x)/image.width, "height": 100*(y2-y)/image.height,
            "size": 100*text_height*1.16/image.height, "weight": 700 if i == headline else 400,
            "case": "uppercase" if label.isupper() else "none", "z": i,
        })
        if kind == "body":
            body_row += 1
    return slots


def inspect(image, tmp_path, slots=None, regions=None):
    analysis = image.copy()
    analysis.thumbnail((1400, 1400))
    analysis.save(tmp_path)
    pixels = analysis.convert("RGB")
    pixels.thumbnail((160, 160), Image.Resampling.NEAREST)
    palette = [hex_color(rgb) for rgb in dominant(pixels, 12)]
    found = slots if slots is not None else ocr_slots(analysis, tmp_path)
    measured_regions = []
    for region in regions or []:
        crop = analysis.crop(rect(region, analysis.size)).convert("RGB")
        measured_regions.append({**region, "color": hex_color(dominant(crop)[0]) if crop.width and crop.height else region.get("color")})
    return {"canvas": {"width": image.width, "height": image.height}, "palette": palette,
            "slots": [sample_slot(analysis, slot) for slot in found], "regions": measured_regions}


def clean(image, config, output):
    source = image.copy()
    for slot in config["slots"]:
        left, top, right, bottom = rect(slot, image.size)
        if right <= left or bottom <= top:
            continue
        if slot.get("fill"):
            fill = Image.new("RGBA", (right-left, bottom-top), slot["fill"])
        else:
            near = source.crop((max(0, left-2), max(0, top-2), min(image.width, right+2), min(image.height, bottom+2)))
            fill = Image.new("RGBA", (right-left, bottom-top), dominant(near)[0])
        if config["attempt"] % 2 == 1:
            # Interpolate the border rows for gradients and textured paper.
            upper = source.crop((left, max(0, top-1), right, max(0, top-1)+1))
            lower = source.crop((left, min(image.height-1, bottom), right, min(image.height-1, bottom)+1))
            for y in range(fill.height):
                fill.paste(Image.blend(upper, lower, (y+1)/(fill.height+1)), (0, y))
        image.paste(fill, (left, top))
    image.save(output)


def compare(reference, rendered, slots):
    size = (min(512, reference.width), min(512, reference.height))
    a = reference.convert("RGBA").resize(size).convert("RGB")
    b = rendered.resize((reference.width, reference.height)).resize(size).convert("RGB")
    mask = Image.new("L", size, 255)
    draw = ImageDraw.Draw(mask)
    for slot in slots:
        x, y, r, bottom = rect(slot, size)
        draw.rectangle((x, y, max(x,r-1), max(y,bottom-1)), fill=0)
    difference = ImageChops.difference(a, b)
    canvas = 1 - sum(ImageStat.Stat(difference).mean)/765
    outside = 1 - sum(ImageStat.Stat(difference, mask=mask).mean)/765 if mask.getbbox() else canvas
    histogram = 1 - sum(abs(x-y) for x,y in zip(a.histogram(),b.histogram())) / (6*size[0]*size[1])
    return {"structure": round(outside*100, 2), "pixels": round(canvas*100, 2),
            "histogram": round(histogram*100, 2), "score": round(100*(0.6*outside+0.2*canvas+0.2*histogram), 2)}


mode, source_path, tmp_path, *args = sys.argv[1:]
image = artwork(source_path)
if mode == "inspect":
    override = json.load(open(args[0], encoding="utf-8")) if args else {}
    print(json.dumps(inspect(image, tmp_path, override.get("slots"), override.get("regions"))))
elif mode == "clean":
    with open(args[0], encoding="utf-8") as config:
        clean(image, json.load(config), tmp_path)
elif mode == "compare":
    with open(args[0], encoding="utf-8") as config:
        print(json.dumps(compare(image, artwork(tmp_path), json.load(config)["slots"])))
