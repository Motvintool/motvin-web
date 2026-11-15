'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useAuth } from '@/components/shared/AuthProvider';
import { submitAppRequest, updateMyRequest, type MyRequest } from '@/lib/firebase/appRequests';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { Platform } from '@/lib/inspirations/types';
import { AppleIcon, CheckIcon, CloseIcon, PlusIcon, WebAppIcon, WebIcon } from './Icons';
import { useSheet } from './useSheet';
import { useAsync } from './useAsync';
import { AppLogo } from './AppLogo';
import { inspirationsApi } from '@/lib/inspirations/api';

/**
 * "Request an app": the popup behind the search modal's "Request app" link. It looks like the
 * search modal (same frosted card and backdrop) and collects what we need to add an app —
 * its name, platform, optionally a link, a note and an email to tell them when it's in.
 * Submissions are saved in Firestore (lib/firebase/appRequests.ts); the admin Requests tab counts repeats.
 */

const PLATFORMS: { value: Platform; Icon: typeof AppleIcon }[] = [
  { value: 'ios', Icon: AppleIcon },
  { value: 'webapp', Icon: WebAppIcon },
  { value: 'web', Icon: WebIcon },
];

/**
 * Above the title: two apps already in the library on the chosen platform, fanned, and an empty slot
 * beside them — "yours goes here". Switching the platform deals that platform's apps.
 */
function RequestLogos({ platform }: { platform: Platform }) {
  const { data: apps } = useAsync(() => inspirationsApi.listApps(), 'request-logos');
  const shown = (apps ?? []).filter((a) => a.logo && a.platforms.includes(platform)).slice(0, 2);
  // A platform with no apps yet (once the list has loaded) keeps the stack's shape with two plain tiles
  // showing its own icon, rather than borrowing another platform's logos.
  const Icon = PLATFORMS.find((p) => p.value === platform)?.Icon ?? AppleIcon;
  const blanks = apps && shown.length === 0 ? 2 : 0;
  return (
    <span className="ins-request-logos" aria-hidden>
      {shown.map((app, i) => (
        <span key={`${platform}-${app.id}`} className="ins-request-logo" style={{ animationDelay: `${i * 50}ms` }}>
          <AppLogo app={app} size={44} />
        </span>
      ))}
      {Array.from({ length: blanks }, (_, i) => (
        <span key={`${platform}-blank-${i}`} className="ins-request-logo is-blank" style={{ animationDelay: `${i * 50}ms` }}>
          <Icon size={20} />
        </span>
      ))}
      <span className="ins-request-slot">
        <PlusIcon size={20} strokeWidth={2.2} />
      </span>
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function subscribeNever() {
  return () => {};
}

export function RequestAppModal({
  initialName,
  initialPlatform,
  existing,
  onRequestsPage = false,
  onClose,
}: {
  initialName: string;
  initialPlatform: Platform;
  /** Editing one of the person's own requests instead of sending a new one. */
  existing?: MyRequest;
  /** Opened from the Requests page itself, so the "See my requests" link would lead nowhere new. */
  onRequestsPage?: boolean;
  onClose: () => void;
}) {
  // Signed in: the email field starts filled with their account email (they
  // can still change or clear it).
  const { user } = useAuth();
  const accountEmail = user && !user.isAnonymous ? user.email : '';
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(existing?.appName ?? initialName);
  const [platform, setPlatform] = useState<Platform>(PLATFORMS.some((p) => p.value === existing?.platform) ? (existing!.platform as Platform) : initialPlatform);
  const [link, setLink] = useState(existing?.link ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  // null until they type: shows the account email, which may arrive a moment
  // after the form opens.
  const [email, setEmail] = useState<string | null>(existing?.email ?? null);
  const emailValue = email ?? accountEmail ?? '';
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<'editing' | 'sending' | 'sent'>('editing');
  const [error, setError] = useState('');
  const [step, setStep] = useState<0 | 1>(0);
  const linkRef = useRef<HTMLInputElement>(null);

  const next = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('Tell us the app’s name.');
      nameRef.current?.focus();
      return;
    }
    setError('');
    setStep(1);
    requestAnimationFrame(() => linkRef.current?.focus());
  };

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nameRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state === 'sending') return;
    if (name.trim().length < 2) {
      setError('Tell us the app’s name.');
      nameRef.current?.focus();
      return;
    }
    setError('');
    setState('sending');
    try {
      const fields = {
        appName: name.trim(),
        platform,
        link: link.trim() || undefined,
        note: note.trim() || undefined,
        email: emailValue.trim() || undefined,
      };
      if (existing) await updateMyRequest(existing.id, fields);
      else await submitAppRequest({ ...fields, website: trap });
      setState('sent');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'We couldn’t send that just now — please try again.');
      setState('editing');
    }
  };

  // On a phone, a sheet: its top drags up to fill the screen, down to settle or close.
  const { ref: sheetRef, className: sheetClass, dragProps: sheetDrag, handle: sheetHandle } = useSheet(onClose);
  if (!mounted) return null;

  return createPortal(
    <div className="ins-portal ins-search-overlay ins-sheet-overlay" onClick={onClose}>
      <div ref={sheetRef} className={`ins-search-modal ins-request ${sheetClass}`} {...sheetDrag} role="dialog" aria-modal="true" aria-label="Request an app" onClick={(e) => e.stopPropagation()}>
        {sheetHandle}
        <button type="button" className="ins-request-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>

        {state === 'sent' ? (
          <div className="ins-request-done" role="status">
            {/* Success: a green circle in a soft halo, its tick drawing itself in. */}
            <span className="ins-request-success" aria-hidden>
              {/* Six small dots that burst out once, around the circle. */}
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} style={{ ['--a' as string]: `${i * 60 + 30}deg` }} />
              ))}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path className="ins-request-tick" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h3>{existing ? 'Saved' : 'Request sent'}</h3>
            <p className="ins-request-done-app">
              <strong>{name.trim()}</strong>
              <span>{PLATFORM_LABEL[platform]}</span>
            </p>
            <p>
              {existing
                ? 'Your request has been updated.'
                : emailValue.trim()
                  ? 'The most-requested apps go in first. We’ll email you when it’s added.'
                  : 'The most-requested apps go in first.'}
            </p>
            <div className="ins-request-buttons">
              {/* Where to find it again; the same page "Request apps" opens from now on. */}
              {!onRequestsPage && (
                <Link href={INSPIRATIONS_ROUTES.settingsRequests} className="ins-request-cancel" onClick={onClose}>
                  See my requests
                </Link>
              )}
              <button type="button" className="ins-request-send" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="ins-request-form" onSubmit={step === 0 ? next : submit} noValidate>
            <RequestLogos platform={platform} />
            <h2>{step === 0 ? (existing ? 'Edit request' : 'Request an app') : 'Anything else?'}</h2>
            <p className="ins-request-intro">
              {step === 0
                ? existing
                  ? 'Update the details of your request.'
                  : 'Tell us which app you’d like to see. We add popular requests.'
                : 'All optional — a link or short note helps us capture it.'}
            </p>

            <div className="ins-request-body" key={step}>
              {step === 0 ? (
                <>
                  <label className="ins-request-field">
                    <span>App name</span>
                    <input ref={nameRef} aria-required="true" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Notion" autoComplete="off" />
                  </label>

                  <div className="ins-request-field">
                    <span id="ins-request-platform">Platform</span>
                    <div className="ins-request-platforms" role="radiogroup" aria-labelledby="ins-request-platform">
                      {PLATFORMS.map(({ value, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={platform === value}
                          className={platform === value ? 'is-active' : ''}
                          onClick={() => setPlatform(value)}
                        >
                          <Icon size={16} />
                          {PLATFORM_LABEL[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label className="ins-request-field">
                    <span>Link</span>
                    <input ref={linkRef} value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} placeholder="App Store, Google Play or website link" inputMode="url" autoComplete="off" />
                  </label>

                  <label className="ins-request-field">
                    <span>What should we look at?</span>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="A flow, a screen, or why you’d like it here" />
                  </label>

                  <label className="ins-request-field">
                    <span>
                      Email
                      <span className="ins-request-help">
                        {/* Shown on hover (or keyboard focus). Inside the label, so a click
                            is kept from moving the cursor into the input. */}
                        <button
                          type="button"
                          aria-label="Why we ask for your email"
                          aria-describedby="ins-request-email-help"
                          onClick={(e) => e.preventDefault()}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                            <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M6.3 6.2a1.75 1.75 0 1 1 2.45 1.6c-.5.22-.75.6-.75 1.1v.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <circle cx="8" cy="11.35" r=".85" fill="currentColor" />
                          </svg>
                        </button>
                        <span id="ins-request-email-help" role="tooltip" className="ins-request-help-tip">
                          We’ll tell you when it’s added.
                        </span>
                      </span>
                    </span>
                    <input type="email" value={emailValue} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="you@example.com" autoComplete="email" />
                  </label>
                </>
              )}

              {/* Honeypot: invisible to people, tempting to bots. Anything typed here is discarded. */}
              <input
                className="ins-request-trap"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                name="website"
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
              />

              {error && (
                <p className="ins-request-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="ins-request-actions">
              <div className="ins-request-steps" aria-label={`Step ${step + 1} of 2`}>
                <span className={`ins-request-dots${step === 1 ? ' is-joined' : ''}`}>
                  <i className={step === 0 ? 'is-on' : 'is-done'} />
                  <i className={step === 1 ? 'is-on' : ''} />
                </span>
                <span>Step {step + 1} of 2</span>
              </div>
              <div className="ins-request-buttons">
                {step === 1 && (
                  <button type="button" className="ins-request-cancel" onClick={() => { setError(''); setStep(0); }}>
                    Back
                  </button>
                )}
                <button type="submit" className="ins-request-send" disabled={state === 'sending'}>
                  {step === 0 ? 'Continue' : state === 'sending' ? (existing ? 'Saving…' : 'Sending…') : existing ? 'Save changes' : 'Send request'}
                  {step === 0 && <ArrowIcon />}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
