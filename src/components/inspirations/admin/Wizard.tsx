'use client';

import type { ReactNode } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from '../Icons';

/**
 * A step-by-step form for the admin's uploads: the steps along the top, one
 * step's card at a time, and Back / Next underneath. A step already done can
 * be opened again from the bar; the ones ahead open with Next only, once the
 * step before is complete.
 */

export type WizardStep = { id: string; label: string };

export function Wizard({
  steps,
  current,
  onStep,
  title,
  description,
  children,
  canNext,
  nextLabel = 'Next',
  onNext,
  busy = false,
  footerNote,
  hideFooter = false,
}: {
  steps: WizardStep[];
  current: number;
  onStep: (index: number) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Whether this step is complete, so Next (or the last step's action) can be pressed. */
  canNext: boolean;
  /** The last step's action ("Upload 3 screenshots"), else "Next". */
  nextLabel?: string;
  /** The last step's action; on the others Next simply moves on. */
  onNext?: () => void;
  busy?: boolean;
  /** Why Next is off, or what happens next — beside the buttons. */
  footerNote?: ReactNode;
  /** After the last step has run: the card shows its result, no buttons. */
  hideFooter?: boolean;
}) {
  const last = current === steps.length - 1;
  return (
    <div className="ins-wizard">
      <ol className="ins-stepper" aria-label="Steps">
        {steps.map((step, index) => {
          const state = index < current ? 'is-done' : index === current ? 'is-current' : 'is-next';
          return (
            <li key={step.id} className={`ins-stepper-step ${state}`}>
              <button type="button" onClick={() => onStep(index)} disabled={index >= current || busy} aria-current={index === current ? 'step' : undefined}>
                <span className="ins-stepper-dot">{index < current ? <CheckIcon size={13} /> : index + 1}</span>
                <span className="ins-stepper-label">{step.label}</span>
              </button>
              {index < steps.length - 1 && <span className="ins-stepper-line" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <section className="ins-wizard-card" aria-labelledby="ins-wizard-title">
        <header className="ins-wizard-head">
          <h3 id="ins-wizard-title" className="ins-wizard-title">
            {title}
          </h3>
          {description && <p className="ins-wizard-desc">{description}</p>}
        </header>
        <div className="ins-wizard-body">{children}</div>
        {!hideFooter && (
          <footer className="ins-wizard-foot">
            <button type="button" className="ins-btn ins-btn--ghost" onClick={() => onStep(current - 1)} disabled={current === 0 || busy}>
              <ArrowLeftIcon size={14} /> Back
            </button>
            <span className="ins-wizard-note">{footerNote}</span>
            <button type="button" className="ins-btn ins-btn--primary" disabled={!canNext || busy} onClick={() => (last ? onNext?.() : onStep(current + 1))}>
              {busy ? <span className="ins-spinner" aria-hidden /> : null}
              {last ? nextLabel : 'Next'}
              {!last && <ArrowRightIcon size={14} />}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

/** A large radio choice: a title and a line of explanation, picked as one card of a set. */
export function ChoiceCards<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; title: string; desc: string }>; onChange: (next: T) => void; label: string }) {
  return (
    <div className="ins-choice-cards" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={`ins-choice-card ${value === option.id ? 'is-active' : ''}`} onClick={() => onChange(option.id)}>
          <span className="ins-choice-radio" aria-hidden />
          <span className="ins-choice-text">
            <span className="ins-choice-title">{option.title}</span>
            <span className="ins-choice-desc">{option.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** The last step's summary: one line per choice made. */
export function Summary({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="ins-wizard-summary">
      {rows.map(([label, value]) => (
        <div key={label} className="ins-wizard-summary-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
