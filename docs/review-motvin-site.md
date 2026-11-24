<!-- The Motvin review steps for Sites (websites) — the only copy. Agent Upload's Sites items and the "Copy review request" button name this file: "Follow motvin-web/docs/review-motvin-site.md to review <app> site <version>". Web Apps and iOS use review-motvin.md instead. -->

# Review a Motvin website upload (review-motvin-site)

A website upload is not a recording. The Motvin Web Recorder saved each **page** whole, top to bottom, and cut each page into **sections** (navigation, hero, pricing, FAQ, footer…), naming every page and section with a first guess. Your job: look at every page and every section and fix each one's name, then set the app's category and tagline from its landing page. That is the whole review — there are no flows, no frames and nothing to retake.

Work on the one app and version you were given. Any helper or scratch file goes in its review folder, never in `motvin-web` or `motvin-backend` themselves.

Paths (from the `Plugin` folder):
- Review folder: `motvin-backend/data/reviews/<app>-site-<version>/`
- The package: `site-review.json` in that folder, and the pictures in its `look/` folder
- The allowed names: `motvin-web/tools/site-review/site-types.json` (`pages` and `sections`, by `id`)
- Check and apply: `node motvin-web/tools/site-review/apply-site-review.mjs <app> <version>` (run from `Plugin`)

## 1. Read the package

`site-review.json` lists every page: `n`, `url`, `title`, its current `pageType`, two pictures (`look.top`: the first screen of the page, large; `look.overview`: the whole page, small), and its `sections`: `key` (like `1-4`), current `sectionType`, the `heading` found in it, and its picture (`look`).

## 2. Look at every picture

Open every picture with your file reader — every page's `top` and `overview`, and every section. Do not decide from the heading text or the address alone: decide from what the picture shows.

When a site has more than 40 sections, split the pages into up to four parts and start **one agent per part, all in one single message**; each agent opens its own pages' pictures and returns its entries. Wait for every agent before going on.

## 3. Decide each page

- **Its type** (`pageType`, one id from `site-types.json` `pages`): what the page is — a landing page is the site's home, a pricing page shows plans and prices, and so on. The address helps (`/pricing`) but the picture decides: a `/about-us` address that shows "Page not found" is `not-found`.
- **A page with its own name** (`customName` in the package — typed in the recorder because no type fitted, like "Integrations Hub") keeps that name: still give it the closest `pageType` from the list (`other` when none is close).
- **Remove it** (`"remove": true`) when it is not a real page of the site: a 404, a sign-in wall or captcha covering the page, a blank or broken capture, or the same page captured twice (keep the better one).
- **A verdict**: a short sentence in your own words saying what the page shows ("Pricing page: three plan cards with monthly prices, comparison table, FAQ").

## 4. Decide each section

- **Its type** (`sectionType`, one id from `site-types.json` `sections`), by what it shows:
  - `navigation` — the top bar with the logo and menu · `nav-menu` — one of the header's menus opened (Products, Solutions…), captured over the top of the page · `hero` — the first big block: headline, short text, main buttons
  - `logos` — a row of customer or partner logos · `features` — what the product does, in cards, columns or rows
  - `how-it-works` — numbered steps · `stats` — big numbers · `testimonials` — quotes, reviews, customer stories
  - `pricing` — plans or prices · `comparison` — a table comparing plans or products · `faq` — questions and answers
  - `team` — people · `blog` — article cards · `cta` — a short block asking the visitor to sign up or book a demo
  - `contact` — a contact form or details · `footer` — the bottom links block · `content` — anything else (long text, legal copy)
- **Remove it** (`"remove": true`) when it is no use as an example: empty or nearly blank, a thin strip or spacer, a cookie banner or popup, or a repeat of the section just before it.
- **The header, its menus and the footer repeat on every page.** Keep each one once — on the first page that has it — and remove the copy on every later page (same type and same heading: the same navigation bar, the same "Products menu", the same footer). Keep a later copy only when it really looks different, and say how in `"differs"` ("Pricing page header has a plan switcher instead of the menus").
- **A verdict**: what you see, in a short sentence of its own for each section ("Three testimonial cards with photos and company logos") — never one sentence pasted onto several sections.

## 5. Decide the app's category and tagline

`site-review.json` has the app's current facts in `appInfo` (`name`, `industry`, `tagline`, `website`); a new website comes in as `saas` with no tagline. Decide both from the **landing page** (its hero and what the product sections say):

- **`industry`**: one id from `industries` in `site-review.json` — what the product is for. A payroll or HR platform is `saas`, a bank or card is `fintech`, a course site is `education`, an online shop is `ecommerce`, an AI assistant or model is `ai`. Keep the current one when it already fits.
- **`tagline`**: one short line saying what the product is, in the style of the library's other apps ("Online design and publishing with templates", "Global payroll and HR for distributed teams"): 3 words or more and **at most 45 characters** (it shows on two lines beside the app's name, like Canva's 43), no full stop at the end, no marketing ("the best", "#1"). Keep the current one when it already says it well.

## 6. Write corrections.json and apply

Write `corrections.json` in the review folder with **every** page and section, changed or not:

```json
{
  "app": { "industry": "saas", "tagline": "Global payroll and HR for distributed teams" },
  "pages": {
    "1": { "pageType": "landing", "verdict": "Home page: hero with headline and two buttons, product sections, FAQ" },
    "3": { "remove": true, "verdict": "A 404 page saved by mistake, not a real page" }
  },
  "sections": {
    "1-1": { "sectionType": "navigation", "verdict": "Top bar with logo, five menus and Book a demo" },
    "1-9": { "sectionType": "testimonials", "verdict": "Customer quotes from Lovable and Zapier with results" },
    "1-14": { "remove": true, "verdict": "A thin empty strip between two sections" }
  }
}
```

A removed page takes its sections with it; you need not list them. Then run:

```bash
node motvin-web/tools/site-review/apply-site-review.mjs <app> <version>
```

## 6b. Look again, with fresh eyes

When everything above is complete, the check lists the spots where a review tends to slip, in `look-again.json` in the review folder, and holds the review until each is decided — as the iOS and Web App review does:

- **changed**: a page or section whose type you changed from the recorder's first guess — which is it really?
- **heading**: a section whose heading reads like another type ("Frequently asked questions" kept as `content`) — which is it?
- **removed**: a page or section you removed (other than a repeated header, menu or footer) — truly no use, or a real one to keep?

Start **one fresh agent** for this pass: it opens the picture named in each item (`look`), decides, changes `corrections.json` where it was wrong, and records every decision:

```json
"lookAgain": [
  { "key": "1-8", "decision": "keep", "why": "One big statement with no cards, so content is right" },
  { "key": "2-6", "decision": "fixed", "why": "Questions with answers, so it is faq, not content" }
]
```

`keep` needs a reason; `fixed` needs the change made in `pages` or `sections` too — the check lists again any item said fixed that is unchanged. Then run the check again.

It refuses to apply while anything is missing — no `app` entry, a category not in the list, a tagline that is not one short line, a page or section with no entry, a type that is not in the list, a verdict of fewer than four words, the same verdict on three or more sections, a header, menu or footer kept again on a later page without `"differs"`, an item on the look-again list not decided — and lists each one. It also saves the site's address (from its landing page) when the app has none. Fix them in `corrections.json` and run it again. When it prints **`review check: no problems left`**, the names are in the library and the review is done. Finish only then.

## 7. Report

Say in a few lines how many pages and sections you checked, what you renamed and what you removed, and the category and tagline you set.
