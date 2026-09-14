'use client';

/**
 * The library's dormant modal shells — kept only for markup the legacy site
 * still targets by id and that hasn't grown a real React component yet.
 *
 * Compare, Save Collection and Local Folder now live in their own components
 * (CompareModal.tsx / SaveCollectionModal.tsx / LocalFolderModal.tsx) and are
 * mounted by LibraryResults with real state.
 */

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export function SystemModal() {
  // Ported as an empty shell — the "New Icon System" flow is not wired in
  // this port yet. Kept in the DOM so scripts that address #system-modal by id
  // still find it.
  return (
    <div className="mi-modal" id="system-modal" aria-hidden="true" role="dialog" aria-modal="true">
      <div className="mi-modal-backdrop" data-close />
      <div className="mi-modal-card mi-modal-form">
        <button className="mi-modal-close" data-close aria-label="Close">
          <CloseIcon />
        </button>
        <div className="mi-form">
          <h3>New Icon System</h3>
          <p className="mi-muted mi-form-sub">
            Bundle your favorite icons with a shared preset — size, stroke, color and shape stay
            consistent across the system.
          </p>
          <label className="mi-field">
            <span>Name</span>
            <input type="text" id="sys-name" className="mi-input" autoComplete="off" />
          </label>
          <label className="mi-field">
            <span>Description</span>
            <textarea id="sys-desc" className="mi-input mi-textarea" rows={2} />
          </label>
          <label className="mi-field">
            <span>Base preset</span>
            <select id="sys-preset" className="mi-input" defaultValue="default">
              <option value="default">Default</option>
              <option value="flat">Flat</option>
              <option value="soft">Soft</option>
              <option value="bold">Bold</option>
              <option value="glass">Glass</option>
              <option value="neumorphic">Neumorphic</option>
            </select>
          </label>
          <div className="mi-field-row" />
          <div className="mi-form-meta" />
          <div className="mi-form-actions" />
        </div>
      </div>
    </div>
  );
}

export function HelpModal() {
  return (
    <div className="mi-modal" id="help-modal" aria-hidden="true" role="dialog" aria-modal="true">
      <div className="mi-modal-backdrop" data-close />
      <div className="mi-modal-card mi-modal-help">
        <button className="mi-modal-close" data-close aria-label="Close">
          <CloseIcon />
        </button>
        <div className="mi-help">
          <h3>Help</h3>
          <div className="mi-help-grid" />
        </div>
      </div>
    </div>
  );
}

export function AllModalShells() {
  return (
    <>
      <SystemModal />
      <HelpModal />
    </>
  );
}
