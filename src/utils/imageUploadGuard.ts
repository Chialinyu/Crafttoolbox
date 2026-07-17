/**
 * Shared image upload guards: MIME, file size, and pixel limits with canvas resize.
 * Used by Mosaic and Vectorizer so oversized inputs fail safely without changing
 * algorithm behaviour for images already within limits.
 */

export const IMAGE_UPLOAD_LIMITS = {
  MAX_IMAGE_WIDTH: 2000,
  MAX_IMAGE_HEIGHT: 2000,
  MAX_PIXELS: 4_000_000,
  /** 20 MB — reject before reading into memory when possible */
  MAX_FILE_BYTES: 20 * 1024 * 1024,
} as const;

const ALLOWED_MIME = /^image\/(png|jpe?g|gif|webp|bmp|x-icon|vnd\.microsoft\.icon)$/i;

export type ImageUploadGuardErrorCode =
  | 'invalid_type'
  | 'file_too_large'
  | 'read_failed'
  | 'load_failed'
  | 'process_failed';

export interface ImageUploadGuardSuccess {
  ok: true;
  image: HTMLImageElement;
  imageData: ImageData;
  wasResized: boolean;
  originalWidth: number;
  originalHeight: number;
  /** data URL of the (possibly resized) image for previews */
  previewDataUrl: string;
}

export interface ImageUploadGuardFailure {
  ok: false;
  code: ImageUploadGuardErrorCode;
  message: string;
}

export type ImageUploadGuardResult = ImageUploadGuardSuccess | ImageUploadGuardFailure;

function isAllowedImageType(file: File): boolean {
  if (ALLOWED_MIME.test(file.type)) return true;
  // Some browsers leave type empty; allow by extension fallback
  if (!file.type) {
    return /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(file.name);
  }
  return false;
}

function computeTargetSize(
  width: number,
  height: number
): { width: number; height: number; wasResized: boolean } {
  const totalPixels = width * height;
  const { MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, MAX_PIXELS } = IMAGE_UPLOAD_LIMITS;

  if (
    width <= MAX_IMAGE_WIDTH &&
    height <= MAX_IMAGE_HEIGHT &&
    totalPixels <= MAX_PIXELS
  ) {
    return { width, height, wasResized: false };
  }

  const scaleWidth = MAX_IMAGE_WIDTH / width;
  const scaleHeight = MAX_IMAGE_HEIGHT / height;
  const scalePixels = Math.sqrt(MAX_PIXELS / totalPixels);
  const scale = Math.min(scaleWidth, scaleHeight, scalePixels);

  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    wasResized: true,
  };
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Unexpected FileReader result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Validate and optionally resize an uploaded image file.
 * Returns ImageData + HTMLImageElement ready for Mosaic / Vectorizer.
 */
export async function guardImageUpload(file: File): Promise<ImageUploadGuardResult> {
  if (!isAllowedImageType(file)) {
    return {
      ok: false,
      code: 'invalid_type',
      message: 'Please select an image file (PNG, JPEG, GIF, WebP, or BMP).',
    };
  }

  if (file.size > IMAGE_UPLOAD_LIMITS.MAX_FILE_BYTES) {
    const maxMb = Math.round(IMAGE_UPLOAD_LIMITS.MAX_FILE_BYTES / (1024 * 1024));
    return {
      ok: false,
      code: 'file_too_large',
      message: `File is too large. Maximum size is ${maxMb} MB.`,
    };
  }

  let dataUrl: string;
  try {
    dataUrl = await readFileAsDataURL(file);
  } catch {
    return {
      ok: false,
      code: 'read_failed',
      message: 'Failed to read file',
    };
  }

  let source: HTMLImageElement;
  try {
    source = await loadImage(dataUrl);
  } catch {
    return {
      ok: false,
      code: 'load_failed',
      message: 'Failed to load image',
    };
  }

  const originalWidth = source.naturalWidth || source.width;
  const originalHeight = source.naturalHeight || source.height;
  const target = computeTargetSize(originalWidth, originalHeight);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        ok: false,
        code: 'process_failed',
        message: 'Failed to process image. Please try a smaller image.',
      };
    }

    ctx.drawImage(source, 0, 0, target.width, target.height);
    const imageData = ctx.getImageData(0, 0, target.width, target.height);
    const previewDataUrl = canvas.toDataURL();

    const image = await loadImage(previewDataUrl);

    return {
      ok: true,
      image,
      imageData,
      wasResized: target.wasResized,
      originalWidth,
      originalHeight,
      previewDataUrl,
    };
  } catch {
    return {
      ok: false,
      code: 'process_failed',
      message: 'Failed to process image. Please try a smaller image.',
    };
  }
}

export function formatResizeWarning(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number
): string {
  return `Image too large (${originalWidth}×${originalHeight}). Resized to ${targetWidth}×${targetHeight} for processing.`;
}
