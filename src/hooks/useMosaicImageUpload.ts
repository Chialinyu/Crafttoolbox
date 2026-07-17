import { useCallback, type ChangeEvent, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import {
  formatResizeWarning,
  guardImageUpload,
} from '@/utils/imageUploadGuard';
import { trackImageUpload } from '@/utils/analytics';
import { DEFAULTS } from '@/app/components/mosaic/constants';
import type { SegmentMemory } from '@/utils/segmentMemory';

interface UseMosaicImageUploadParams {
  pendingDimensionsRef: MutableRefObject<{ width: number; height: number } | null>;
  segmentMemoryRef: MutableRefObject<SegmentMemory>;
  setTileColorMap: (map: number[][]) => void;
  setMosaicWidth: (w: number) => void;
  setMosaicHeight: (h: number) => void;
  setKeepAspectRatio: (v: boolean) => void;
  setImage: (img: HTMLImageElement | null) => void;
  setImageChanged: (v: boolean) => void;
}

/**
 * Handles mosaic image upload with shared size/MIME guards.
 * Behaviour-preserving extraction from MosaicGenerator.
 */
export function useMosaicImageUpload({
  pendingDimensionsRef,
  segmentMemoryRef,
  setTileColorMap,
  setMosaicWidth,
  setMosaicHeight,
  setKeepAspectRatio,
  setImage,
  setImageChanged,
}: UseMosaicImageUploadParams) {
  const applyUploadedImage = useCallback(
    (img: HTMLImageElement) => {
      const aspectRatio = img.width / img.height;
      const targetTiles = 1600;
      const targetWidth = Math.round(Math.sqrt(targetTiles * aspectRatio));
      const targetHeight = Math.round(targetWidth / aspectRatio);

      const finalWidth = Math.max(DEFAULTS.MIN_CANVAS_DIMENSION * 2, targetWidth);
      const finalHeight = Math.max(DEFAULTS.MIN_CANVAS_DIMENSION * 2, targetHeight);
      pendingDimensionsRef.current = { width: finalWidth, height: finalHeight };

      setTileColorMap([]);
      segmentMemoryRef.current.clear();

      setMosaicWidth(finalWidth);
      setMosaicHeight(finalHeight);
      setKeepAspectRatio(true);
      setImage(img);
      setImageChanged(true);
    },
    [
      pendingDimensionsRef,
      segmentMemoryRef,
      setTileColorMap,
      setMosaicWidth,
      setMosaicHeight,
      setKeepAspectRatio,
      setImage,
      setImageChanged,
    ]
  );

  const handleImageUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      const result = await guardImageUpload(file);
      if (result.ok === false) {
        toast.error(result.message);
        return;
      }

      if (result.wasResized) {
        toast.warning(
          formatResizeWarning(
            result.originalWidth,
            result.originalHeight,
            result.image.width,
            result.image.height
          ),
          { duration: 5000 }
        );
      }

      trackImageUpload('mosaic-generator');
      applyUploadedImage(result.image);
    },
    [applyUploadedImage]
  );

  return { handleImageUpload, applyUploadedImage };
}
