"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { adminApi, type AdminState } from "@/lib/inspirations/admin";
import {
  inspirationsApi,
  invalidateInspirationsCache,
} from "@/lib/inspirations/api";
import { firstVersionDate, newThisWeek } from "@/lib/inspirations/appFreshness";
import { localDateString } from "@/lib/inspirations/dates";
import { WEBS_PLATFORMS } from "@/lib/inspirations/filters";
import { INSPIRATIONS_ROUTES } from "@/lib/inspirations/routes";
import type { App, Platform, SectionIds } from "@/lib/inspirations/types";
import { AppLogo } from "../AppLogo";
import { onMenuKeyDown, useDismiss } from "../FilterToolbar";
import { ArrowUpIcon, CheckIcon, SearchIcon } from "../Icons";
import { useAsync } from "../useAsync";

/** The two sections the public pages keep apart, each with its own "New this week" list. */
const WEEK_SECTIONS: {
  key: "ios" | "webs";
  label: string;
  platforms: readonly Platform[];
}[] = [
  { key: "ios", label: "Apps (iOS)", platforms: ["ios"] },
  { key: "webs", label: "Webs", platforms: WEBS_PLATFORMS },
];

type Picks = SectionIds;
type WeekChoices = Record<"added" | "order", Picks>;

/**
 * The "New this week" page shows only the apps picked here, for each section apart (an app can be picked in
 * Webs and not in Apps). The admin adds apps from a menu (they go to the top), moves them with the arrows and
 * removes them; Save publishes the lists.
 */
export function WeeklyAppsPanel({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (
    action: () => Promise<unknown>,
    onDone?: () => void,
  ) => Promise<boolean>;
}) {
  const { data: apps, loading } = useAsync(
    () => inspirationsApi.listApps(),
    "apps:all:curated",
  );
  const none: Picks = { ios: [], webs: [] };
  const saved: WeekChoices = state.settings?.newThisWeek ?? {
    added: none,
    order: none,
  };
  const [draft, setDraft] = useState<WeekChoices | null>(null);
  const choices = draft ?? saved;
  // Each section's picks in the order being edited, and the section's other apps to pick from.
  const sections = WEEK_SECTIONS.map((section) => {
    const inSection = (apps ?? []).filter((app) =>
      app.platforms.some((p) => section.platforms.includes(p)),
    );
    const listed = newThisWeek(inSection, choices, section.platforms);
    const others = inSection
      .filter((app) => !listed.includes(app))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ...section, apps: listed, others };
  });
  const changed = draft !== null;

  /** One section's list as it now stands: what gets saved, picks and order alike. */
  const setList = (key: keyof Picks, list: App[]) => {
    const ids = list.map((a) => a.id);
    setDraft({
      added: { ...choices.added, [key]: ids },
      order: { ...choices.order, [key]: ids },
    });
  };
  const listOf = (key: keyof Picks) =>
    sections.find((s) => s.key === key)!.apps;
  const move = (key: keyof Picks, id: string, by: -1 | 1) => {
    const list = [...listOf(key)];
    const at = list.findIndex((a) => a.id === id);
    const to = at + by;
    if (at === -1 || to < 0 || to >= list.length) return;
    [list[at], list[to]] = [list[to], list[at]];
    setList(key, list);
  };
  const save = () =>
    void run(
      async () => {
        const result = await adminApi.saveSettings({ newThisWeek: choices });
        invalidateInspirationsCache();
        return result;
      },
      () => setDraft(null),
    );

  return (
    <div className="ins-admin-panel">
      <form
        className="ins-admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="ins-admin-form-title">New this week page</p>
        <p className="ins-field-hint">
          Pick the apps to show on{" "}
          <Link href={INSPIRATIONS_ROUTES.newThisWeek} className="ins-link">
            New this week
          </Link>
          , in Apps (iOS) and Webs apart. Use the arrows to set the order, then
          Save.
        </p>

        {loading && !apps ? (
          <p className="ins-muted">Loading apps…</p>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="ins-week-section">
              <p className="ins-week-section-title">
                {section.label}{" "}
                <span className="ins-muted">· {section.apps.length}</span>
              </p>
              {section.others.length > 0 && (
                <AddAppMenu
                  apps={section.others}
                  label={section.label}
                  platforms={section.platforms}
                  onPick={(picked) =>
                    setList(section.key, [...picked, ...section.apps])
                  }
                />
              )}
              {!section.apps.length ? (
                <p className="ins-muted">
                  No apps picked yet — the page shows nothing here.
                </p>
              ) : (
                <ol className="ins-week-list">
                  {section.apps.map((app, i) => (
                    <li key={app.id} className="ins-week-row">
                      <div className="ins-protect-app is-on">
                        <AppLogo
                          app={app}
                          size={32}
                          className="ins-protect-app-logo"
                        />
                        <span className="ins-app-option-text">
                          <span>{app.name}</span>
                        </span>
                        <button
                          type="button"
                          className="ins-btn ins-btn--ghost ins-btn--sm"
                          onClick={() =>
                            setList(
                              section.key,
                              section.apps.filter((a) => a.id !== app.id),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <button
                        type="button"
                        className="ins-week-move"
                        aria-label={`Move ${app.name} up`}
                        disabled={i === 0}
                        onClick={() => move(section.key, app.id, -1)}
                      >
                        <ArrowUpIcon size={14} />
                      </button>
                      <button
                        type="button"
                        className="ins-week-move is-down"
                        aria-label={`Move ${app.name} down`}
                        disabled={i === section.apps.length - 1}
                        onClick={() => move(section.key, app.id, 1)}
                      >
                        <ArrowUpIcon size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))
        )}

        <div className="ins-admin-actions">
          <button
            type="submit"
            className="ins-btn ins-btn--primary"
            disabled={!changed || busy}
          >
            <CheckIcon size={15} /> Save
          </button>
          {changed && (
            <button
              type="button"
              className="ins-btn ins-btn--ghost"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Reset
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** How long ago a `YYYY-MM-DD` date was: "Today", "3 days ago", "2 months ago". */
function ageOf(
  id: string | undefined,
  today: string = localDateString(),
): string {
  if (!id) return "No date";
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${id}T00:00:00Z`)) /
      86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.round(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

/**
 * "+ Add an app": a menu of the section's other apps, newest first — each with its logo and how long ago it
 * came to this section — and a search box at the top, the same look as the library's own app menus. Tick any
 * number, then Add.
 */
function AddAppMenu({
  apps,
  label,
  platforms,
  onPick,
}: {
  apps: App[];
  label: string;
  platforms: readonly Platform[];
  onPick: (apps: App[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    setQuery("");
    setTicked([]);
  };
  useDismiss(open, close, ref);
  const dated = apps
    .map((app) => ({ app, first: firstVersionDate(app, platforms) ?? "" }))
    .sort(
      (a, b) =>
        b.first.localeCompare(a.first) || a.app.name.localeCompare(b.app.name),
    );
  const q = query.trim().toLowerCase();
  const shown = q
    ? dated.filter(({ app }) => app.name.toLowerCase().includes(q))
    : dated;
  const toggle = (id: string) =>
    setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <div className="ins-popwrap ins-week-add" ref={ref}>
      <button
        type="button"
        className="ins-btn ins-btn--ghost"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        + Add apps
      </button>
      {open && (
        <div className="ins-popover ins-fmenu ins-week-add-menu">
          <label className="ins-app-search">
            <SearchIcon size={14} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${apps.length} apps`}
              aria-label="Search apps"
            />
          </label>
          <div
            className="ins-week-add-list"
            role="listbox"
            aria-label={`Add apps to ${label}`}
            aria-multiselectable
            onKeyDown={onMenuKeyDown}
          >
            {!shown.length ? (
              <p className="ins-popover-empty">No matching apps</p>
            ) : (
              shown.map(({ app, first }) => {
                const on = ticked.includes(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`ins-fmenu-item ins-week-add-item ${on ? "is-selected" : ""}`}
                    onClick={() => toggle(app.id)}
                  >
                    <span
                      className={`ins-uielements-checkbox ${on ? "is-checked" : ""}`}
                      aria-hidden="true"
                    >
                      {on && <CheckIcon size={12} strokeWidth={3} />}
                    </span>
                    <AppLogo
                      app={app}
                      size={36}
                      className="ins-week-add-logo"
                    />
                    <span className="ins-app-option-text">
                      <span>{app.name}</span>
                      <span className="ins-muted">
                        {ageOf(first || undefined)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="ins-flowtree-menu-footer">
            <button
              type="button"
              className="ins-flowtree-clear"
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ins-flowtree-apply"
              disabled={!ticked.length}
              onClick={() => {
                // In the order they appear in the menu (newest first).
                onPick(
                  dated
                    .filter(({ app }) => ticked.includes(app.id))
                    .map(({ app }) => app),
                );
                close();
              }}
            >
              Add{ticked.length ? ` (${ticked.length})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
