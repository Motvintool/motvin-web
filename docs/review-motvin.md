<!-- The Motvin review steps — the only copy. The Motvin agent's "Ask agent to review" button copies "Follow motvin-web/docs/review-motvin.md to review <app> <platform> <version>", so any AI tool (Claude Code, Cursor, Antigravity…) opens this file from that message. -->

# Review a Motvin upload (review-motvin)

The admin pasted `Follow motvin-web/docs/review-motvin.md to review <app> <platform> <version>` from the Motvin agent's "Ask agent to review" button (for example `… to review claude webapp 2026-10-24`). Check every screen of that version against its screenshot, fix what is wrong in one corrections file, apply it, and report. Work on that app and version only.

Paths (from the `Plugin` folder):
- Crawler: `motvin-web/tools/ios-crawler/crawl.js` — run it from `motvin-web/tools`.
- Review package: `motvin-backend/data/reviews/<app>-<platform>-<version>/`
- Kept rules: `motvin-backend/data/inspirations/review-rules.json`

**Report each step to the Motvin agent** — its card shows the review's progress as a checklist. Building the package shows step 2 while it builds and marks steps 1–2 done when it finishes; at the start of steps 3, 4, 5 and 7 run, from `motvin-web/tools`:

```bash
node ios-crawler/crawl.js review-progress --app-id <app> --platform <platform> --version <version> --step <n>
```

Steps: 1 read these steps · 2 build the package · 3 pick screens and best pictures (`screens-review.md`) · 4 names, types, elements, style and tags · 5 flows, patterns and app info · 6 apply (marked by apply-review) · 7 second check, flow by flow (`audit-motvin.md`) · 8 final check (done when it says no problems left).

## 1. Get the package

Always run this first, once. Run again during the review (after an apply) it only refreshes the screen list, sheets and findings — but `apply-review` already does that, so there is no need. It tells the Motvin agent the review has started (the card shows "Agent is reviewing…" from that moment until the review check passes). The package is normally prepared in the background right after the upload, so this only waits for it to finish, or reuses it at once; it is built again only when the upload changed since:

```bash
node ios-crawler/crawl.js review-pack --app-id <app> --platform <platform> --version <version>
```

**The review layer.** The package proves what it can from the pictures and the recording, and the review cannot pass until each item is done:
- **Findings** (`findings.json`, also in `problems`): a picture taken while the page was still moving, a sharper or fully loaded picture in the recording, a cleaner first step, a picture that is not what the recording shows at its time (its time is stale, so its step order cannot be trusted — retake it at the moment given), two screens with the same picture, a blank page, steps out of the recording's order. Findings are checked again after every apply, so a fix that causes a new problem (a swapped picture now the same as the next screen) is listed too. Fix each one (`frames`, `remove`, `order`), or confirm it on purpose with its key and a real reason: `"confirm": [ { "key": "<key>", "why": "a toast that is gone once the page settles" } ]`.
- **Missed moments** (`missed`): every still moment no screen shows, and every page whose state changes after its picture. Add each one, or skip it with a checked reason (`screens-review.md` step 3).
- **A verdict on every screen**: look at every screen on a contact sheet, then give the sheet one verdict saying what is on it — `"sheets": [ { "sheet": 3, "see": "booking flow: dates, guests, price breakdown, all settled" } ]`. A screen with something to say gets its own: `"checked": [ { "id": "<screen id>", "see": "…" } ]`. A screen with no verdict, or whose picture changed since, is listed until it has one. Pictures you retake or add count as looked at.
- **The second check** (step 7, `audit-motvin.md`): every flow approved on its flow sheet as it stands. A flow that changes needs approval again.

Read `screens.json` (every screen: `n`, `id`, `name`, `type`, `extraTypes`, `elements`, `tags`, `style`, `flow`, `patterns`; plus `problems` (what the automatic check already finds wrong — fix every one), `tree`, `patterns`, the app's `appName`, `tagline`, `industry` and `cardScreens`, and the allowed `industries`, `flowCategories`, `types`, `elements` and `tags`), `doubts.json`, and `review-rules.json`.

## Four agents at once

The package splits the work in four even parts, `work-parts.json`: `firstPass` (contact sheets, for steps 2–3 below) and `secondCheck` (flow sheets, for step 7). When your tool can start separate agents (Claude Code: the Agent tool), **start all four at the same time, in one single message** (four agent calls together — never two and then two) for each pass, one part each — the pass then takes the time of one part, not four. Wait until all four have returned before going on — never end your turn while one is still working (an unattended review would stop there). Give each agent this file and `screens-review.md` (or `audit-motvin.md` for the second check), the package folder, and **its own work file** — `work-first-<n>.json` for the first pass, `work-check-<n>.json` for the second check (named in `work-parts.json`). That file holds everything about its part: its screens with their pictures' sheets, names, types, elements, tags and flows, its missed moments and findings (or its flows with their steps), and the lists to choose from. Tell the agent to read **only its work file**, not `screens.json` — the whole app would make every one of its steps cost four times as much; it looks at every picture in its part and **returns** its entries (verdicts, fixes, adds, skips, approvals) without applying. A first-pass part also lists its **missed moments** (`missed`, by `k`) and its **findings** (`findings`, by key): the agent decides every one of them — add, skip with a reason, swap, remove or confirm — so the first apply leaves nothing open. Leaving them for later costs a whole extra round. You put them together in one corrections file:

- **One name for one page.** Agents name their own screens, so the same screen may come back under two names ("Seat selection", "Choosing seats"): before writing the file, list every name the agents used, and give every screen of one kind the same name.
- **Flows across parts.** A flow whose screens fall in two parts: put its steps in order and give it one name.
- **Combine with the merge command, not a script of your own.** Each agent saves its entries as `part-<n>.json` in the package folder; then, from `motvin-web/tools`:

  ```bash
  node ios-crawler/crawl.js merge-corrections --app-id <app> --platform <platform> --version <version> --files <part-1.json,part-2.json,…> --out <package>/corrections.json
  ```

  It joins entries for the same screen, flow or moment, drops the `_` notes, and lists every screen name used — give one page one name in the file.
- **Check before applying.** Fix everything it lists, and run it again until it says nothing would be refused:

  ```bash
  node ios-crawler/crawl.js check-corrections --app-id <app> --platform <platform> --version <version> --file <package>/corrections.json
  ```

- Then apply once. Every screen is still looked at, by one agent; never drop a part to save time.

Without separate agents, do the parts yourself one after another.

## 2. Check every screen

Look at every contact sheet (`sheet-1.png`, `sheet-2.png`, …). Each shows twelve screenshots, numbered `#n` with their type. Start with the screens in `doubts.json`, then go through all the rest.

**First, the screens themselves** — which to keep, which to remove, and the best picture of each: follow [`screens-review.md`](screens-review.md), then come back here.

For each screen you keep, decide:

- **Name** — a short plain noun a designer would file it under ("Name entry", "AI chat input", "Filters sheet"). Never marketing text, a brand, a number suffix ("Home (2)"), a "·" or " - " joiner, or a trailing "screen" ("Home", not "Home screen"). Same-looking screens share one name, so look-alikes across the app read the same.
- **Type** — one of `types` in `screens.json`, judged from the picture: what the screen *is*, not single words on it. A sheet or menu over a page is `modal`; a chat with people or an AI is `messages`; filling in a name or details outside sign-in is `form`; plans or an upgrade offer is `pricing`; an inbox of notifications is `notifications`. Never leave a screen `other` when one fits.
- **Extra types** — other types from `types` the screen also clearly is, at most four, usually none: a permission prompt over a chat is `permission` with extra `messages`; a sign-up form with a plan offer is `signup` with extra `pricing`. Never the main type again, never `other`, never a type only a word on the screen suggests. The main type is the one the screen is most; it names the screen and its folder.
- **Elements** — only from `elements`, only what is clearly visible, at most six. `tab-bar` only when the bar switches the app's main sections.
- **Style** — `dark` when the screenshot is mostly dark, `light` when mostly light (never both); add `bold` or `minimal` only when clearly so. It drives the Style filter and dark card frames.
- **Tags** — only from `tags`, at most five, usually one to three: what a designer would search for that the types and elements do not already say ("ai-assistant", "free-trial", "dark-mode"). Types, platform and category are added to a screen's tags on their own; do not repeat them. Only tags that are true on that screen — `logged-out` only when nobody is signed in, `free-trial` only when a trial is offered there.

## 3. Check the tree

From `tree` and the screens' `flow`:
- **No flow of one screen, as on Mobbin, on every platform.** A task with a single screen inside a section (viewing the trash, logging out) is a screen of that section: merge it into the section (`merges` with `into` the section). A single-screen task on its own joins the task it belongs to. A section may hold one screen of its own when tasks branch from it — it shows as a heading. The review check lists every one-screen flow left.
- **On Web Apps and Webs (`webapp`, `web`), Onboarding is one flow, as Mobbin shows it** — no flows inside it. It holds the first run in the order the recording shows it: the welcome or sign-in page, signing up or logging in, codes, permissions, name and setup steps, a tour — up to the app's first home. Merge such sub-flows into it (`merges`, then its `order` by time). A second way of signing in recorded afterwards (logging in with a password, resetting a password, a sign-up after a log-in) is a flow of its own at the top level, right after Onboarding (`"parent": null`); so is anything done later from the first screens (managing cookies).
- **On iOS, Onboarding is an area**: it holds only what comes before the app is used, as flows of their own (Logging in, Setting up a profile…).
- Top level is Onboarding, then the app's areas (Home, Inbox, Settings…); inside areas features; inside features tasks — like Mobbin.
- Each flow is one task, named with an -ing verb ("Sending a message"); areas are plain nouns ("Home", "Settings"). Never " - ", brackets, the word "flow", or text read off a screen ("Search for Kuch c"). No two flows with the same name in one place. No flow of only a permission prompt or a loading screen — it belongs to the flow before it.
- Each screen sits in **one** flow only — the one its picture belongs to. The upload often lists a sub-flow's screens in its area too (Onboarding holding every "Logging in" screen); take them out of the area with `moves`, or the screens show twice.
- Each screen sits in the flow its picture belongs to, and the flow's screens are in the order a person goes through them (fix with `order`).
- Each flow has the right `category` from `flowCategories` — what the Flows list files it under: `onboarding` (before use), `authentication` (sign-in, sign-up, codes), `search`, `checkout` (paying, booking, plans), `creation` (making or sharing something), `settings` (changing settings or the account), otherwise `discovery` (browsing and viewing).

Also check the app itself: its `appName` (the real product name, correctly written) and `tagline` (a true one-line description of what the app does — not a guess from its name — short enough that "<name> — <tagline>" is at most 55 characters, so the app page title stays within two lines: "Claude — AI assistant for writing, coding and analysis"), its card pictures (`cardScreens` in `apps.json`): four screens that show the app well — its home and main features, never a splash, loading, permission or error screen. And check the app's `industry` — what the Categories list files the app under — against what the app is; it must be one of `industries`.

## 4. Write the corrections

**Start from the draft.** The package holds `corrections-draft.json`: every finding's fix already written out (`frames` with the moment to swap to), every missed moment as an `add` after the screen it follows (named like that screen — rename it for what it shows), and every contact sheet waiting for its verdict. Each entry is a suggestion: look at its picture, then keep, edit or delete it, or move a missed moment to `skip` with a reason. Add your own fixes (names, types, elements, flows…), remove the `_how`, `_why` and `_see` notes, and save it as `corrections.json`. Apply refuses the draft as it was written.

Write only what must change to `corrections.json` in the package folder:

```json
{
  "screens": [ { "id": "<screen id>", "name": "Name entry", "type": "form", "extraTypes": ["onboarding"], "elements": ["text-field", "button", "keyboard"], "tags": ["first-run"], "style": ["light"] } ],
  "flows":   [ { "id": "<flow id>", "name": "Taking meeting notes", "parent": "<flow id or null>", "category": "creation", "order": ["<screen id>", "<screen id>"] } ],
  "moves":   [ { "screen": "<screen id>", "from": "<flow id>", "to": "<flow id>" } ],
  "merges":  [ { "from": "<flow id>", "into": "<flow id>" } ],
  "remove":  [ "<screen id>" ],
  "frames":  [ { "id": "<screen id>", "at": 101.1 } ],
  "add":     [ { "after": "<screen id>", "at": 37, "name": "Verification code entry", "type": "login", "extraTypes": ["error"] } ],
  "skip":    [ { "at": 12.75, "why": "typing" } ],
  "confirm": [ { "key": "picture:3f2a…", "why": "a toast that is gone once the page settles" } ],
  "sheets":  [ { "sheet": 1, "see": "splash, sign-in options, email entry, code entry empty and with an error" } ],
  "checked": [ { "id": "<screen id>", "see": "code boxes empty, keyboard up" } ],
  "app":     { "name": "Zomato", "tagline": "Food delivery and dining out", "industry": "food", "cardScreens": ["<screen id>", "<screen id>", "<screen id>", "<screen id>"] },
  "rules": {
    "screenTypes": [ { "name": "Incognito mode", "type": "home" } ],
    "nameFixes":   [ { "from": "Notion Al chat", "to": "Notion AI chat" } ],
    "wordTypes":   [ { "pattern": "\\bincognito\\b", "type": "home" } ]
  }
}
```

Fields are optional; leave out anything unchanged. In `moves`, leave out `from` for a screen no flow lists yet. Every `skip` needs a `why` (`typing`, `pressed`, `bars`, `same` with the kept screen's id, or `picture`), checked by apply — see `screens-review.md`. Use ids exactly as in `screens.json` and `tree`.

**Ids change after an apply.** Applying moves files into the folders of their new flows, and a screen's id comes from its path, so ids and numbers `n` shift. Before writing a second corrections file (for problems left, or pattern work), read the freshly rebuilt `screens.json` again — never reuse ids from before the apply.

When the tree needs a flow that does not exist yet, add it to `flows` with a new id that starts like this version's ids (`<app>-<platform>-versions-<version>-<short-name>`) plus its `name`, `parent` and `category`, then fill it with `moves`. The new id must not be one any flow already has — `tree` lists them. A flow left with no screens is removed. The flows listed in `flows` are shown in the order listed, so list areas in the order the app shows them (Onboarding, Home, …).

**Rules** keep a correction for every later upload, so the same mistake fixes itself next time. Add one when the mistake is a pattern, not a one-off: a screen name the AI keeps mistyping (`screenTypes`), a misread name (`nameFixes`), a word that always means a type (`wordTypes`). Add `"app": "<app>"` to a rule that only holds for this app. Do not add a rule that would be wrong for other apps.

## 5. Apply

Run `check-corrections` (above) first and fix what it lists — an apply that is refused costs a whole round.

```bash
node ios-crawler/crawl.js apply-review --app-id <app> --platform <platform> --version <version> --file ../../motvin-backend/data/reviews/<app>-<platform>-<version>/corrections.json
```

It backs everything up, applies the corrections, lines the folders up with the tree, rebuilds the library, keeps the rules and marks the upload reviewed — the Motvin agent then shows "Reviewed by agent". Once the review check says no problems left, the package's working files (recording, frame strips, sheets, screen list, corrections) are removed by themselves; only the "reviewed" mark and the last backup stay, for undo. To review the same upload again later, build the package first (step 1). If the result is wrong, undo it:

```bash
node ios-crawler/crawl.js undo-review --app-id <app> --platform <platform> --version <version>
```

## 6. Check the patterns

Patterns (Dialogs, Bottom sheets, Welcome carousels…) are not set per screen: the library build puts a screen in a pattern when its type and elements fit that pattern's rule in `motvin-backend/data/inspirations/patterns.json`. Apply fixes the types and elements, and the package is rebuilt, so read `screens.json` again: each screen has `patterns`, and `patterns` at the top lists every pattern with its `match` rule and the screen numbers in it.

Look at each pattern's screens on the contact sheets. When a screen is in a pattern it does not belong to, and its type and elements are right, the rule is too loose — for example bottom sheets in Dialogs, or a cart's +/− buttons in Progress steppers. Then:

1. Copy `patterns.json` to the package folder as `patterns-before.json`.
2. Tighten that pattern's `match`. A rule keeps a screen only when every key fits: `screenTypes` (any of the screen's types), `mainTypes` (its main type only), `elements`, `tags`, `platforms`, `industries` (any one listed), and leaves it out when it has any of `withoutElements` or `withoutTypes`. When the screens that do not fit are a real pattern of their own, add it as a new pattern instead.
3. Rebuild from `motvin-backend`: `npm run build:inspirations`. The rule holds for every app, so compare the pattern's screen count before and after, and make sure good screens of other apps did not drop out.

If a pattern is wrong only because a screen's type or elements are wrong, fix the screen in step 4 instead, not the rule.

## 7. Second check, flow by flow

After the first apply, follow [`audit-motvin.md`](audit-motvin.md): every flow checked on its flow sheet with fresh eyes, fixed or approved — by four agents at once, each with its part from `work-parts.json` (`secondCheck`) — see "Four agents at once" above.

## 7b. Look again (Sonnet reviews only)

When the package holds `look-again.json` (a review on Sonnet), do one more short pass after the second check, in a fresh agent: the list names the spots where a lighter review tends to slip —

- **repeat**: two steps of one flow under one name that look nearly alike, not side by side — the same sequence gone through twice, or a loading state seen again after an error and retry (remove one, keep the first), or two real states (keep both);
- **apart**: a step far in time from the rest of its flow — from another task (move it) or a real return to it (keep);
- **empty**: a screen with very little on it — a blank flash or empty loading page (remove) or a plain real screen (keep);
- **across**: two steps in different flows under one name, alike and seconds apart — one moment kept in two flows (keep it where it belongs, remove the other) or two real steps (keep both);
- **content**: a flow named after what was searched or asked ("Searching for dim sum restaurants") — rename it for the task ("Getting an AI answer");
- **split** (Web Apps and Webs only): Onboarding holds flows of its own — Mobbin shows a web app's Onboarding as one flow: merge the first-run steps into it in video order, make a second sign-in way recorded later a top-level flow, and lift later tasks (managing cookies) to the top level;
- **start**: Onboarding opens on a screen later than its tasks' first screen (a home page with a cookie banner, a welcome tour) — open it on the first screen the app shows (welcome or sign-in) and move the later screens into their own task;
- **siblings**: short flows side by side that differ only by the item ("Previewing a Digicam style" / "Previewing a Kuji style") and show the same screens — one task: merge them into one flow named without the item ("Previewing a style"); two truly different tasks: keep both;
- **flat**: tasks at the top of the tree with no area — group them under the app's areas.
- **two**: a flow whose name has "and" ("Adding connectors and skills") — two tasks: split it in two; one task with "and" in its name: keep.
- **thin**: a task that only passes through the menu to an area page — no step of its own: remove it, or give it its real steps;
- **unrelated**: a short task whose steps show nothing of its name ("Scheduling a task" holding a chat loading and an answer) — rename it for its steps, move them where they belong, or add the missing steps; keep it when name and steps truly match.
- **sections**: a flow that goes back to the app's menu again and again — it walks through several sections; make each section (Projects, Artifacts, Code…) an area of its own and keep the menu once.

For every item, open its pictures (its contact sheet and its frame strip `frames/<n>.png`), decide, fix what needs fixing, and record each decision: `"lookAgain": [ { "key": "<key>", "decision": "keep" or "fixed", "why": "…" } ]`. The final check holds the review until every item is decided — and lists again any item marked fixed that is still there.

## 8. Make sure nothing is left

Apply ends with **review check**. It checks every screen (a name, plain — no number at the end, no "·" or " - ", no trailing "screen"; a real type, not `other`; allowed extra types, elements and tags, within their limits), every flow (stored screens only, a parent that exists, an allowed category, a plain task name, no duplicate names in one place, no flow of only a prompt or loading screen, every screen in exactly one flow) every moment of the recording that matches no screen added or skipped, every finding fixed or confirmed, every screen given a verdict, every flow approved by the second check, and the app (a real category, a logo, a name and tagline, four card pictures that exist and are not a splash, loading, permission or error screen). The same list is in `problems` in every package, and the Motvin agent shows it right after an upload. "no problems left" means done. Otherwise it lists each problem: fix them in a new corrections file and apply again, until it says no problems left. The Motvin agent shows any problem that is left under "Reviewed by agent".

## 9. Report

Tell the admin, briefly and in plain words: how many screens and flows were checked, what was fixed (a short list), which rules were kept, any pattern rule you changed, what the second check found, and that the review check says no problems left. If nothing needed fixing, say so.

