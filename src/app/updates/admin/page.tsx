'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import {
  addAdmin,
  deleteReleaseImage,
  deleteReleaseNote,
  fetchAdmins,
  fetchAllReleaseNotes,
  hasAdminAccess,
  isOwnerAdmin,
  normaliseEmail,
  publishReleaseNote,
  removeAdmin,
  slugifyRelease,
  uploadReleaseImage,
  type AdminRecord,
  type ReleaseNote,
} from '@/lib/firebase/updates';
import { AdminFooter } from '@/components/updates/admin/AdminFooter';
import { AdminHeader } from '@/components/updates/admin/AdminHeader';
import { AdminNav } from '@/components/updates/admin/AdminNav';
import { AdminSidebar } from '@/components/updates/admin/AdminSidebar';
import { PublisherPanel } from '@/components/updates/admin/PublisherPanel';
import { UpdatesChrome } from '@/components/updates/UpdatesChrome';
import type { Banner } from '@/components/updates/admin/StatusBanner';
import type { PublisherFields } from '@/components/updates/admin/PublisherForm';
import '@/styles/updates.css';

/**
 * Updates publisher — /updates/admin.
 *
 * Composition-only shell: presentation lives in `src/components/updates/`.
 * This file still owns the orchestration state (auth gating, edit state,
 * banner, publish/delete/upload side effects, image blob-URL lifecycle) and
 * passes it into the section components.
 */

const EMPTY_FIELDS: PublisherFields = {
  title: '',
  date: toDateInputValue(new Date()),
  description: '',
  image: '',
  shareSlug: '',
  shareSummary: '',
  features: '',
  improvements: '',
  fixes: '',
};

/** Anchor at 12:00 local so the Timestamp doesn't fall on the previous day in
 * negative-UTC-offset timezones — matches legacy admin.js. */
function toDateInputValue(date: Date): string {
  const offsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offsetMinutes * 60000);
  return local.toISOString().slice(0, 10);
}
function fromDateInputValue(value: string): Date {
  return new Date(`${value}T12:00:00`);
}
function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
function joinLines(list: string[] | undefined): string {
  return (list ?? []).join('\n');
}

export default function AdminPage() {
  const { user, ready } = useAuth();
  const email = user?.email ?? '';
  const signedIn = Boolean(user && !user.isAnonymous);

  const [adminAccess, setAdminAccess] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [isOwner, setIsOwner] = useState(false);

  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [notesState, setNotesState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [admins, setAdmins] = useState<AdminRecord[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fields, setFields] = useState<PublisherFields>(EMPTY_FIELDS);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const formTopRef = useRef<HTMLElement>(null);

  const editingNote = useMemo(
    () => (editingId ? notes.find((n) => n.id === editingId) ?? null : null),
    [editingId, notes],
  );

  useEffect(() => {
    if (!ready) return;
    if (!signedIn) {
      setAdminAccess('denied');
      setIsOwner(false);
      return;
    }
    let cancelled = false;
    setAdminAccess('unknown');
    setIsOwner(isOwnerAdmin(email));
    (async () => {
      const ok = await hasAdminAccess(email);
      if (!cancelled) setAdminAccess(ok ? 'granted' : 'denied');
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn, email]);

  const loadEntries = useCallback(async () => {
    setNotesState('loading');
    try {
      const list = await fetchAllReleaseNotes();
      setNotes(list);
      setNotesState('ready');
    } catch {
      setNotesState('error');
    }
  }, []);

  const loadAdmins = useCallback(async () => {
    try {
      const list = await fetchAdmins();
      setAdmins(list);
    } catch {
      setAdmins([]);
    }
  }, []);

  useEffect(() => {
    if (adminAccess !== 'granted') return;
    void loadEntries();
    if (isOwner) void loadAdmins();
  }, [adminAccess, isOwner, loadEntries, loadAdmins]);

  useEffect(() => {
    return () => {
      if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl);
    };
  }, [imageBlobUrl]);

  const patchField = useCallback(
    <K extends keyof PublisherFields>(key: K, value: PublisherFields[K]) => {
      setFields((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetFormFields = useCallback((keepBanner = false) => {
    setFields(EMPTY_FIELDS);
    setImageFile(null);
    setImageBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (!keepBanner) setBanner(null);
  }, []);

  const resetToCreateMode = useCallback(() => {
    setEditingId(null);
    resetFormFields();
  }, [resetFormFields]);

  const beginEdit = useCallback((note: ReleaseNote) => {
    setEditingId(note.id);
    setFields({
      title: note.title,
      date: note.date ? toDateInputValue(note.date) : toDateInputValue(new Date()),
      description: note.description ?? '',
      image: note.image ?? '',
      shareSlug: note.share?.slug ?? '',
      shareSummary: note.share?.summary ?? '',
      features: joinLines(note.changes?.features),
      improvements: joinLines(note.changes?.improvements),
      fixes: joinLines(note.changes?.fixes),
    });
    setImageFile(null);
    setImageBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setBanner({ message: `Editing "${note.title}".`, tone: 'neutral' });
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleImageFileChange = useCallback((file: File | null) => {
    setImageBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageFile(file);
    if (file) setImageBlobUrl(URL.createObjectURL(file));
  }, []);

  const handleClearImage = useCallback(() => {
    if (imageFile) {
      setImageFile(null);
      setImageBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } else {
      patchField('image', '');
    }
  }, [imageFile, patchField]);

  const previewSrc = imageBlobUrl || fields.image || '';

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!signedIn || adminAccess !== 'granted') return;
      if (!fields.title.trim() || !fields.date || !fields.description.trim()) {
        setBanner({ message: 'Title, date and description are required.', tone: 'error' });
        return;
      }
      setBusy(true);
      let uploadedPath: string | null = null;
      let imageUrl = fields.image.trim();
      let imagePath = editingNote?.imageStoragePath ?? '';
      const previousStoragePath = editingNote?.imageStoragePath ?? '';
      try {
        if (imageFile) {
          const uploaded = await uploadReleaseImage(
            imageFile,
            fields.shareSlug || fields.title,
          );
          imageUrl = uploaded.url;
          imagePath = uploaded.path;
          uploadedPath = uploaded.path;
        }
        if (!imageFile && !imageUrl) imagePath = '';

        const { slug } = await publishReleaseNote({
          data: {
            title: fields.title.trim(),
            date: fromDateInputValue(fields.date),
            description: fields.description.trim(),
            image: imageUrl || undefined,
            imageStoragePath: imagePath || undefined,
            changes: {
              features: splitLines(fields.features),
              improvements: splitLines(fields.improvements),
              fixes: splitLines(fields.fixes),
            },
            share: {
              slug: slugifyRelease(fields.shareSlug || fields.title),
              summary: fields.shareSummary.trim(),
              title: fields.title.trim(),
            },
          },
          actorEmail: email,
          editingId,
          originalPublishedAt: editingNote?.publishedAt ?? null,
        });

        if (previousStoragePath && previousStoragePath !== imagePath) {
          void deleteReleaseImage(previousStoragePath);
        }

        const shareUrl = `${window.location.origin}/updates?release=${encodeURIComponent(slug)}`;
        setBanner({
          message: editingId
            ? `Release note saved. Share URL: ${shareUrl}`
            : `Published. Share URL: ${shareUrl}`,
          tone: 'success',
        });
        setEditingId(null);
        resetFormFields(true);
        void loadEntries();
      } catch (err) {
        if (uploadedPath) void deleteReleaseImage(uploadedPath);
        const code = String((err as { code?: unknown })?.code ?? '');
        if (code === 'permission-denied') {
          setBanner({
            message:
              'You don’t have permission to publish. Ask an owner to grant admin access.',
            tone: 'error',
          });
        } else if (code.startsWith('storage/')) {
          setBanner({
            message: `Image upload failed (${code}). Please try again.`,
            tone: 'error',
          });
        } else {
          const message = err instanceof Error ? err.message : 'Publish failed.';
          setBanner({ message, tone: 'error' });
        }
      } finally {
        setBusy(false);
      }
    },
    [
      signedIn,
      adminAccess,
      fields,
      imageFile,
      editingId,
      editingNote,
      email,
      loadEntries,
      resetFormFields,
    ],
  );

  const handleDelete = useCallback(async () => {
    if (!editingId || !editingNote) return;
    if (!window.confirm(`Delete "${editingNote.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteReleaseNote(editingId);
      await deleteReleaseImage(editingNote.imageStoragePath);
      setBanner({ message: 'Release note deleted.', tone: 'success' });
      setEditingId(null);
      resetFormFields(true);
      void loadEntries();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed.';
      setBanner({ message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [editingId, editingNote, loadEntries, resetFormFields]);

  const handleAddAdmin = useCallback(
    async (raw: string) => {
      const target = normaliseEmail(raw);
      if (!target) return;
      if (isOwnerAdmin(target)) {
        setBanner({ message: 'That email already has owner access.', tone: 'neutral' });
        return;
      }
      try {
        await addAdmin(target, email);
        setBanner({ message: `Added ${target} as admin.`, tone: 'success' });
        void loadAdmins();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add admin.';
        setBanner({ message, tone: 'error' });
      }
    },
    [email, loadAdmins],
  );

  const handleRemoveAdmin = useCallback(
    async (target: string) => {
      if (!window.confirm(`Revoke admin access from ${target}?`)) return;
      try {
        await removeAdmin(target);
        setBanner({ message: `Removed ${target}.`, tone: 'success' });
        void loadAdmins();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove admin.';
        setBanner({ message, tone: 'error' });
      }
    },
    [loadAdmins],
  );

  const publisherCopy = editingId
    ? `Editing an existing release note. Save changes to update it.`
    : `Sign in, fill in the fields, and publish a new update entry.`;
  const authPill = signedIn
    ? `Signed in as ${user?.displayName || user?.email || 'user'}`
    : 'Not signed in';

  return (
    <>
      <UpdatesChrome title="Motvin — Update Publisher" />
      <AdminNav
        onAuthChange={() => setBanner(null)}
        onAuthError={(message) => setBanner({ message, tone: 'error' })}
      />
      <AdminHeader ref={formTopRef} />

      <main className="feed admin-main">
        <div className="container container-wide admin-layout">
          <PublisherPanel
            ready={ready}
            signedIn={signedIn}
            adminAccess={adminAccess}
            authPill={authPill}
            publisherCopy={publisherCopy}
            banner={banner}
            fields={fields}
            imageFile={imageFile}
            previewSrc={previewSrc}
            editingId={editingId}
            busy={busy}
            onFieldChange={patchField}
            onImageFileChange={handleImageFileChange}
            onClearImage={handleClearImage}
            onSubmit={handleSubmit}
            onReset={() => resetFormFields()}
            onCancelEdit={resetToCreateMode}
            onDelete={handleDelete}
            onSizeError={(message) => setBanner({ message, tone: 'error' })}
          />
          <AdminSidebar
            notes={notes}
            notesState={notesState}
            editingId={editingId}
            onEdit={beginEdit}
            isOwner={isOwner}
            admins={admins}
            onAddAdmin={handleAddAdmin}
            onRemoveAdmin={handleRemoveAdmin}
          />
        </div>
      </main>

      <AdminFooter />
    </>
  );
}
