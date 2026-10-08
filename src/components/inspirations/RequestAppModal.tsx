'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { submitAppRequest, updateMyRequest, type MyRequest } from '@/lib/firebase/appRequests';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { Platform } from '@/lib/inspirations/types';
import { AndroidIcon, AppleIcon, CheckIcon, CloseIcon, WebIcon } from './Icons';

/**
 * "Request an app": the popup behind the search modal's "Request app" link. It looks like the
 * search modal (same frosted card and backdrop) and collects what we need to add an app —
 * its name, platform, optionally a link, a note and an email to tell them when it's in.
 * Submissions are saved in Firestore (lib/firebase/appRequests.ts); the admin Requests tab counts repeats.
 */

const PLATFORMS: { value: Platform; Icon: typeof AppleIcon }[] = [
  { value: 'ios', Icon: AppleIcon },
  { value: 'android', Icon: AndroidIcon },
  { value: 'web', Icon: WebIcon },
];

function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c.6 4.8 2.2 7.4 5.2 8.8L22 12l-4.8 1.2C14.200 14.600 12.600 17.200 12 22c-.6-4.800-2.200-7.400-5.200-8.800L2 12l4.800-1.200C9.800 9.400 11.400 6.800 12 2z" />
    </svg>
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
  onClose,
}: {
  initialName: string;
  initialPlatform: Platform;
  /** Editing one of the person's own requests instead of sending a new one. */
  existing?: MyRequest;
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(existing?.appName ?? initialName);
  const [platform, setPlatform] = useState<Platform>(existing?.platform ?? initialPlatform);
  const [link, setLink] = useState(existing?.link ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
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
        email: email.trim() || undefined,
      };
      if (existing) await updateMyRequest(existing.id, fields);
      else await submitAppRequest({ ...fields, website: trap });
      setState('sent');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'We couldn’t send that just now — please try again.');
      setState('editing');
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="ins-search-overlay" onClick={onClose}>
      <div className="ins-search-modal ins-request" role="dialog" aria-modal="true" aria-label="Request an app" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ins-request-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>

        {state === 'sent' ? (
          <div className="ins-request-done" role="status">
            <span className="ins-request-badge ins-request-badge--done" aria-hidden>
              <CheckIcon size={24} />
            </span>
            <h3>{existing ? 'Saved.' : 'Thanks — we’ve got it.'}</h3>
            <p>
              <strong>{name.trim()}</strong> ({PLATFORM_LABEL[platform]}){' '}
              {existing ? 'has been updated.' : 'is on our list. The most-requested apps are added first.'}
            </p>
            <button type="button" className="ins-request-send" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="ins-request-form" onSubmit={step === 0 ? next : submit} noValidate>
            <span className="ins-request-badge" aria-hidden>
              <SparkIcon />
            </span>
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
                    <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Notion" autoComplete="off" />
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
                    <span>
                      Link <em>optional</em>
                    </span>
                    <input ref={linkRef} value={link} onChange={(e) => setLink(e.target.value)} maxLength={300} placeholder="App Store, Google Play or website link" inputMode="url" autoComplete="off" />
                  </label>

                  <label className="ins-request-field">
                    <span>
                      What should we look at? <em>optional</em>
                    </span>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="A flow, a screen, or why you’d like it here" />
                  </label>

                  <label className="ins-request-field">
                    <span>
                      Email <em>optional — we’ll tell you when it’s added</em>
                    </span>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="you@example.com" autoComplete="email" />
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
