import type { ReactNode } from 'react';

/**
 * Page title row. Deliberately compact — the gallery must start within the
 * first viewport, so this never grows into a hero.
 */
export function PageHeading({
  title,
  eyebrow,
  description,
  actions,
  count,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  count?: string;
}) {
  return (
    <header className="ins-pagehead">
      <div className="ins-pagehead-text">
        {eyebrow && <div className="ins-eyebrow">{eyebrow}</div>}
        <h1 className="ins-title">
          {title}
          {count && <span className="ins-title-count">{count}</span>}
        </h1>
        {description && <p className="ins-desc">{description}</p>}
      </div>
      {actions && <div className="ins-pagehead-actions">{actions}</div>}
    </header>
  );
}
