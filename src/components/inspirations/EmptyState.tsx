import Link from 'next/link';
import type { ReactNode } from 'react';
import { PlayEmpty } from './PlayEmpty';

/**
 * Quiet empty state — one line of copy and a single next step. Used for
 * no-results, empty saved lists and empty collections. With `play`, for
 * when a search or filter found nothing (or a page doesn't exist), it is
 * the playful one instead (PlayEmpty), and `icon` is not shown.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  play = false,
}: {
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  icon?: ReactNode;
  play?: boolean;
}) {
  if (play) return <PlayEmpty title={title} description={description} action={action} />;

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
