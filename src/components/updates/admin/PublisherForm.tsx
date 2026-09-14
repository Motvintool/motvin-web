'use client';

import { useRef, type FormEvent } from 'react';
import { MAX_IMAGE_SIZE_BYTES } from '@/lib/firebase/updates';

/**
 * Release-note publisher form — the heart of /updates/admin.
 *
 * Kept pure-controlled so the parent owns state (fields, imageFile, busy,
 * editingId, blob URL for the preview). Ports the form section of
 * motvin-ui/updates/admin.html verbatim class-for-class.
 */

export type PublisherFields = {
  title: string;
  date: string;
  description: string;
  image: string;
  shareSlug: string;
  shareSummary: string;
  features: string;
  improvements: string;
  fixes: string;
};

type Props = {
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

export function PublisherForm({
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      onImageFileChange(null);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      onSizeError('Image is too large — 8 MB maximum.');
      event.target.value = '';
      onImageFileChange(null);
      return;
    }
    onImageFileChange(file);
  };

  const handleClearImage = () => {
    onClearImage();
    if (imageFile && fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <form className="release-form" onSubmit={onSubmit}>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Feature title</span>
          <input
            className="field-input"
            type="text"
            placeholder="Styles panel redesign"
            required
            value={fields.title}
            onChange={(e) => onFieldChange('title', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Publish date</span>
          <input
            className="field-input"
            type="date"
            required
            value={fields.date}
            onChange={(e) => onFieldChange('date', e.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Short description</span>
        <textarea
          className="field-input field-textarea"
          rows={4}
          placeholder="A concise summary of the release in 2–3 lines."
          required
          value={fields.description}
          onChange={(e) => onFieldChange('description', e.target.value)}
        />
      </label>

      <div className="image-inputs">
        <label className="field">
          <span className="field-label">Preview image URL</span>
          <input
            className="field-input"
            type="url"
            placeholder="https://..."
            value={fields.image}
            onChange={(e) => onFieldChange('image', e.target.value)}
          />
          <span className="field-help">
            Paste an image URL if you want to use an existing hosted image.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Upload image from device</span>
          <input
            className="field-input field-file-input"
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFile}
          />
          <span className="field-help">
            Uploads to Firebase Storage on publish. Uploaded image takes priority
            over the URL field.
          </span>
        </label>
      </div>

      {previewSrc && (
        <div className="image-preview-card">
          <div className="image-preview-head">
            <span className="image-preview-label">Preview image</span>
            <button
              className="nav-link nav-link-button image-preview-clear"
              type="button"
              onClick={handleClearImage}
            >
              {imageFile ? 'Remove upload' : 'Clear URL'}
            </button>
          </div>
          <img className="image-preview-media" src={previewSrc} alt="Preview" />
          {imageFile && (
            <p className="image-preview-meta">
              {imageFile.name} · {(imageFile.size / 1024 / 1024).toFixed(2)} MB · Will
              upload on publish.
            </p>
          )}
        </div>
      )}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Share slug</span>
          <input
            className="field-input"
            type="text"
            placeholder="styles-panel-redesign"
            value={fields.shareSlug}
            onChange={(e) => onFieldChange('shareSlug', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Share summary</span>
          <input
            className="field-input"
            type="text"
            placeholder="Short text used when sharing this release note"
            value={fields.shareSummary}
            onChange={(e) => onFieldChange('shareSummary', e.target.value)}
          />
        </label>
      </div>

      <div className="form-columns">
        <label className="field">
          <span className="field-label">Features</span>
          <textarea
            className="field-input field-textarea field-list"
            rows={6}
            placeholder="One item per line"
            value={fields.features}
            onChange={(e) => onFieldChange('features', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Improvements</span>
          <textarea
            className="field-input field-textarea field-list"
            rows={6}
            placeholder="One item per line"
            value={fields.improvements}
            onChange={(e) => onFieldChange('improvements', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Fixes</span>
          <textarea
            className="field-input field-textarea field-list"
            rows={6}
            placeholder="One item per line"
            value={fields.fixes}
            onChange={(e) => onFieldChange('fixes', e.target.value)}
          />
        </label>
      </div>

      <div className="form-actions">
        <button className="nav-btn" type="submit" disabled={busy}>
          {busy ? 'Working…' : editingId ? 'Save changes' : 'Publish update'}
        </button>
        <button
          className="nav-link nav-link-button"
          type="button"
          onClick={onReset}
          disabled={busy}
        >
          Reset
        </button>
        {editingId && (
          <button
            className="nav-link nav-link-button"
            type="button"
            onClick={onCancelEdit}
            disabled={busy}
          >
            Cancel edit
          </button>
        )}
        {editingId && (
          <button
            className="nav-link nav-link-button nav-link-danger"
            type="button"
            onClick={onDelete}
            disabled={busy}
          >
            Delete selected
          </button>
        )}
      </div>
    </form>
  );
}
