# Librarium of Miniature Armies

A static Warhammer collection tracker for GitHub Pages. Each model is a folder; a build script turns the folders into the website.

## Adding a model

Create a folder inside an army's `done`, `ongoing` or `backlog` folder. The folder name is the model name.

```text
armies/black-templars/done/Emperor's Champion/
├── cover.jpg
├── side.jpg
└── notes.md
```

Move the folder between `backlog`, `ongoing` and `done` as you paint it.

**Photos:** any `.jpg`, `.png`, `.webp`, `.gif`, `.avif` or `.svg` in the folder. A file named `cover` is shown first; the rest are sorted by name. Name them `image_1.jpg`, `image_2.jpg`, … iPhone `.HEIC` photos need converting first: `sips -s format jpeg IN.HEIC --out image_1.jpg`.

**Notes:** an optional `notes.md`. Each `##` heading becomes a section in the popup. A `## Preview` section is the short text on the card.

**Model count:** for a squad or unit, add a line like `Models: 10` to `notes.md`. The painted percentage counts miniatures, so a squad of 10 counts as 10. Entries without the line count as 1.

**Pinning:** add a line `Pinned: yes` to `notes.md` to show that model first in its army.

**Finish date:** when a model is done, add a line like `Finished: March 2025` to `notes.md` (`Mar 2025`, `2025-03` and `03/2025` also work). The month shows on the card and in the popup. Completed models are listed newest first, and those without a date come after them, sorted by name.

```md
## Preview
Hand-painted chapter icon, weathered armour.

## Kitbashing
- Sword from a spare bits sprue.
```

## Adding an army

Create a folder in `armies/` with `done`, `ongoing` and `backlog` folders, an optional `logo.png` (or `.svg`), and an `army.json`:

```json
{
  "name": "Black Templars",
  "chapter": "The Eternal Crusade",
  "motto": "No Pity! No Remorse! No Fear!",
  "color": "#5a5e66",
  "accent": "#e2cf9f"
}
```

`color` tints the page background and the photo frames, and `accent` is used for highlights.

Then add the folder name to `sidebar.txt` in the project root. That file lists the armies shown on the site, one per line, in sidebar order. Leave a folder out to hide it.

`sidebar.txt` is split into sidebar sections. A line in square brackets starts a section, and the armies below it are listed under that heading:

```text
[Warhammer]
black-templars
grey-knights

[Other]
imperial-fists
```

Put your main armies under `[Warhammer]`. For a few odd models from another army, give that army its own folder and list it under `[Other]`.

## Preview locally

```sh
python3 scripts/build_site.py
python3 -m http.server 8000 --directory _site
```

Open http://localhost:8000. Rebuild after changing any folder.

## Publishing

Push to `main` on GitHub and set **Settings → Pages → Source** to **GitHub Actions**. Every push rebuilds and deploys the site.
