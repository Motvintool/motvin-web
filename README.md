# motvin-web

Next.js host for the Motvin site. Everything is React.

```bash
npm run dev     # http://localhost:3001
npm run build
npm run lint
```

## Route map

| Route | Source |
|---|---|
| `/` | Landing — `src/app/page.tsx` + `src/components/landing/*` |
| `/icons` `/logos` `/illustrations` | `src/app/[category]/page.tsx` → `LibraryView` with the matching `CategoryConfig` |

The three library pages are one dynamic route driven by
`src/lib/config/categories.ts`. Anything genuinely per-category (styles,
grid columns, storage prefix, cluster marks) lives in the config.

## Library architecture

- `src/components/library/*` — the library UI (grid, filters, right panel,
  detail modal, multi-actions strip, saved panel, sidebar, toolbar, tooltip
  runtime, toast, banner).
- `src/hooks/*` — `useLibraryParams`, `useLibraryStats`, `useDisplaySettings`,
  `useSavedCollections`, `useStoredValue`.
- `src/lib/api/*` — API client, load, normalize, stats, categorize.
- `src/lib/render/*` — per-category SVG renderers and the editor pipeline.
- `src/lib/config/categories.ts` — the per-slug configuration.

## Cutover

`LEGACY_ORIGIN` (read in `next.config.ts`) bridges to unported static-site
pages (`/files`, `/login`, `/about-me`, …) and sub-sites (`/MOTVIN`,
`/updates`, the PWA). Set it to wherever the static site is deployed and
every unowned path proxies there; leave it unset locally.
