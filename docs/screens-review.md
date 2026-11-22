<!-- The screen-picking half of a Motvin review — which screens to keep and the best picture of each. docs/review-motvin.md sends the reviewer here first, then on to names, types, flows and patterns. -->

# Review a Motvin upload's screens (screens-review)

Part of [`review-motvin.md`](review-motvin.md): do this first, for the same app and version, then go back there for names, types, the tree and patterns. Write the results into the same `corrections.json`.

The goal: every flow reads like a real person going through the app, step by step — the way Mobbin shows it — with every state as its own step, and every picture clean, sharp and fully loaded.

## What the package gives you

- `sheet-N.png` — every screen, numbered `#n`.
- `frames/<n>.png` — when the recording is kept with the upload: the frames around screen `#n`, each labelled with its second, "(now)" being the current picture. Use it to pick a better picture.
- In `screens.json` and `doubts.json`, hints to check — judge each one from the picture:
  - `looksLike` / "looks the same as #n" — a likely duplicate.
  - `blank` / "almost nothing on it" — a likely blank loading page.
  - `clearerAt` / "a clearer picture of it at …s" — a sharper or more loaded frame of the same screen.
  - `cleanerAt` / "may be the clean start" — for the first step of a flow, a frame from just before, possibly before anything was typed or chosen.
  - `changesAt` / "something on it changes" — the same page with something new on it a moment later: possibly a missed step (step 3 below).

Before starting, report step 3: `node ios-crawler/crawl.js review-progress --app-id <app> --platform <platform> --version <version> --step 3`.

## 1. Keep or remove

- **Keep** every new page, and every change on a page: a sheet, menu, pop-up or permission prompt opening; text typed into a field; a toggle, tab, filter or selection changing; a toast or banner appearing.
- **Keep the states** as their own steps:
  - **loading** — only when the page itself is there with a spinner, skeleton or progress on it (a button spinning, cards still drawing in, prices still loading); one per wait, the clearest.
  - **error** — wrong code, failed request, validation message.
  - **empty** — nothing yet.
  - **success** — done, saved, sent.
  - **scrolled** — the same page further down showing new content; each scroll that reveals something new.
  - **keyboard up** while typing.
- **Remove** (put the id in `remove`):
  - the same page in the same state as the screen just before it, with nothing new;
  - a frame caught mid-slide or half faded when a clean picture of the same step exists (or swap the picture instead, below);
  - a second loading frame of the same wait;
  - a blank loading page — an empty or nearly empty screen with nothing of the app on it, only a banner, logo, bar or a spinner on empty space;
  - a blank or broken capture.
- When unsure, keep it. A removed screen gets no other fix.

## 2. The best picture of each screen

For every screen you keep, look at its `frames/<n>.png` and pick the frame that shows it best:

- **sharp** — not mid-fade or dimmed while a dialog or panel opens; the dialog fully drawn;
- **fully loaded** — content in, not half-drawn (a loading state on purpose is the exception, above);
- **the clean start** — the first screen of every flow shows the page as it first appears, before anything is typed, focused or chosen (an empty field, nothing selected).

When a better frame exists, add `{ "id": "<screen id>", "at": <seconds> }` to `frames` — the picture is replaced from the recording, at its own size; its name, type and flow stay. A frame from the next screen is not a better picture of this one.

When no `frames/` folder exists, the recording was not kept: pick only among the screens shown, and say in the report which pictures could not be improved.

### Pictures taken while the page was still moving

The package plays on from every kept picture to the moment its page holds still. When the settled page clearly differs (a sheet still sliding up, the keyboard still rising, a dialog half shown) and is no other kept screen, it is listed in `findings.json` and in `problems` with the moment it settles. Swap each: `"frames": [ { "id": "<screen id>", "at": <the time given> } ]`. Keep the picture only when what it shows is gone once the page settles (a toast, a brief banner): `"confirm": [ { "key": "<its key>", "why": "a toast that is gone once the page settles" } ]`. The final check lists every one not yet swapped or confirmed. The same goes for a sharper picture, a cleaner first step, a duplicate and a blank page.

## 3. Add a step the upload missed

The upload can fold a small change into the screen before it — an error line under a field, a field emptied or filled, an empty state, a picker — so the step is missing. When the recording is kept, the package scans all of it: every moment that holds still for a second and matches no kept screen is in `missed` in `screens.json` (and `missed.json`), with its picture in `frames/missed-<k>.png` and the screen it follows (`after`).

**Decide every one** — the final check lists each moment not yet decided:

- **Add** it when it is a real step (an error, an empty state, a clean empty field, a sheet, a new page):

```json
"add": [ { "after": "<screen id it follows>", "at": 37, "name": "Verification code entry", "type": "login", "extraTypes": ["error"], "elements": ["text-field", "alert"], "tags": ["warning"], "style": ["dark"] } ]
```

- **Use it as the picture** when it is a kept screen, only shown better — the kept picture is mid-animation, half loaded or dim, and the moment shows the same page settled (a search page whose header slid away while the keyboard rose, now fully open): swap with `"frames": [ { "id": "<kept screen id>", "at": 331.25 } ]` and skip the moment with `{ "at": 331.25, "why": "picture" }`.
- **Skip** it only when it adds nothing, and say why — apply checks it:
  - `"typing"` — typing half done (some digits or letters in);
  - `"pressed"` — a button only highlighted under the finger;
  - `"bars"` — the same page with the bars shown or hidden;
  - `"animation"` — only an animation moving (a spinner, an illustration, a progress bar), nothing a person would stop on;
  - `"same"` with `"same": "<kept screen id>"` — exactly a kept screen. Apply compares the two pictures and **refuses** the skip when they differ (an empty field, an error line, a loaded page are different);
  - `"picture"` — used as a kept screen's better picture (needs the `frames` swap).

```json
"skip": [ { "at": 12.75, "why": "typing" }, { "at": 64.25, "why": "same", "same": "<kept screen id>" } ]
```

A bare number, a missing reason or a refused skip leaves the moment open, and the final check lists it with the reason.

**Never skip** these — each is a step a designer looks for, so add it even when a kept screen looks almost the same: a field or code boxes still **empty before typing** (the clean start of a form), any **error, warning or validation line** ("Incorrect code", "Enter a valid email"), a **success or done** state, an **empty state**, a **loading** state on the real page, the **keyboard open** on a page shown without it, and a sheet, menu or picker. When in doubt, add it — a step too many is cheap, a missed state is the mistake the admin sees.

The strips' `changesAt` hint ("something on it changes") points at the same kind of step for each screen.

## 4. Back to review-motvin.md

Continue with names, types, elements, style and tags for each screen you kept, then the tree, patterns and the final check. The recording is removed by itself once the review check says no problems left.

