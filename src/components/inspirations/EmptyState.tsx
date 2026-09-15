import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Quiet empty state — one line of copy and a single next step. Used for
 * no-results, empty saved lists and empty collections.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  icon?: ReactNode;
}) {
  return (
    <div className="ins-empty" role="status">
      {icon && <div className="ins-empty-icon">{icon}</div>}
      <p className="ins-empty-title">{title}</p>
      {description && <p className="ins-empty-desc">{description}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className="ins-btn ins-btn--secondary">
            {action.label}
          </Link>
        ) : (
          <button type="button" className="ins-btn ins-btn--secondary" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
