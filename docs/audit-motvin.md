<!-- The second check of a Motvin review — step 7 of review-motvin.md. Run it with fresh eyes: in separate agents when the tool can start them (a group of flow sheets each, all at once), otherwise after re-reading this file, as if you had not done the first pass. -->

# Second check of a Motvin review (audit-motvin)

The first pass fixed the screens. This pass checks that every **flow** now reads right from start to end, the way a person using the app would see it, and catches what the first pass missed. Be strict: approve a flow only when you would put it in front of a designer as it is.

The package folder is `motvin-backend/data/reviews/<app>-<platform>-<version>/`. After the first apply it holds a fresh `screens.json` (read the ids again — they changed), `problems`, `flow-sheets.json` and one `flow-<k>.png` per flow: the flow's steps left to right, each with its step number, `#n`, name, type and time.

Report the step first, from `motvin-web/tools`:

```bash
node ios-crawler/crawl.js review-progress --app-id <app> --platform <platform> --version <version> --step 7
```

Four agents share this step when the tool can start them: each takes its own work file, `work-check-<n>.json` (its flows, their steps' ids, names and types, and its flow sheets), reads only that — not `screens.json` — checks only those flows, and returns its fixes and `audit` approvals instead of applying; the agent that started them writes one corrections file and applies it.

## For every flow sheet, check

1. **Order:** the steps follow each other as a person goes through them, with no step back in time. Fix with the flow's `order`.
2. **Nothing missing:** between two steps, nothing a person would see is skipped: an empty field before typing, an error or validation line, a loading state on the real page, a success or done state, an empty state, the keyboard opening, a sheet, menu, picker or confirmation. If one is missing and the recording is kept, add it with `add` (use the frame strips `frames/<n>.png` and `missed` to find the moment).
3. **Nothing extra:** no two steps showing the same thing, no half-typed field, no blank page, no step from another task. Fix with `remove`, or move it to its flow with `moves`.
4. **Every picture is final:** settled (no sheet sliding, keyboard rising, dialog half shown), fully loaded, sharp and not dim; the flow's first step is a clean start. Fix with `frames`.
5. **Names read as a story:** each step's name says what that step is, and look-alike steps share a name. The flow's name is one task with an -ing verb, and it sits in the right area.

## Write the result

In a new `corrections.json` in the package folder, put the fixes you found, plus your approval of each flow that needed **no** change:

```json
{
  "audit": [ { "flow": "<flow id>", "ok": true } ],
  "remove": [ "<screen id>" ],
  "frames": [ { "id": "<screen id>", "at": 331.25 } ]
}
```

An approval counts only for a flow this apply leaves exactly as you saw it — or exactly as you say it will be. **Fix and approve in one go:** when you fix a flow by reordering, moving, removing or renaming steps, approve it with the steps it will have afterwards, in order, using the ids as they are now:

```json
"audit": [ { "flow": "<flow id>", "ok": true, "expect": [ "<screen id>", "<screen id>", "<screen id>" ] } ]
```

After the apply, the flow is approved only if it came out exactly so; if not, it is listed to look at again. A flow whose fix swaps a picture (`frames`) or adds a step (`add`) cannot be foreseen — look at its new sheet after the apply and approve it in the next corrections. Then apply as in review-motvin.md step 5. Repeat until the review check says no problems left.

In the report, list what this pass found: if it found nothing in a long upload, look again.

