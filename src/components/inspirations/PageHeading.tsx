import type { ReactNode } from 'react';

/**
 * Page title row. Deliberately compact — the gallery must start within the
 * first viewport, so this never grows into a hero. Counts live in the filter
 * toolbar's "Showing N" readout rather than up here.
 */
export function PageHeading({
  title,
  eyebrow,
  actions,
  keep = false,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Stays on narrower windows, where page headings are otherwise hidden (its actions are needed there). */
  keep?: boolean;
}) {
  return (
    <header className={`ins-pagehead${keep ? ' ins-pagehead--keep' : ''}`}>
      <div className="ins-pagehead-text">
        {eyebrow && <div className="ins-eyebrow">{eyebrow}</div>}
        <h1 className="ins-title">{title}</h1>
      </div>
      {actions && <div className="ins-pagehead-actions">{actions}</div>}
    </header>
  );
}
