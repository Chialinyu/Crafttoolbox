/**
 * Mosaic Utilities
 * Canvas calculation and tile positioning functions
 */

/**
 * Calculate border offsets for drawing
 * @param borderEnabled - Whether border is enabled
 * @param borderWidth - Border width in pixels
 * @returns Object with offsetX and offsetY
 */
export const calculateOffsets = (
  borderEnabled: boolean,
  borderWidth: number
): { offsetX: number; offsetY: number } => ({
  offsetX: borderEnabled ? borderWidth : 0,
  offsetY: borderEnabled ? borderWidth : 0,
});

/**
 * Calculate canvas dimensions based on mosaic parameters
 * @param tilesX - Number of tiles horizontally
 * @param tilesY - Number of tiles vertically
 * @param tileSize - Size of each tile in pixels
 * @param tileSpacing - Spacing between tiles in pixels
 * @param borderEnabled - Whether border is enabled
 * @param borderWidth - Border width in pixels
 * @returns Object with width and height
 */
export const calculateCanvasSize = (
  tilesX: number,
  tilesY: number,
  tileSize: number,
  tileSpacing: number,
  borderEnabled: boolean,
  borderWidth: number
): { width: number; height: number } => {
  const totalBorder = borderEnabled ? borderWidth * 2 : 0;
  return {
    width: tilesX * (tileSize + tileSpacing) - tileSpacing + totalBorder,
    height: tilesY * (tileSize + tileSpacing) - tileSpacing + totalBorder,
  };
};

/**
 * Calculate tile position from canvas coordinates
 * Used for click detection on canvas
 * @param canvasX - X coordinate on canvas
 * @param canvasY - Y coordinate on canvas
 * @param offsetX - Border offset X
 * @param offsetY - Border offset Y
 * @param tileSize - Size of each tile in pixels
 * @param tileSpacing - Spacing between tiles in pixels
 * @returns Object with tileX and tileY indices, or null if invalid
 */
export const calculateTilePosition = (
  canvasX: number,
  canvasY: number,
  offsetX: number,
  offsetY: number,
  tileSize: number,
  tileSpacing: number
): { tileX: number; tileY: number } => {
  const tileX = Math.floor((canvasX - offsetX) / (tileSize + tileSpacing));
  const tileY = Math.floor((canvasY - offsetY) / (tileSize + tileSpacing));
  return { tileX, tileY };
};

/**
 * Calculate pixel position for a tile
 * @param tileX - Tile X index
 * @param tileY - Tile Y index
 * @param offsetX - Border offset X
 * @param offsetY - Border offset Y
 * @param tileSize - Size of each tile in pixels
 * @param tileSpacing - Spacing between tiles in pixels
 * @returns Object with px and py pixel coordinates
 */
export const calculatePixelPosition = (
  tileX: number,
  tileY: number,
  offsetX: number,
  offsetY: number,
  tileSize: number,
  tileSpacing: number
): { px: number; py: number } => {
  return {
    px: offsetX + tileX * (tileSize + tileSpacing),
    py: offsetY + tileY * (tileSize + tileSpacing),
  };
};

/**
 * Check if tile coordinates are within bounds
 * @param tileX - Tile X index
 * @param tileY - Tile Y index
 * @param maxWidth - Maximum width in tiles
 * @param maxHeight - Maximum height in tiles
 * @returns True if within bounds
 */
export const isTileInBounds = (
  tileX: number,
  tileY: number,
  maxWidth: number,
  maxHeight: number
): boolean => {
  return tileX >= 0 && tileX < maxWidth && tileY >= 0 && tileY < maxHeight;
};

/**
 * Calculate total number of tiles
 * @param width - Width in tiles
 * @param height - Height in tiles
 * @returns Total tile count
 */
export const calculateTotalTiles = (width: number, height: number): number => {
  return width * height;
};

/**
 * Calculate actual physical dimensions of mosaic
 * @param tilesX - Number of tiles horizontally
 * @param tilesY - Number of tiles vertically
 * @param tileSize - Size of each tile in pixels (representing real-world size)
 * @param tileSpacing - Spacing between tiles in pixels
 * @param borderWidth - Border width in pixels
 * @param borderEnabled - Whether border is enabled
 * @returns Object with totalWidth and totalHeight
 */
export const calculatePhysicalSize = (
  tilesX: number,
  tilesY: number,
  tileSize: number,
  tileSpacing: number,
  borderWidth: number,
  borderEnabled: boolean
): { totalWidth: number; totalHeight: number } => {
  const { width, height } = calculateCanvasSize(
    tilesX,
    tilesY,
    tileSize,
    tileSpacing,
    borderEnabled,
    borderWidth
  );
  return { totalWidth: width, totalHeight: height };
};
