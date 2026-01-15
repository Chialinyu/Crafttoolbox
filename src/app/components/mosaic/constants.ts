/**
 * Mosaic Generator Constants
 * 
 * Centralized configuration and constants for the mosaic generator
 * to improve maintainability and avoid magic numbers.
 */

// ==================== DEFAULT VALUES ====================

export const DEFAULTS = {
  // Canvas dimensions (in tiles)
  CANVAS_WIDTH: 40,
  CANVAS_HEIGHT: 40,
  
  // Color settings
  NUM_COLORS: 8,
  MIN_COLORS: 2,
  MAX_COLORS: 32,
  
  // Tile settings
  TILE_SIZE: 20,
  TILE_SPACING: 2,
  MIN_TILE_SIZE: 5,
  MAX_TILE_SIZE: 50,
  
  // Border settings
  BORDER_WIDTH: 10,
  MIN_BORDER_WIDTH: 5,
  MAX_BORDER_WIDTH: 50,
  
  // 3D effect
  TILE_DEPTH: 3,
  MIN_TILE_DEPTH: 1,
  MAX_TILE_DEPTH: 10,
  
  // Canvas size limits
  MIN_CANVAS_DIMENSION: 10,
  MAX_CANVAS_DIMENSION: 200,
} as const;

// ==================== COLOR DEFAULTS ====================

export const DEFAULT_COLORS = {
  SPACING: '#F5F1E8',      // 米白色 - Morandi beige
  BORDER: '#A89F91',       // 帶灰色調的咖啡色 - Morandi brown
  BACKGROUND: '#F5F1E8',   // 米白色背景
} as const;

// ==================== THRESHOLDS ====================

export const THRESHOLDS = {
  // Segment memory IoU threshold for matching modified segments
  SEGMENT_MATCH_IOU: 0.3,
  
  // Color similarity threshold (Delta E) for color mapping
  COLOR_SIMILARITY: 15,
  
  // Debounce delay for color count changes (ms)
  COLOR_CHANGE_DEBOUNCE: 100,
} as const;

// ==================== UI CONSTANTS ====================

export const UI = {
  // Animation duration
  ANIMATION_DURATION: 0.2,
  
  // Hover states
  HOVER_SCALE: 1.05,
  
  // Panel spacing
  PANEL_GAP: 16,
} as const;

// ==================== DOWNLOAD FORMATS ====================

export const DOWNLOAD_FORMATS = ['png', 'svg'] as const;
export type DownloadFormat = typeof DOWNLOAD_FORMATS[number];

// ==================== VALIDATION ====================

export const VALIDATION = {
  isValidTileSize: (size: number) => 
    size >= DEFAULTS.MIN_TILE_SIZE && size <= DEFAULTS.MAX_TILE_SIZE,
  
  isValidColorCount: (count: number) => 
    count >= DEFAULTS.MIN_COLORS && count <= DEFAULTS.MAX_COLORS,
  
  isValidCanvasDimension: (dimension: number) =>
    dimension >= DEFAULTS.MIN_CANVAS_DIMENSION && dimension <= DEFAULTS.MAX_CANVAS_DIMENSION,
  
  isValidBorderWidth: (width: number) =>
    width >= DEFAULTS.MIN_BORDER_WIDTH && width <= DEFAULTS.MAX_BORDER_WIDTH,
  
  isValidTileDepth: (depth: number) =>
    depth >= DEFAULTS.MIN_TILE_DEPTH && depth <= DEFAULTS.MAX_TILE_DEPTH,
} as const;

// ==================== ERROR MESSAGES ====================

export const ERROR_MESSAGES = {
  INVALID_IMAGE: 'Invalid image file',
  CANVAS_TOO_LARGE: 'Canvas dimensions exceed maximum allowed size',
  INVALID_COLOR_COUNT: 'Color count must be between 2 and 32',
  GENERATION_FAILED: 'Failed to generate mosaic',
} as const;
