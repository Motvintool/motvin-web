'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { adminApi, type AdminState } from '@/lib/inspirations/admin';
import { invalidateInspirationsCache } from '@/lib/inspirations/api';
import { DEFAULT_FRESHNESS } from '@/lib/inspirations/appFreshness';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { CheckIcon } from '../Icons';

/** Longest a tag can last, matching the backend's limit. */
const MAX_DAYS = 365;

type Draft = { newDays: string; updatedDays: string };

const toDraft = (days: { newDays: number; updatedDays: number }): Draft => ({
  newDays: String(days.newDays),
  updatedDays: String(days.updatedDays),
});

/** A whole number of days in range, or null. */
function parseDays(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n <= MAX_DAYS ? n : null;
}

/**
 * General settings for the whole library — they apply to every visitor, so
 * they live in the store (settings.json) rather than in this browser. Each
 * section saves on its own. The first is how long app cards keep their
 * "Latest" and "Updated" tags.
 */
export function SettingsPanel({
  state,
  busy,
  run,
}: {
  state: AdminState;
  busy: boolean;
  run: (action: () => Promise<unknown>, onDone?: () => void) => Promise<boolean>;
}) {
  const { user } = useAuth();
  const saved = state.settings?.freshness ?? DEFAULT_FRESHNESS;
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  // Pick up a save made elsewhere (the assistant, another tab) when this form hasn't been touched.
  const [savedFor, setSavedFor] = useState(saved);
  const [touched, setTouched] = useState(false);
  if (saved !== savedFor) {
    setSavedFor(saved);
    if (!touched) setDraft(toDraft(saved));
  }

  const newDays = parseDays(draft.newDays);
  const updatedDays = parseDays(draft.updatedDays);
  const valid = newDays !== null && updatedDays !== null;
  const changed = valid && (newDays !== saved.newDays || updatedDays !== saved.updatedDays);

  const save = () => {
    if (!valid) return;
    void run(
      async () => {
        const result = await adminApi.saveSettings({ freshness: { newDays, updatedDays } });
        // App cards read settings through the public API's cache; drop it so they show the new tags now.
        invalidateInspirationsCache();
        return result;
      },
      () => setTouched(false),
    );
  };

  const field = (key: keyof Draft, label: string, hint: string) => (
    <label className="ins-field ins-settings-field">
      <span className="ins-field-label">{label}</span>
      <span className="ins-settings-days">
        <input
          className="ins-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_DAYS}
          step={1}
          value={draft[key]}
          aria-invalid={parseDays(draft[key]) === null}
          onChange={(e) => {
            const value = e.target.value;
            setTouched(true);
            setDraft((d) => ({ ...d, [key]: value }));
          }}
        />
        <span className="ins-settings-unit">days</span>
      </span>
      <span className="ins-field-hint">{hint}</span>
    </label>
  );

  return (
    <div className="ins-admin-panel">
      <p className="ins-field-hint">
        General settings for the whole library. They apply to every visitor, and the app pages update as soon as you
        save.
      </p>

      <section className="ins-admin-form">
        <p className="ins-admin-form-title">Account</p>
        <p className="ins-settings-account">
          <CheckIcon size={14} /> Signed in as <strong>{user?.email}</strong>
        </p>
        <p className="ins-field-hint">
          Changes in Library admin write to the store in motvin-backend.{' '}
          <Link href={INSPIRATIONS_ROUTES.explore} className="ins-link">
            View the public library
          </Link>
        </p>
      </section>

      <form
        className="ins-admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="ins-admin-form-title">App tags</p>
        <p className="ins-field-hint">
          How long an app card shows its tag, counted from the date of the version that earned it. 0 shows it on that
          day only.
        </p>

        <div className="ins-admin-row">
          {field('newDays', 'Latest', 'After an app’s first version.')}
          {field('updatedDays', 'Updated', 'After an older app gets a newer version.')}
        </div>

        {!valid && <p className="ins-admin-err">Use a whole number of days from 0 to {MAX_DAYS}.</p>}

        <div className="ins-admin-actions">
          <button type="submit" className="ins-btn ins-btn--primary" disabled={!changed || busy}>
            <CheckIcon size={15} /> Save
          </button>
          {touched && changed && (
            <button
              type="button"
              className="ins-btn ins-btn--ghost"
              disabled={busy}
              onClick={() => {
                setDraft(toDraft(saved));
                setTouched(false);
              }}
            >
              Reset
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
