/**
 * Mosaic Generator Helper Functions
 * 
 * Utility functions specifically for the MosaicGeneratorV2 component
 * to improve code organization and reusability.
 */

import { ColorStats, Dimensions } from './types';

// ==================== COLOR STATISTICS ====================

/**
 * Calculate color statistics from color map
 * 
 * @param colorMap - 2D array of color indices
 * @param palette - Array of hex colors
 * @returns Array of color statistics sorted by count (descending)
 */
export function calculateColorStats(
  colorMap: number[][],
  palette: string[]
): ColorStats[] {
  const colorCounts: { [key: string]: number } = {};
  
  // Count occurrences of each color
  colorMap.forEach(row => {
    row.forEach(colorIndex => {
      const color = palette[colorIndex];
      if (color) {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
      }
    });
  });
  
  // Convert to array and sort by count
  const stats = Object.entries(colorCounts).map(([color, count]) => ({
    color,
    count,
  }));
  
  stats.sort((a, b) => b.count - a.count);
  
  return stats;
}

// ==================== ASPECT RATIO ====================

/**
 * Calculate new height based on aspect ratio
 * 
 * @param newWidth - New width in tiles
 * @param originalWidth - Original width in tiles
 * @param originalHeight - Original height in tiles
 * @returns Calculated height maintaining aspect ratio
 */
export function calculateAspectRatioHeight(
  newWidth: number,
  originalWidth: number,
  originalHeight: number
): number {
  if (originalWidth <= 0) return originalHeight;
  const aspectRatio = originalHeight / originalWidth;
  return Math.round(newWidth * aspectRatio);
}

/**
 * Calculate new width based on aspect ratio
 * 
 * @param newHeight - New height in tiles
 * @param originalWidth - Original width in tiles
 * @param originalHeight - Original height in tiles
 * @returns Calculated width maintaining aspect ratio
 */
export function calculateAspectRatioWidth(
  newHeight: number,
  originalWidth: number,
  originalHeight: number
): number {
  if (originalHeight <= 0) return originalWidth;
  const aspectRatio = originalWidth / originalHeight;
  return Math.round(newHeight * aspectRatio);
}

// ==================== IMAGE LOADING ====================

/**
 * Load image from file
 * 
 * @param file - Image file to load
 * @returns Promise resolving to HTMLImageElement
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ==================== CANVAS DIMENSIONS ====================

/**
 * Calculate initial canvas dimensions based on image
 * 
 * @param image - Source image
 * @param targetTiles - Target number of tiles (width or height)
 * @returns Calculated width and height in tiles
 */
export function calculateInitialDimensions(
  image: HTMLImageElement,
  targetTiles: number = 40
): Dimensions {
  const aspectRatio = image.width / image.height;
  
  let width: number;
  let height: number;
  
  if (aspectRatio >= 1) {
    // Landscape or square
    width = targetTiles;
    height = Math.round(targetTiles / aspectRatio);
  } else {
    // Portrait
    height = targetTiles;
    width = Math.round(targetTiles * aspectRatio);
  }
  
  // Ensure minimum size
  width = Math.max(10, width);
  height = Math.max(10, height);
  
  return { width, height };
}

// ==================== STATE VALIDATION ====================

/**
 * Validate mosaic state values
 * 
 * @param state - Partial state to validate
 * @returns Object with validation results and errors
 */
export function validateMosaicState(state: {
  mosaicWidth?: number;
  mosaicHeight?: number;
  numColors?: number;
  tileSize?: number;
  borderWidth?: number;
  tileDepth?: number;
}): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (state.mosaicWidth !== undefined && (state.mosaicWidth < 10 || state.mosaicWidth > 200)) {
    errors.push('Width must be between 10 and 200');
  }
  
  if (state.mosaicHeight !== undefined && (state.mosaicHeight < 10 || state.mosaicHeight > 200)) {
    errors.push('Height must be between 10 and 200');
  }
  
  if (state.numColors !== undefined && (state.numColors < 2 || state.numColors > 32)) {
    errors.push('Number of colors must be between 2 and 32');
  }
  
  if (state.tileSize !== undefined && (state.tileSize < 5 || state.tileSize > 50)) {
    errors.push('Tile size must be between 5 and 50');
  }
  
  if (state.borderWidth !== undefined && (state.borderWidth < 5 || state.borderWidth > 50)) {
    errors.push('Border width must be between 5 and 50');
  }
  
  if (state.tileDepth !== undefined && (state.tileDepth < 1 || state.tileDepth > 10)) {
    errors.push('Tile depth must be between 1 and 10');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== DEBOUNCE ====================

/**
 * Create a debounced version of a function
 * 
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

// ==================== COLOR UTILITIES ====================

/**
 * Check if a color is light or dark
 * 
 * @param hexColor - Hex color string
 * @returns true if color is light, false if dark
 */
export function isLightColor(hexColor: string): boolean {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5;
}

/**
 * Generate a contrasting text color (black or white) for a background color
 * 
 * @param backgroundColor - Background hex color
 * @returns '#000000' or '#ffffff'
 */
export function getContrastingTextColor(backgroundColor: string): string {
  return isLightColor(backgroundColor) ? '#000000' : '#ffffff';
}

// ==================== ARRAY UTILITIES ====================

/**
 * Create a 2D array filled with a default value
 * 
 * @param width - Array width
 * @param height - Array height
 * @param defaultValue - Value to fill with
 * @returns 2D array
 */
export function create2DArray<T>(
  width: number,
  height: number,
  defaultValue: T
): T[][] {
  const array: T[][] = [];
  
  for (let y = 0; y < height; y++) {
    array[y] = [];
    for (let x = 0; x < width; x++) {
      array[y][x] = defaultValue;
    }
  }
  
  return array;
}

/**
 * Deep clone a 2D array
 * 
 * @param array - 2D array to clone
 * @returns Cloned array
 */
export function clone2DArray<T>(array: T[][]): T[][] {
  return array.map(row => [...row]);
}
