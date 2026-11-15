/** The logo as a PNG at its stored size: the files are WebP, which most design tools won't paste. */
export async function logoPng(src: string): Promise<Blob> {
  const bitmap = await createImageBitmap(await (await fetch(src)).blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))), 'image/png'));
}
