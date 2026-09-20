/**
 * Resizes a photo in the browser before uploading.
 *
 * A phone camera produces several megabytes per shot, and the connection at a yard
 * is usually a phone's mobile data. 1600px on the long edge keeps handwritten digits
 * legible for the model while cutting the upload to a fraction — the difference
 * between a sheet arriving now and the person giving up on the app.
 *
 * If anything fails (an exotic format, no canvas), the original file is uploaded
 * unchanged rather than losing the photo.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
