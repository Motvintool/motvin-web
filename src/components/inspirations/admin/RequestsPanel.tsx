'use client';

import { useCallback, useEffect, useState } from 'react';
import { deleteAppRequestGroup, listAppRequests, type AppRequestGroup } from '@/lib/firebase/appRequests';
import { PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { TrashIcon } from '../Icons';

/**
 * What visitors have asked for, most-requested first. Each row folds every
 * request for the same app together; the notes and emails people left are
 * under the row so the admin can see why, and reply when it is added.
 */

function ago(at: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function RequestsPanel() {
  const [requests, setRequests] = useState<AppRequestGroup[] | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await listAppRequests());
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load the requests.');
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const remove = async (group: AppRequestGroup) => {
    try {
      await deleteAppRequestGroup(group.ids);
      setRequests((current) => current?.filter((r) => r !== group) ?? null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete that request.');
    } finally {
      setConfirming(null);
    }
  };

  if (!requests) return <p className="ins-muted ins-admin-status">Loading requests…</p>;

  return (
    <div className="ins-reqlist">
      {error && <p className="ins-admin-err" role="alert">{error}</p>}
      {requests.length === 0 && !error && <p className="ins-muted ins-admin-status">No app requests yet.</p>}
      {requests.map((request) => {
        const notes = request.entries;
        return (
          <article key={request.ids[0]} className="ins-reqrow">
            <span className="ins-reqrow-count" title={`${request.count} request${request.count === 1 ? '' : 's'}`}>
              {request.count}
            </span>
            <div className="ins-reqrow-main">
              <h3>
                {request.appName} <span>{PLATFORM_LABEL[request.platform] ?? request.platform}</span>
              </h3>
              {request.link && (
                <a href={request.link} target="_blank" rel="noreferrer noopener">
                  {request.link.replace(/^https?:\/\//, '')}
                </a>
              )}
              {notes.length > 0 && (
                <ul>
                  {notes.map((entry, index) => (
                    <li key={index}>
                      <b className="ins-reqrow-by">{entry.by}</b>
                      {entry.note && <span>{entry.note}</span>}
                      {entry.email && <a href={`mailto:${entry.email}`}>{entry.email}</a>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="ins-reqrow-when">{ago(request.lastRequestedAt)}</span>
            {confirming === request.ids[0] ? (
              <span className="ins-reqrow-confirm">
                <button type="button" onClick={() => void remove(request)}>Delete</button>
                <button type="button" onClick={() => setConfirming(null)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label={`Delete ${request.appName}`} onClick={() => setConfirming(request.ids[0])}>
                <TrashIcon size={16} />
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
