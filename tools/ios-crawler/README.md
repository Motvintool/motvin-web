# motvin-ios-crawler

Automated screen capture for [Inspirations](../../src/app/inspirations). Point it
at an iOS app you are authorized to capture; it launches the app in a Simulator,
explores what it can reach, captures every unique screen, classifies each one,
and writes the results into the Inspirations store in the shape the manifest
builder already expects.

It does not replace the admin page — it fills it. Captures publish as soon as
they are written; review or remove them at `/inspirations/admin`.

## Authorization

**Only for apps you own, have written permission to capture, or that ship under
a licence permitting it.**

A crawl will not start without an `authorization` block in the app config *and*
an explicit `--authorized` flag. That record is copied into `sources.json`, where
it stays as the stored account of why the capture was permitted.

Note that nothing downstream checks it any more: screens publish as soon as they
are captured. The `authorization` block is a record you are keeping, not a gate
that will stop you.

The crawler stops at access controls rather than working around them. There is
no credential store, no OTP reader, no CAPTCHA solver and no purchase path in
this codebase, and none should be added. When it reaches a sign-in, a paywall, a
permission prompt, a verification code or a payment step, it **captures the
screen** — those are legitimate design references — **records why it stopped, and
abandons that branch**. Going further is a job for an authorized human on the
device.

See [`src/safety.js`](src/safety.js) for the full rule set.

## Two ways in

Capture is the only stage that needs a Simulator. Everything after it —
deduplication, classification, naming, the store writer — is shared, so there
are two front doors onto the same pipeline.

| | `run` (crawl) | `ingest` (folder or video) |
|---|---|---|
| Needs | Xcode + idb | macOS; plus `ffmpeg` for video |
| Reaches | apps you can build as a simulator `.app` | **any** app, including App Store ones |
| Navigation | automatic | you tapped through it yourself |
| Output | identical | identical |

`ingest` exists because the Simulator can never run an App Store binary, and
because a crawl is blocked behind a 12 GB Xcode install. Screenshot an app on a
real iPhone, or screen-record a walk through it, and point `ingest` at the result.

**Video is the higher-yield route.** Three minutes of tapping produces a few
hundred frames, of which perhaps twenty are distinct screens; `selectStableFrames`
keeps a frame only where the UI held still for at least half a second, so
mid-animation and mid-scroll frames never reach the library. The frame kept is
the *last* of each still run, by which point any transition has finished.

### Nothing to fill in

An ingest with no `--app` works the rest out for itself:

| | Where it comes from |
|---|---|
| Which app it is | `identifyApp` in [`src/analyze.js`](src/analyze.js) — three representative screens go to the model together, because one screen is often ambiguous where a home screen plus a settings screen is not |
| Industry, tagline, website | the same call |
| Each screen's name, type, tags, elements, style | the per-screen analysis |
| Flows | `groupIntoFlows` — named journeys, in walk order |
| **Logo** | **nobody — an app's mark does not appear inside its own UI.** This is the one manual step, offered in the admin page after the screens land |

An app already in the library keeps its recorded name and industry, so a second
upload adds screens to it rather than renaming it. With no analyzer reachable,
the app is named after the video file — wrong, but visible and renameable, which
beats refusing the upload.

Tune it with `--fps` (default 2) and `--min-run` (default 2 frames). A fast
walkthrough wants `--fps 4`; a recording full of animation wants `--min-run 3`.

### Reading the video

Two backends, chosen automatically — `node crawl.js doctor` reports which one
you have:

1. **ffmpeg**, when it is on `PATH`. Fastest, reads the most formats.
2. **AVFoundation**, otherwise. [`src/frames.m`](src/frames.m) is compiled on
   first use into `.bin/` by `clang` and reads frames through Apple's own
   video stack.

The fallback is not a nicety. Installing ffmpeg means writing into the Homebrew
prefix, which on a managed Mac belongs to an admin account the person running
this tool does not have — so video ingest would depend on filing a ticket.
AVFoundation and `clang` are both already on any Mac with the Command Line
Tools, which this tool requires anyway. Nothing to install, nobody to ask.

## Requirements

```bash
node crawl.js doctor      # checks all of the below and prints the fix for each gap
```

| Needs | Why | Required for | Install |
|---|---|---|---|
| **Xcode** (not just Command Line Tools) | runs the Simulator | `run` | App Store, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` |
| An iOS Simulator runtime | a device to boot | `run` | Xcode › Settings › Components |
| **idb** | accessibility tree + touch injection — `simctl` cannot tap | `run` | `brew tap facebook/fb && brew install idb-companion` and `pipx install fb-idb` |
| `sips` | image hashing, format conversion | everything | ships with macOS |
| a video reader | pulling frames out of a screen recording | `ingest` from a video only | nothing — see below |
| `ANTHROPIC_API_KEY` | best-quality classification | nothing — there is an offline fallback | see below |

### Analyzers

`--backend` picks how screens are understood. `auto` (the default) uses the API
when a key is set and the on-device path otherwise.

| | Needs | Screen types | Flow names | Descriptions | App name |
|---|---|---|---|---|---|
| `api` | `ANTHROPIC_API_KEY` | all 29 | task-shaped: "Purchasing a ticket" | yes | recognised |
| `local` | nothing | most of the 29 | journey-shaped: "Onboarding", "Login", "Checkout" | no | from the file name |
| `cli` | a signed-in `claude` | as `api` | as `api` | yes | recognised |

The `local` analyzer reads the text off each screenshot with Apple's Vision
framework — on-device, no network, nothing to install — and classifies it with
the rules in [`src/heuristics.js`](src/heuristics.js). A login form says
"Password", a paywall says "free trial", a checkout says "Total"; that is enough
to type most screens correctly and to name the journeys they belong to.

What it cannot do: describe a screen in prose, recognise an app's brand, or say
much about a screen that is mostly imagery with no text. Those need `api`.

`run` (the Simulator crawler) needs `api` or `cli` regardless, because the
analyzer is also what finds the controls to tap.

> **The Simulator only runs simulator builds** (`.app` from Xcode or an internal
> distribution). App Store `.ipa` files are device-only binaries and cannot be
> installed here — which is consistent with this being a tool for apps you are
> authorized to test.

## Use

```bash
cp apps/example.json apps/my-app.json   # fill in bundleId, appPath, authorization
export ANTHROPIC_API_KEY=…
```

Crawl an app in the Simulator:

```bash
node crawl.js run --app apps/my-app.json --authorized --max-screens 30
```

Ingest screenshots taken on a real device:

```bash
node crawl.js ingest --app apps/my-app.json --from ~/Desktop/shots --authorized
```

Ingest a screen recording — tap through the app yourself, the tool finds the
screens. Omit `--app` and the app identifies itself from them:

```bash
node crawl.js ingest --from ~/Desktop/session.mov --authorized --authorized-by "you@example.com"
```

Classify screens already in the store (safe to re-run; skips anything already
classified unless you pass `--overwrite`):

```bash
node crawl.js classify --app-id my-app
```

Other flags — `--max-actions`, `--max-minutes`, `--max-depth`, `--device`,
`--no-publish`, `--no-classify`, `--dry-run`, `--verbose`. Run `node crawl.js`
for the full list.

```bash
node crawl.js self-test   # hashing, dedup, safety, taxonomy, ingest, store writer — no Simulator needed
```

## How a crawl runs

```
boot simulator → install → launch
      ↓
  ┌─ capture frame ────────────────────────┐
  │   wait until two frames are identical  │   src/crawler.js  waitForSettle
  │   perceptual hash + accessibility tree │   src/hash.js  src/device.js
  │   seen before? ──yes──→ record edge ───┼──┐
  │         │ no                           │  │
  │   analyse with Claude                  │  │   src/analyze.js
  │   classify + list tappable controls    │  │
  │   access control? ──yes──→ mark blocked, stop this branch
  │         │ no                           │  │   src/safety.js
  │   filter controls through safety rules │  │
  │   pick the best untried one ───────────┼──┘   src/graph.js  nextAction
  │   tap it                               │
  └────────────────────────────────────────┘
      ↓  no untried controls here
  back-gesture, else relaunch and replay the recorded path
      ↓  nothing reachable left, or a budget ran out
  write graph.json → publish → rebuild manifest
```

Three budgets stop the crawl independently — screens, taps and wall-clock —
because an app with an infinite feed has no natural end.

**Deduplication** uses two signals, because neither is sufficient alone. Two
perceptual hashes (dHash and aHash) must *both* agree before two frames are
called the same screen; a near-miss is rescued only when the visible text also
matches, which is what keeps a scrolled feed from registering as a new screen
every time.

## What a crawl writes

Into the run directory (`runs/<app>-<timestamp>/`):

| File | Contents |
|---|---|
| `frames/` | every raw capture, including the intermediate settle frames |
| `graph.json` | screens, navigation edges, which controls were tried, which were skipped and why |
| `crawl.log` | the run transcript |
| `published.json` | what landed in the store |

Into the Inspirations store (`motvin-backend/data/inspirations/`):

| Path | Contents |
|---|---|
| `screens/ios/<app>/<flow>/<n>.png` | the screen, inside its journey, numbered in walk order |
| `screens/ios/<app>/<flow>/<n>.json` | sidecar the builder reads — name, screenType, tags, elements, style |
| `screens/ios/<app>/<type>[-n].png` | the fallback layout, used when screens could not be grouped |
| `analysis/<screen-id>.json` | the full record: fine-grained screen type, description, flow, navigation edges, blocked reason |
| `apps.json`, `flows.json` | upserted |
| `sources.json` | upserted as **`approved`** — origin recorded, nothing held back |

## Screen types

The crawler classifies into 29 types (`splash`, `onboarding`, `permission`,
`login`, `signup`, `home`, `dashboard`, `feed`, `category`, `search`,
`search_results`, `detail`, `product_detail`, `cart`, `checkout`, `payment`,
`paywall`, `profile`, `settings`, `notifications`, `messages`, `map`, `calendar`,
`media`, `player`, `form`, `confirmation`, `error`, `empty_state`, `other`).

The manifest builder accepts only 13. So each crawler type declares what it
files under:

```js
product_detail:   { publishedAs: 'product',  flow: 'shopping' },
paywall:          { publishedAs: 'pricing',  flow: 'checkout' },
```

The fine-grained type is preserved in `analysis/<screen-id>.json`, so nothing is
lost. **Adding a screen type is one row in [`src/taxonomy.js`](src/taxonomy.js)** —
no other file changes. Widening what the library publishes is a separate change
to `SCREEN_TYPES` in the backend's `manifest.builder.ts`.

## Layout

| File | Role |
|---|---|
| `crawl.js` | CLI |
| `src/crawler.js` | the crawl loop, budgets, recovery |
| `src/graph.js` | screen graph, deduplication, frontier ordering |
| `src/device.js` | simctl + idb — boot, install, screenshot, accessibility, tap |
| `src/analyze.js` | Claude call: classification and tappable controls in one pass |
| `src/hash.js` | dHash / aHash via `sips`, no image dependency |
| `src/safety.js` | blocked screens, forbidden controls, the authorization gate |
| `src/taxonomy.js` | screen types and their mapping to what the builder publishes |
| `src/ingest.js` | the Simulator-free front door: folder or video → store, and `classify` |
| `src/frames.js` | frame extraction — picks ffmpeg or the AVFoundation fallback |
| `src/frames.m` | the fallback reader, compiled on demand into `.bin/` |
| `src/ocr.js` / `src/ocr.m` | on-device text recognition via Vision, same compile-on-demand trick |
| `src/heuristics.js` | the offline rules: text → screen type, screen types → named flows |
| `src/publish.js` | writes into the store, runs the backend's own builder |
| `src/doctor.js` | preflight |
| `src/selftest.js` | everything that does not need a Simulator |

## Known limits

- **One app per run.** No queue, no parallel simulators.
- **Text entry is off.** Search results are reached by tapping suggestions, not
  by typing. Enabling typing safely means deciding what may be typed where, and
  that is a deliberate next step rather than a default.
- **Path replay is best-effort.** Recovering to a deep screen replays recorded
  taps after a relaunch; an app whose home screen shuffles its content will
  diverge, and the crawler settles for wherever it lands.
- **Dedup thresholds are tuned for list-and-detail apps.** A canvas or map app
  with continuously varying pixels will over-report screens. The constants are
  at the top of `src/graph.js`.
- **No logo capture.** `logos/<app>.png` is still a manual drop.
