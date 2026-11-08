#!/usr/bin/env python3
"""Build a GitHub Pages site from armies/<army>/{done,ongoing,backlog}/<model>/ folders.

Each army folder holds its own army.json (name, motto, colours) and logo image.

Uses only Python's standard library. Run: python3 scripts/build_site.py
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public"
ARMIES = ROOT / "armies"
OUTPUT = ROOT / "_site"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"}
PHOTO_NAMES = ("cover", "photo", "main", "hero")
LOGO_NAMES = ("logo.png", "logo.svg", "logo.webp", "logo.jpg", "logo.jpeg")
ARMY_LIST = ROOT / "sidebar.txt"
# A "Models: 10" line in notes.md says how many miniatures the entry holds, e.g. a squad.
COUNT_LINE = re.compile(r"^[ \t]*models[ \t]*:[ \t]*(\d+)[ \t]*$\n?", re.IGNORECASE | re.MULTILINE)
# A "Pinned: yes" line in notes.md puts the model first in its army.
PIN_LINE = re.compile(r"^[ \t]*pinned[ \t]*:[ \t]*(yes|true)[ \t]*$\n?", re.IGNORECASE | re.MULTILINE)
# A "Finished: March 2025" line in notes.md is the month the model was painted; done models sort newest first.
FINISHED_LINE = re.compile(r"^[ \t]*finished[ \t]*:[ \t]*(.+?)[ \t]*$\n?", re.IGNORECASE | re.MULTILINE)
MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
STATUSES = ("done", "ongoing", "backlog")
DEFAULTS = {"chapter": "", "motto": "", "color": "#3a3d42", "accent": "#d9bc85"}


def hex_to_rgb(value: str) -> str:
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    return ", ".join(str(int(value[i:i + 2], 16)) for i in (0, 2, 4))


def army_folders() -> list[tuple[Path, str]]:
    # sidebar.txt lists the army folders to include, in display order.
    # A line like [Other] starts a new sidebar section.
    section = "Warhammer"
    folders = []
    for line in ARMY_LIST.read_text(encoding="utf-8").splitlines():
        name = line.strip()
        if not name or name.startswith("#"):
            continue
        if name.startswith("[") and name.endswith("]"):
            section = name[1:-1].strip()
            continue
        folder = ARMIES / name
        if not (folder / "army.json").is_file():
            raise SystemExit(f"sidebar.txt lists '{name}', but armies/{name}/army.json does not exist")
        folders.append((folder, section))
    return folders


def load_armies() -> list[dict]:
    armies = []
    for army_dir, section in army_folders():
        info = army_dir / "army.json"
        army = {**DEFAULTS, "name": army_dir.name}
        army.update(json.loads(info.read_text(encoding="utf-8")))
        army["slug"] = army_dir.name
        army["section"] = section
        army["rgb"] = hex_to_rgb(army["accent"])
        army["fillRgb"] = hex_to_rgb(army["color"])
        army["_logo"] = next((army_dir / n for n in LOGO_NAMES if (army_dir / n).is_file()), None)
        armies.append(army)
    return armies


def parse_month(text: str, where: Path) -> str:
    # Accepts "March 2025", "Mar 2025", "2025-03" or "03/2025"; returns "2025-03".
    named = re.fullmatch(r"([a-z]+)\.?\s+(\d{4})", text, re.IGNORECASE)
    if named and named.group(1)[:3].lower() in MONTHS:
        return f"{named.group(2)}-{MONTHS.index(named.group(1)[:3].lower()) + 1:02d}"
    numeric = re.fullmatch(r"(\d{4})-(\d{1,2})|(\d{1,2})/(\d{4})", text)
    if numeric:
        year, month = (numeric.group(1), numeric.group(2)) if numeric.group(1) else (numeric.group(4), numeric.group(3))
        if 1 <= int(month) <= 12:
            return f"{year}-{int(month):02d}"
    raise SystemExit(f"{where}: could not read 'Finished: {text}'. Use a month and year, e.g. 'Finished: March 2025'")


def photo_order(path: Path) -> tuple[int, str]:
    stem = path.stem.lower()
    return (PHOTO_NAMES.index(stem) if stem in PHOTO_NAMES else len(PHOTO_NAMES), path.name.lower())


def media_url(parts: tuple[str, ...]) -> str:
    # Encode each path component for spaces, accents, #, %, etc.
    return "/".join(quote(part, safe="") for part in parts)


def build() -> tuple[int, int]:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(SOURCE, OUTPUT)
    definitions = load_armies()
    collection = []
    total = 0

    for definition in definitions:
        slug = definition["slug"]
        logo = definition.pop("_logo")
        if logo:
            target = OUTPUT / "media" / slug / logo.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(logo, target)
            definition["logo"] = "media/" + media_url((slug, logo.name))
        else:
            definition["logo"] = None
        models = []
        for status in STATUSES:
            folder = ARMIES / slug / status
            if not folder.is_dir():
                continue
            # Folder names, not metadata, are the model names.
            for model_dir in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
                if not model_dir.is_dir() or model_dir.name.startswith("."):
                    continue

                note_path = model_dir / "notes.md"
                notes = note_path.read_text(encoding="utf-8").strip() if note_path.is_file() else ""
                count_match = COUNT_LINE.search(notes)
                count = max(1, int(count_match.group(1))) if count_match else 1
                notes = COUNT_LINE.sub("", notes, count=1)
                pinned = bool(PIN_LINE.search(notes))
                notes = PIN_LINE.sub("", notes, count=1)
                finished_match = FINISHED_LINE.search(notes)
                finished = parse_month(finished_match.group(1), note_path) if finished_match else ""
                notes = FINISHED_LINE.sub("", notes, count=1).strip()

                image_paths = sorted(
                    (p for p in model_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS),
                    key=photo_order,
                )
                images = []
                for image in image_paths:
                    parts = (slug, status, model_dir.name, image.name)
                    target = OUTPUT.joinpath("media", *parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(image, target)
                    images.append("media/" + media_url(parts))

                models.append({
                    "name": model_dir.name,
                    "status": status,
                    "count": count,
                    "pinned": pinned,
                    "finished": finished,
                    "notes": notes,
                    "images": images,
                })
                total += 1

        # Newest finish first, undated last; then pinned first and grouped by status. Sorts are stable.
        models.sort(key=lambda model: model["finished"], reverse=True)
        models.sort(key=lambda model: (not model["pinned"], STATUSES.index(model["status"])))
        collection.append({**definition, "models": models})

    # Stamp asset links with the build time so browsers never run a stale app.js or styles.css.
    built = datetime.now(timezone.utc)
    page = OUTPUT / "index.html"
    version = built.strftime("%Y%m%d%H%M%S")
    page.write_text(
        page.read_text(encoding="utf-8")
        .replace('href="styles.css"', f'href="styles.css?v={version}"')
        .replace('src="app.js"', f'src="app.js?v={version}"'),
        encoding="utf-8",
    )

    catalog = {
        "generatedAt": built.isoformat(timespec="seconds"),
        "armies": collection,
    }
    data_dir = OUTPUT / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return len(collection), total


if __name__ == "__main__":
    try:
        army_count, model_count = build()
        print(f"Built _site: {army_count} armies, {model_count} model folders.")
    except Exception as error:
        print(f"Build failed: {error}", file=sys.stderr)
        raise
