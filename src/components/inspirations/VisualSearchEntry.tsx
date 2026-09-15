'use client';

import { useRef, useState, type DragEvent } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { Screen } from '@/lib/inspirations/types';
import { CloseIcon, ImageIcon, UploadIcon } from './Icons';
import { ScreenGrid } from './ScreenGrid';

/**
 * Visual search entry point. Accepts a screenshot by drop or picker, then
 * shows visually similar screens. The matching itself is a stub until image
 * embeddings exist — the UI contract is what this component establishes.
 */
export function VisualSearchEntry() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [results, setResults] = useState<Screen[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = async (f: File) => {
    if (!f.type.startsWith('image/')) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setLoading(true);
    setResults(null);
    const found = await inspirationsApi.visualSearch(f);
    setResults(found);
    setLoading(false);
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setResults(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void accept(f);
  };

  return (
    <section className="ins-visual" aria-labelledby="ins-visual-title">
      {!file ? (
        <div
          className={`ins-dropzone ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <ImageIcon size={22} className="ins-dropzone-icon" />
          <div className="ins-dropzone-text">
            <p id="ins-visual-title" className="ins-dropzone-title">Find visually similar designs</p>
            <p className="ins-dropzone-desc">Drop a screenshot to find screens with a similar layout, pattern or style.</p>
          </div>
          <button type="button" className="ins-btn" onClick={() => inputRef.current?.click()}>
            <UploadIcon size={15} />
            Upload screenshot
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void accept(f);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="ins-visual-results">
          <div className="ins-visual-query">
            {preview && <img src={preview} alt="Uploaded screenshot" className="ins-visual-thumb" />}
            <div className="ins-visual-query-text">
              <p className="ins-visual-query-title">Similar to your screenshot</p>
              <p className="ins-visual-query-sub">{file.name}</p>
            </div>
            <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={reset}>
              <CloseIcon size={13} />
              Clear
            </button>
          </div>
          <ScreenGrid screens={results ?? []} loading={loading} />
        </div>
      )}
    </section>
  );
}
