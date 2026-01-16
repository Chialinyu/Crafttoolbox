/**
 * Type Definitions for Mosaic Generator
 * 
 * Centralized type definitions to improve type safety and code clarity
 */

// ==================== CORE TYPES ====================

/**
 * RGB color represented as a string "r,g,b"
 */
export type RgbString = string;

/**
 * Hex color represented as "#RRGGBB"
 */
export type HexColor = string;

/**
 * RGB color as an array [r, g, b]
 */
export type RgbArray = [number, number, number];

/**
 * 2D array of color indices, representing which color each tile uses
 * Special value: -1 represents transparent tiles
 */
export type ColorMap = number[][];

/**
 * Transparent color constant
 */
export const TRANSPARENT_COLOR_INDEX = -1;
export const TRANSPARENT_COLOR = 'rgba(0,0,0,0)';

// ==================== COMPONENT PROPS ====================

export interface MosaicGeneratorProps {
  onBack: () => void;
}

// ==================== STATE TYPES ====================

/**
 * Statistics about color usage in the mosaic
 */
export interface ColorStats {
  color: HexColor;
  count: number;
  percentage?: number;
}

/**
 * Complete mosaic state for history management
 */
export interface MosaicState {
  palette: HexColor[];
  tileColorMap: ColorMap;
  mosaicWidth: number;
  mosaicHeight: number;
  numColors: number;
  tileSize: number;
  tileSpacing: number;
  spacingColor: HexColor;
  borderEnabled: boolean;
  borderColor: HexColor;
  borderWidth: number;
  effect3D: boolean;
  tileDepth: number;
  originalPaletteSnapshot: HexColor[];
  modifiedColorIndices: Set<number>;
  colorStats: ColorStats[];
  hasTransparent?: boolean; // Whether the mosaic has transparent tiles
}

/**
 * Dimensions for canvas or image
 */
export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Canvas offsets for border rendering
 */
export interface Offsets {
  offsetX: number;
  offsetY: number;
}

/**
 * Tile position in grid coordinates
 */
export interface TilePosition {
  tileX: number;
  tileY: number;
}

/**
 * Pixel position on canvas
 */
export interface PixelPosition {
  x: number;
  y: number;
}

// ==================== DOWNLOAD TYPES ====================

export type DownloadFormat = 'png' | 'svg';

export interface DownloadOptions {
  format: DownloadFormat;
  filename?: string;
  quality?: number; // For PNG (0-1)
}

// ==================== EVENT HANDLERS ====================

export interface ColorChangeHandler {
  (colorIndex: number, newColor: HexColor): void;
}

export interface TileClickHandler {
  (tileX: number, tileY: number): void;
}

export interface CanvasSizeChangeHandler {
  (width: number, height: number): void;
}

// ==================== PANEL PROPS ====================

export interface ColorPalettePanelProps {
  palette: HexColor[];
  colorStats: ColorStats[];
  selectedColorGroup: number | null;
  hoveredColorGroup: number | null;
  modifiedColorIndices: Set<number>;
  hasTransparent?: boolean;
  transparentCount?: number;
  onColorGroupSelect: (index: number | null) => void;
  onColorGroupHover: (index: number | null) => void;
  onColorChange: ColorChangeHandler;
}

export interface ColorSettingsPanelProps {
  numColors: number;
  onNumColorsChange: (value: number) => void;
  onRegenerateClick: () => void;
}

export interface CanvasSizePanelProps {
  mosaicWidth: number;
  mosaicHeight: number;
  keepAspectRatio: boolean;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onAspectRatioToggle: (checked: boolean) => void;
}

export interface TileSettingsPanelProps {
  tileSize: number;
  tileSpacing: number;
  spacingColor: HexColor;
  showSpacingColorPicker: boolean;
  onTileSizeChange: (value: number) => void;
  onTileSpacingChange: (value: number) => void;
  onSpacingColorChange: (color: HexColor) => void;
  onToggleSpacingColorPicker: (show: boolean) => void;
}

export interface BorderEffectsPanelProps {
  borderEnabled: boolean;
  borderColor: HexColor;
  borderWidth: number;
  effect3D: boolean;
  tileDepth: number;
  showBorderColorPicker: boolean;
  onBorderEnabledChange: (enabled: boolean) => void;
  onBorderColorChange: (color: HexColor) => void;
  onBorderWidthChange: (value: number) => void;
  onEffect3DChange: (enabled: boolean) => void;
  onTileDepthChange: (value: number) => void;
  onToggleBorderColorPicker: (show: boolean) => void;
}

// ==================== CANVAS HANDLE ====================

/**
 * Methods exposed by MosaicCanvas via ref
 */
export interface MosaicCanvasHandle {
  /**
   * Get the current canvas element
   */
  getCanvas: () => HTMLCanvasElement | null;
  
  /**
   * Render the mosaic with current settings
   */
  render: () => void;
  
  /**
   * Download the mosaic in specified format
   */
  download: (options: DownloadOptions) => void;
  
  /**
   * Get current canvas dimensions
   */
  getCanvasDimensions: () => Dimensions;
}

// ==================== UTILITY TYPES ====================

/**
 * Extract the element type from an array
 */
export type ArrayElement<T> = T extends (infer U)[] ? U : never;

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make specific properties required
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;