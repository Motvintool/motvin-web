'use client';

import type { SavedFolder } from '@/hooks/useSavedCollections';

/**
 * The Saved tab of the right panel — collections of saved items.
 *
 * Ships the same shape as the reference (`:52488`): a wrapping flex column
 * with 16px gap, a "Create collection" button with a plus glyph, and a
 * `#collections-list-container` holding one big card per folder. "All Saved"
 * is a synthesised top row that clears the folder filter.
 */

type Props = {
  folders: SavedFolder[];
  activeFolderId: string | null;
  showingSaved: boolean;
  onSelectFolder: (id: string) => void;
  onShowAllSaved: () => void;
  onDeleteFolder: (id: string) => void;
  /**
   * Reference (`:52488`) has no plain in-memory folder creation — every
   * collection is backed by an on-disk directory, so the SavedPanel's
   * "Create collection" button opens the local-folder modal directly.
   */
  onConnectLocalFolder: () => void;
};

// Inline styles — the reference is inline-styled too so this stays a 1:1
// port and doesn't add another CSS surface to keep in sync.
const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const newBtn: React.CSSProperties = {
  width: '100%',
  border: '1px solid #eaeaee',
  borderRadius: 8,
  background: 'transparent',
  padding: '10px 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  cursor: 'pointer',
  transition: 'background 0.2s',
};

const newBtnLabel: React.CSSProperties = {
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontSize: 16,
  color: 'rgba(0, 0, 0, 0.9)',
};

const listContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const folderCard = (active: boolean): React.CSSProperties => ({
  background: 'white',
  boxShadow: active
    ? '0px 4px 4px rgba(96,96,96,0.15), 0px 0px 0.5px rgba(96,96,96,0.31), 0 0 0 3px var(--mi-focus)'
    : '0px 4px 4px rgba(96,96,96,0.15), 0px 0px 0.5px rgba(96,96,96,0.31)',
  height: 84,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '16px 16px 12px 16px',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'transform 0.2s, box-shadow 0.2s',
  border: `1px solid ${active ? 'var(--mi-accent)' : 'transparent'}`,
  position: 'relative',
});

const folderTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  alignItems: 'center',
};

const folderName: React.CSSProperties = {
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontWeight: 500,
  fontSize: 16,
  color: 'rgba(0,0,0,0.9)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const folderCount: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 16,
  color: 'rgba(0,0,0,0.4)',
};

const deleteBtn: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  width: 22,
  height: 22,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'rgba(0,0,0,0.35)',
  fontSize: 18,
  lineHeight: 1,
  cursor: 'pointer',
  borderRadius: 4,
};

export function SavedPanel({
  folders,
  activeFolderId,
  showingSaved,
  onSelectFolder,
  onShowAllSaved,
  onDeleteFolder,
  onConnectLocalFolder,
}: Props) {
  const totalSaved = new Set(folders.flatMap((f) => f.iconIds)).size;
  const allSavedActive = showingSaved && !activeFolderId;

  return (
    <div style={wrap}>
      <button
        id="rp-coll-new-btn-figma"
        type="button"
        onClick={onConnectLocalFolder}
        style={newBtn}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(0,0,0,0.9)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span style={newBtnLabel}>Create collection</span>
      </button>

      <div id="collections-list-container" style={listContainer}>
        <div
          className={`mi-rp-cat-item${allSavedActive ? ' is-active' : ''}`}
          data-folder="all"
          onClick={onShowAllSaved}
          style={folderCard(allSavedActive)}
        >
          <div style={folderTop}>
            <span style={folderName}>All Saved</span>
            <span style={folderCount}>{totalSaved}</span>
          </div>
        </div>

        {folders.map((folder) => {
          const active = activeFolderId === folder.id;
          return (
            <div
              key={folder.id}
              className={`mi-rp-cat-item${active ? ' is-active' : ''}`}
              data-folder={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              style={folderCard(active)}
            >
              <div style={folderTop}>
                <span style={folderName}>{folder.name}</span>
                <span style={folderCount}>{folder.iconIds.length}</span>
              </div>
              <button
                type="button"
                aria-label={`Delete ${folder.name}`}
                title="Delete collection"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(folder.id);
                }}
                style={deleteBtn}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
