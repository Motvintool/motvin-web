'use client';

import type { FormEvent } from 'react';
import { StatusBanner, type Banner } from './StatusBanner';
import { PublisherForm, type PublisherFields } from './PublisherForm';

/**
 * Publisher section — panel head, auth pill, status banner, gate messages,
 * and the release-note form. Parent owns all state and side effects.
 */

type Props = {
  ready: boolean;
  signedIn: boolean;
  adminAccess: 'unknown' | 'granted' | 'denied';
  authPill: string;
  publisherCopy: string;
  banner: Banner;
  fields: PublisherFields;
  imageFile: File | null;
  previewSrc: string;
  editingId: string | null;
  busy: boolean;
  onFieldChange: <K extends keyof PublisherFields>(key: K, value: PublisherFields[K]) => void;
  onImageFileChange: (file: File | null) => void;
  onClearImage: () => void;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onSizeError: (message: string) => void;
};

export function PublisherPanel({
  ready,
  signedIn,
  adminAccess,
  authPill,
  publisherCopy,
  banner,
  fields,
  imageFile,
  previewSrc,
  editingId,
  busy,
  onFieldChange,
  onImageFileChange,
  onClearImage,
  onSubmit,
  onReset,
  onCancelEdit,
  onDelete,
  onSizeError,
}: Props) {
  const canManage = signedIn && adminAccess === 'granted';

  return (
    <section className="admin-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Publisher</h2>
          <p className="panel-copy">{publisherCopy}</p>
        </div>
        <div className="auth-pill" data-state={signedIn ? 'active' : 'idle'}>
          {authPill}
        </div>
      </div>

      <StatusBanner banner={banner} />

      {!signedIn && ready && (
        <div className="empty-state" style={{ margin: '16px 0' }}>
          Sign in with Google to publish release notes.
        </div>
      )}
      {signedIn && adminAccess === 'denied' && (
        <div className="empty-state" style={{ margin: '16px 0' }}>
          This account does not have updates admin access.
        </div>
      )}

      {canManage && (
        <PublisherForm
          fields={fields}
          imageFile={imageFile}
          previewSrc={previewSrc}
          editingId={editingId}
          busy={busy}
          onFieldChange={onFieldChange}
          onImageFileChange={onImageFileChange}
          onClearImage={onClearImage}
          onSubmit={onSubmit}
          onReset={onReset}
          onCancelEdit={onCancelEdit}
          onDelete={onDelete}
          onSizeError={onSizeError}
        />
      )}
    </section>
  );
}
