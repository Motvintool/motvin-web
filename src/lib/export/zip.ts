/**
 * Minimal ZIP writer — port of the archive half of
 * motvin-ui/JS/bulk-export.js.
 *
 * Stored (uncompressed) entries only. SVGs compress well, but adding DEFLATE
 * would mean either a dependency or a compressor of our own; the original chose
 * neither, and a stored ZIP opens fine everywhere.
 */

/** Precomputed CRC-32 table (IEEE polynomial, reversed). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(data: string | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new TextEncoder().encode(String(data));
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type ZipFile = {
  name: string;
  data: string | Uint8Array;
  type?: string;
};

/**
 * Two items can easily share a name across collections, and a ZIP with
 * duplicate entries extracts unpredictably — suffix the later ones.
 */
function uniqueNames(files: ZipFile[]): ZipFile[] {
  const used = new Map<string, number>();
  return files.map((file) => {
    const name = file.name || 'file';
    if (!used.has(name)) {
      used.set(name, 1);
      return { ...file, name };
    }
    const count = used.get(name)! + 1;
    used.set(name, count);
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    return { ...file, name: `${stem}-${count}${extension}` };
  });
}

export function zip(files: ZipFile[]): Blob {
  const stamp = new Date();
  // ZIP stores timestamps in the MS-DOS packed format: seconds in 2s units.
  const dosTime =
    (stamp.getHours() << 11) |
    (stamp.getMinutes() << 5) |
    (Math.floor(stamp.getSeconds() / 2) & 0x1f);
  const dosDate =
    ((stamp.getFullYear() - 1980) << 9) | ((stamp.getMonth() + 1) << 5) | stamp.getDate();

  const encoder = new TextEncoder();
  const entries = uniqueNames(files).map((file) => {
    const name = encoder.encode(file.name);
    const data = toBytes(file.data);
    return { name, data, crc: crc32(data), offset: 0 };
  });

  const localSize = entries.reduce(
    (total, entry) => total + 30 + entry.name.length + entry.data.length,
    0,
  );
  const centralSize = entries.reduce((total, entry) => total + 46 + entry.name.length, 0);
  // +22 for the end-of-central-directory record.
  const buffer = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(buffer.buffer);
  let offset = 0;

  const writeU16 = (value: number) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };
  const writeU32 = (value: number) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const writeBytes = (bytes: Uint8Array) => {
    buffer.set(bytes, offset);
    offset += bytes.length;
  };

  // Local file headers, each followed by its data.
  for (const entry of entries) {
    entry.offset = offset;
    writeU32(0x04034b50);
    writeU16(20); // version needed
    writeU16(0x0800); // UTF-8 file names
    writeU16(0); // stored, not deflated
    writeU16(dosTime);
    writeU16(dosDate);
    writeU32(entry.crc);
    writeU32(entry.data.length); // compressed size
    writeU32(entry.data.length); // uncompressed size
    writeU16(entry.name.length);
    writeU16(0); // extra field length
    writeBytes(entry.name);
    writeBytes(entry.data);
  }

  // Central directory.
  const centralOffset = offset;
  for (const entry of entries) {
    writeU32(0x02014b50);
    writeU16(20); // version made by
    writeU16(20); // version needed
    writeU16(0x0800);
    writeU16(0);
    writeU16(dosTime);
    writeU16(dosDate);
    writeU32(entry.crc);
    writeU32(entry.data.length);
    writeU32(entry.data.length);
    writeU16(entry.name.length);
    writeU16(0); // extra field length
    writeU16(0); // comment length
    writeU16(0); // disk number start
    writeU16(0); // internal attributes
    writeU32(0); // external attributes
    writeU32(entry.offset);
    writeBytes(entry.name);
  }

  const centralBytes = offset - centralOffset;
  writeU32(0x06054b50);
  writeU16(0); // this disk
  writeU16(0); // disk with central directory
  writeU16(entries.length);
  writeU16(entries.length);
  writeU32(centralBytes);
  writeU32(centralOffset);
  writeU16(0); // comment length

  return new Blob([buffer], { type: 'application/zip' });
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking straight away can cancel the download in Safari.
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * One download for the whole selection: the file itself when a single item is
 * selected, otherwise a ZIP. Returns how many files were written.
 */
export function downloadFiles(files: ZipFile[], zipName: string): number {
  const list = (files ?? []).filter(Boolean);
  if (list.length === 0) return 0;

  if (list.length === 1) {
    const [file] = list;
    const blob = new Blob([toBytes(file.data) as BlobPart], {
      type: file.type || 'image/svg+xml',
    });
    downloadBlob(file.name, blob);
    return 1;
  }

  downloadBlob(zipName, zip(list));
  return list.length;
}
