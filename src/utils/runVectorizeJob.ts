/**
 * Vectorization background runner
 *
 * Full Web Worker offload is deferred: `potrace` is Node/CommonJS-oriented and
 * already bundles heavily for the main thread. This module runs vectorization
 * with cooperative idle yields (via vectorizeImage) and cancellation support,
 * keeping the UI responsive without changing algorithm output.
 */

import {
  vectorizeImage,
  type VectorizationConfig,
  type VectorPath,
} from '@/app/components/vectorizer/utils/vectorization';
import type { MutableRefObject } from 'react';

export type VectorizeJobConfig = Omit<VectorizationConfig, 'isCancelledRef'> & {
  isCancelledRef?: MutableRefObject<boolean>;
};

/**
 * Run vectorization on the main thread with cooperative yielding + cancel.
 * Call sites should set `isCancelledRef.current = true` to abort.
 */
export async function runVectorizeJob(
  imageData: ImageData,
  config: VectorizeJobConfig
): Promise<VectorPath[]> {
  return vectorizeImage(imageData, config);
}
