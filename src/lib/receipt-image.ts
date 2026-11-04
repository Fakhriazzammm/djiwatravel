/**
 * Browser-side photo prep for receipts: shrink a camera photo to a JPEG the server can accept
 * quickly (long edge 1600 px, under about 800 KB) without losing the small print on a receipt.
 */

const MAX_EDGE = 1600;
const TARGET_BYTES = 800_000;

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

export async function compressReceiptPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    let edge = Math.min(MAX_EDGE, Math.max(bitmap.width, bitmap.height));
    let result: Blob = file;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = edge / Math.max(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * Math.min(1, scale)));
      canvas.height = Math.max(1, Math.round(bitmap.height * Math.min(1, scale)));
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.72, 0.6]) {
        const blob = await toBlob(canvas, quality);
        if (!blob) return file;
        result = blob;
        if (blob.size <= TARGET_BYTES) return blob;
      }
      edge = Math.round(edge * 0.8);
    }
    return result;
  } finally {
    bitmap.close?.();
  }
}

/** Mean luminance of a 0..255 gray frame region, used by the camera's "struk terdeteksi" hint. */
export function frameStats(gray: Uint8ClampedArray, width: number, height: number) {
  let center = 0;
  let centerN = 0;
  let edge = 0;
  let edgeN = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = gray[y * width + x]!;
      const inside = x > width * 0.22 && x < width * 0.78 && y > height * 0.2 && y < height * 0.8;
      if (inside) {
        center += v;
        centerN++;
      } else if (x < width * 0.1 || x > width * 0.9 || y < height * 0.08 || y > height * 0.92) {
        edge += v;
        edgeN++;
      }
    }
  }
  return { center: center / (centerN || 1), edge: edge / (edgeN || 1) };
}

/** Mean absolute difference between two gray frames: low means the phone is held still. */
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / (n || 1);
}

/** Paper brighter than its surroundings and not dark overall: a receipt is probably in the frame. */
export function looksLikeReceipt(stats: { center: number; edge: number }) {
  return stats.center > 105 && stats.center - stats.edge > 12;
}
