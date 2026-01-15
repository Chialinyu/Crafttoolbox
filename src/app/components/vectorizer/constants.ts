/**
 * ============================================================================
 * VECTORIZER CONSTANTS - 統一配置管理
 * ============================================================================
 * 
 * 所有魔法數字和配置集中管理，確保：
 * ✅ 可維護性 - 修改一處，全局生效
 * ✅ 類型安全 - 使用 as const 鎖定類型
 * ✅ 文檔化 - 每個常量都有清晰說明
 * ============================================================================
 */

// Default parameter values
export const DEFAULT_VALUES = {
  // Step 3: Preprocessing
  BLUR_RADIUS: 2,
  THRESHOLD: 128,
  MIN_AREA: 20,
  COLOR_COUNT: 4,
  USE_AUTO_THRESHOLD: true,
  
  // Step 4: Vectorization
  PATH_PRECISION: 30,
  SIMPLIFY_PATH: true,
  
  // Display settings
  IMAGE_OPACITY: 0.3,
  SHOW_ORIGINAL_IMAGE: true,
} as const;

// Parameter limits
export const LIMITS = {
  COLOR_COUNT_MIN: 2,
  COLOR_COUNT_MAX: 10,
  BLUR_RADIUS_MAX: 10,
  THRESHOLD_MAX: 255,
  
  // Image size limits (to prevent memory allocation failures)
  MAX_IMAGE_WIDTH: 2000,
  MAX_IMAGE_HEIGHT: 2000,
  MAX_PIXELS: 4000000, // 2000x2000 = 4M pixels max
} as const;

// Special label values for clustering
export const CLUSTER_LABELS = {
  TRANSPARENT: 255, // Special label for transparent/background pixels (safe since colorCount max is 10)
} as const;

// Timing constants
export const TIMING = {
  PREVIEW_DEBOUNCE_MS: 10,  // Debounce time for preview updates
  VECTORIZATION_DELAY_MS: 100,  // Delay before starting vectorization
  FLAG_RESET_DELAY_MS: 100,  // Delay before resetting ref flags
} as const;

// Morandi color palette (for SVG export)
export const MORANDI_COLORS = {
  COFFEE: '#A89F91',
  PINK: '#E8B4B8',
  CREAM: '#F5F1E8',
} as const;

// SVG export settings
export const SVG_EXPORT = {
  DEFAULT_STROKE_WIDTH: 2,
  FILE_PREFIX: 'vectorized',
} as const;