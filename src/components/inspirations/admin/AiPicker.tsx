'use client';

import { useEffect, useRef, useState } from 'react';
import { aiLabel, refreshAiStatus, saveAiSettings, useAiStatus, type AiProvider, type AiStatus } from '@/lib/inspirations/ingestJobs';
import { CheckIcon, ChevronDownIcon, SparklesIcon } from '../Icons';

/**
 * The model switcher — the pill at the top of a ChatGPT conversation, for
 * the crawler's free AI.
 *
 * The pill says which model is in use and whether it answers: a green dot
 * for connected, red for chosen but unreachable, grey for switched off. It
 * opens a small panel where the admin picks a server (Ollama on this Mac,
 * LM Studio, Gemini, Groq, OpenRouter, or any OpenAI-compatible URL), a
 * model, and a key where one is needed. Saving tests the choice at once and
 * reports back in the same panel, so nobody starts a ten-minute run on a
 * model that is not there.
 */

const OFF = 'off';

type Form = { provider: string; url: string; model: string; key: string; enabled: boolean };

function providerIdOf(status: AiStatus): string {
  if (!status.enabled) return OFF;
  const known = status.providers.find((entry) => entry.id === status.provider);
  return known ? known.id : 'custom';
}

function formFrom(status: AiStatus): Form {
  return {
    provider: providerIdOf(status),
    url: status.configuredUrl,
    model: status.configuredModel ?? status.model ?? '',
    key: '',
    enabled: status.enabled,
  };
}

export function tone(status: AiStatus | null, loading: boolean): 'on' | 'warn' | 'off' | 'error' {
  if (!status) return loading ? 'warn' : 'off';
  if (!status.enabled) return 'off';
  if (status.usable && status.connected) return 'on';
  if (status.usable) return 'warn';
  return 'error';
}

export function statusLine(status: AiStatus | null, loading: boolean): string {
  if (!status) return loading ? 'Checking the AI…' : 'AI status unknown';
  if (!status.enabled) return 'AI is off — names come from the on-device rules';
  if (status.usable && status.connected) return `Connected — ${status.model}${status.vision ? ' reads the screenshots' : ' works from the recognised text'}`;
  if (status.usable) return `${status.model} will be tried — ${status.reason ?? 'the server did not list its models'}`;
  return `Not connected — ${status.reason ?? 'no model answers'}`;
}

export function AiPicker({ admin, align = 'left' }: { admin: boolean; align?: 'left' | 'right' }) {
  const { status, loading, error } = useAiStatus(admin);
  const [open, setOpen] = useState(false);
  // What the admin has typed so far; until they touch anything, the form is
  // whatever is saved.
  const [draft, setDraft] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const form: Form | null = draft ?? (status ? formFrom(status) : null);
  const setForm = (next: Form) => setDraft(next);

  const close = () => {
    setOpen(false);
    setDraft(null);
    setNote(null);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setDraft(null);
        setNote(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setDraft(null);
        setNote(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = tone(status, loading);
  const providers: AiProvider[] = status?.providers ?? [];
  const chosen = form ? providers.find((entry) => entry.id === form.provider) ?? null : null;
  // Models can be listed only for the server that is saved; another server
  // is asked after it is saved.
  const sameServer = Boolean(form && status && form.url.replace(/\/+$/, '') === status.url.replace(/\/+$/, ''));
  const listed = sameServer && status ? status.models : [];

  const pickProvider = (id: string) => {
    if (!form) return;
    if (id === OFF) {
      setForm({ ...form, provider: OFF, enabled: false });
      return;
    }
    const provider = providers.find((entry) => entry.id === id);
    const keepUrl = id === 'custom' && form.provider === 'custom';
    setForm({
      ...form,
      provider: id,
      enabled: true,
      url: provider && !keepUrl ? provider.url || form.url : form.url,
      model: provider?.model && provider.id !== status?.provider ? provider.model : form.provider === id ? form.model : status?.provider === id ? status.configuredModel ?? status.model ?? '' : provider?.model ?? '',
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setNote(null);
    try {
      const next = await saveAiSettings({
        provider: form.provider === OFF ? status?.provider ?? 'ollama' : form.provider,
        url: form.provider === OFF ? status?.configuredUrl ?? '' : form.url,
        model: form.provider === OFF ? form.model : form.model,
        key: form.key || undefined,
        enabled: form.provider !== OFF,
      });
      setNote(statusLine(next, false));
      setDraft(null);
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const check = async () => {
    setSaving(true);
    setNote(null);
    const next = await refreshAiStatus();
    setNote(next ? statusLine(next, false) : 'Could not reach the server.');
    setSaving(false);
  };

  return (
    <div ref={rootRef} className={`ins-ai ${align === 'right' ? 'ins-ai--right' : ''}`}>
      <button
        type="button"
        className={`ins-ai-pill is-${current}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={statusLine(status, loading)}
        disabled={!admin}
      >
        <span className="ins-ai-dot" aria-hidden />
        <SparklesIcon size={14} />
        <span className="ins-ai-pill-text">{aiLabel(status)}</span>
        <ChevronDownIcon size={13} className={`ins-ai-chevron ${open ? 'is-open' : ''}`} />
      </button>

      {open && (
        <div className="ins-ai-pop" role="dialog" aria-label="Choose the AI">
          <div className="ins-ai-pop-head">
            <strong>AI for flow content</strong>
            <span className={`ins-ai-status is-${current}`}>
              <span className="ins-ai-dot" aria-hidden />
              {statusLine(status, loading)}
            </span>
            {error && <span className="ins-admin-err">{error}</span>}
          </div>

          {!form ? (
            <p className="ins-muted">Loading…</p>
          ) : (
            <>
              <ul className="ins-ai-providers" role="radiogroup" aria-label="Server">
                {providers.map((provider) => (
                  <li key={provider.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={form.provider === provider.id}
                      className={`ins-ai-provider ${form.provider === provider.id ? 'is-active' : ''}`}
                      onClick={() => pickProvider(provider.id)}
                    >
                      <span className="ins-ai-provider-name">{provider.name}</span>
                      <span className="ins-ai-provider-hint">{provider.hint}</span>
                      {form.provider === provider.id && <CheckIcon size={14} className="ins-ai-provider-check" />}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.provider === OFF}
                    className={`ins-ai-provider ${form.provider === OFF ? 'is-active' : ''}`}
                    onClick={() => pickProvider(OFF)}
                  >
                    <span className="ins-ai-provider-name">No AI</span>
                    <span className="ins-ai-provider-hint">Names and journeys from the on-device rules only. Fastest.</span>
                    {form.provider === OFF && <CheckIcon size={14} className="ins-ai-provider-check" />}
                  </button>
                </li>
              </ul>

              {form.provider !== OFF && (
                <div className="ins-ai-fields">
                  {form.provider === 'custom' && (
                    <label className="ins-field">
                      <span className="ins-field-label">Server URL</span>
                      <input className="ins-input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="http://localhost:8080/v1" />
                    </label>
                  )}
                  <label className="ins-field">
                    <span className="ins-field-label">Model</span>
                    {listed.length > 0 ? (
                      <select className="ins-input" value={listed.includes(form.model) ? form.model : ''} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                        <option value="">Best available ({status?.model ?? 'auto'})</option>
                        {listed.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="ins-input"
                        value={form.model}
                        onChange={(e) => setForm({ ...form, model: e.target.value })}
                        placeholder={chosen?.model ?? 'model name'}
                      />
                    )}
                  </label>
                  {(chosen?.needsKey || form.provider === 'custom') && (
                    <label className="ins-field">
                      <span className="ins-field-label">API key{chosen?.needsKey ? '' : ' (if the server needs one)'}</span>
                      <input
                        className="ins-input"
                        type="password"
                        autoComplete="off"
                        value={form.key}
                        onChange={(e) => setForm({ ...form, key: e.target.value })}
                        placeholder={status?.hasKey && sameServer ? 'Saved key kept — paste to replace' : 'Paste a key'}
                      />
                    </label>
                  )}
                  {status?.source === 'env' && (
                    <p className="ins-field-hint">
                      The server is pinned by <code>MOTVIN_AI_URL</code> in the environment; a choice here is saved but the environment wins.
                    </p>
                  )}
                </div>
              )}

              {note && <p className={`ins-ai-note is-${tone(status, false)}`}>{note}</p>}

              <div className="ins-ai-actions">
                <button type="button" className="ins-btn ins-btn--primary" disabled={saving} onClick={() => void save()}>
                  {saving ? <span className="ins-spinner" /> : <CheckIcon size={14} />}
                  {form.provider === OFF ? 'Turn AI off' : 'Use this AI'}
                </button>
                <button type="button" className="ins-btn" disabled={saving} onClick={() => void check()}>
                  Check connection
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
