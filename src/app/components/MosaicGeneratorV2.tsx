import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Copy, ArrowLeft, Undo, Redo, RotateCcw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useViewportHeight } from '../../hooks/useViewportHeight';
import { motion } from 'motion/react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ToolPageLayout } from './ui/ToolPageLayout';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';

import {
  rgbToHex,
  hexToRgb,
  hexToRgbArray,
  findClosestColor,
  quantizeColors,
  deduplicatePalette,
  reducePalette,
  processImageDataForTransparency,
} from '../../utils/colorUtils';
import { calculateOffsets, calculateCanvasSize } from '../../utils/mosaicUtils';
import { SegmentMemory } from '../../utils/segmentMemory';
import { analyzeColorDistribution, ColorDistributionStats } from '../../utils/colorDistribution';

import { useMosaicHistory } from '../../hooks/useMosaicHistory';

import {
  MosaicCanvas,
  MosaicCanvasHandle,
  ColorPalettePanel,
  ColorSettingsPanel,
  CanvasSizePanel,
  TileSettingsPanel,
  BorderEffectsPanel,
} from './mosaic';

/**
 * 🎨 MOSAIC GENERATOR V2
 * 
 * 🔑 CORE INNOVATIONS:
 * 
 * 1️⃣ ColorMap Index Mapping System
 *    - Decouples tile colors from palette indices
 *    - Enables dynamic palette adjustments without recalculating entire mosaic
 * 
 * 2️⃣ SegmentMemory Spatial Memory System
 *    - Tracks SPATIAL REGIONS of user color modifications (not just color mappings)
 *    - Preserves modifications across canvas resize, color merges, and re-segmentation
 *    - Uses IoU (Intersection over Union) to match segments after canvas changes
 * 
 * 🐛 CRITICAL BUGS FIXED:
 * 
 * [2025-01-16] Color Merge + Canvas Resize Bug
 *   Problem: When merging colors (e.g., changing two colors to white), then resizing
 *            canvas, the merged colors would revert to their original colors.
 *   
 *   Root Cause Chain:
 *   1. Color picker fired onChange twice (browser quirk)
 *   2. First call: Record modification, detect duplicate, merge colors
 *   3. Second call: Try to merge again but palette already changed
 *   4. removeModificationsForColor() deleted the spatial memory
 *   5. originalPaletteSnapshot was being updated during merge
 *   
 *   Solution:
 *   ✅ Anti-duplicate check: if palette[index] === newColor, return early
 *   ✅ NEVER update originalPaletteSnapshot after initial generation
 *   ✅ NEVER call removeModificationsForColor() during color merge
 *   ✅ Keep ALL SegmentMemory modifications for canvas resize to work
 *   
 *   Why it works:
 *   - originalPaletteSnapshot = base reference (never changes)
 *   - Canvas resize re-samples with base palette
 *   - SegmentMemory re-applies ALL modifications (including merged colors)
 *   - Result: Merged colors persist correctly ✨
 * 
 * 📊 Color Modification Workflow:
 *   Initial:  palette=[色1, 色2, ..., 色7], originalSnapshot=[色1, 色2, ..., 色7]
 *   User:     index=4 → white (recorded in SegmentMemory)
 *   User:     index=5 → white (merge detected, palette becomes 6 colors)
 *   SegmentMemory: [(4, 色4→white), (5, 色5→white)] ← BOTH preserved!
 *   Resize:   Re-sample with 7-color base → Apply both modifications → White persists ✅
 */

interface ColorStats {
  color: string;
  count: number;
}

interface MosaicGeneratorProps {
  onBack: () => void;
}

export const MosaicGenerator: React.FC<MosaicGeneratorProps> = ({ onBack }) => {
  const { t } = useLanguage();
  const { viewportHeight, stickyTop } = useViewportHeight();

  const canvasRef = useRef<MosaicCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorChangeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sliderChangeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const prevMosaicDimensionsRef = useRef<{ width: number; height: number }>({ width: 40, height: 40 });
  const isRestoringHistoryRef = useRef(false);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [mosaicWidth, setMosaicWidth] = useState(40);
  const [mosaicHeight, setMosaicHeight] = useState(40);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);

  const [numColors, setNumColors] = useState(8);
  const [prevNumColors, setPrevNumColors] = useState(8);
  const [palette, setPalette] = useState<string[]>([]);
  const [paletteModified, setPaletteModified] = useState(false);
  const [modifiedColorIndices, setModifiedColorIndices] = useState<Set<number>>(new Set());
  const segmentMemoryRef = useRef<SegmentMemory>(new SegmentMemory());
  
  // 🎯 COLOR MAPPING SYSTEM - Critical refs for handling color modifications
  // originalPaletteSnapshot: Stores the INITIAL palette from image generation
  //   - Never modified after initial generation
  //   - Used as reference when resizing canvas to remap colors correctly
  //   - SegmentMemory tracks all user modifications on top of this base
  const originalPaletteSnapshotRef = useRef<string[]>([]);
  
  const [colorStats, setColorStats] = useState<ColorStats[]>([]);
  const [hasTransparent, setHasTransparent] = useState(false);
  const [transparentCount, setTransparentCount] = useState(0);

  const [tileSize, setTileSize] = useState(20);
  const [tileSpacing, setTileSpacing] = useState(2);
  const [spacingColor, setSpacingColor] = useState('#F5F1E8');
  const [tileColorMap, setTileColorMap] = useState<number[][]>([]);

  const [borderEnabled, setBorderEnabled] = useState(false);
  const [borderColor, setBorderColor] = useState('#A89F91');
  const [borderWidth, setBorderWidth] = useState(10);

  const [effect3D, setEffect3D] = useState(false);
  const [tileDepth, setTileDepth] = useState(3);

  const [selectedColorGroup, setSelectedColorGroup] = useState<number | null>(null);
  const [hoveredColorGroup, setHoveredColorGroup] = useState<number | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<number | null>(null);
  const [showBackgroundColorPicker, setShowBackgroundColorPicker] = useState(false);
  const [showSpacingColorPicker, setShowSpacingColorPicker] = useState(false);
  const [showBorderColorPicker, setShowBorderColorPicker] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'svg'>('png');

  const [isGenerating, setIsGenerating] = useState(false);
  const [imageChanged, setImageChanged] = useState(false);

  const { addToHistory, undo, redo, resetHistory, canUndo, canRedo } = useMosaicHistory();

  // Define updateColorStats FIRST (before applyStateFromHistory uses it)
  const updateColorStats = useCallback((colorMap: number[][], currentPalette?: string[]) => {
    const paletteToUse = currentPalette || palette;
    const colorCounts: { [key: string]: number } = {};
    let transparentTileCount = 0;
    
    colorMap.forEach(row => {
      row.forEach(colorIndex => {
        if (colorIndex === -1) {
          // Transparent tile
          transparentTileCount++;
        } else {
          const color = paletteToUse[colorIndex];
          if (color) {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
          }
        }
      });
    });

    const stats = Object.entries(colorCounts)
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count);
    
    setColorStats(stats);
    setHasTransparent(transparentTileCount > 0);
    setTransparentCount(transparentTileCount);
  }, [palette]);

  // Helper to create current state snapshot for history
  const createStateSnapshot = useCallback(() => ({
    colorMap: tileColorMap.map(row => [...row]),
    palette: [...palette],
    mosaicWidth,
    mosaicHeight,
    numColors,
    tileSize,
    tileSpacing,
    spacingColor,
    borderEnabled,
    borderColor,
    borderWidth,
    effect3D,
    tileDepth,
  }), [
    tileColorMap, palette, mosaicWidth, mosaicHeight, numColors,
    tileSize, tileSpacing, spacingColor, borderEnabled,
    borderColor, borderWidth, effect3D, tileDepth
  ]);

  // Helper to apply state from history
  const applyStateFromHistory = useCallback((state: any) => {
    setTileColorMap(state.colorMap);
    setPalette(state.palette);
    setMosaicWidth(state.mosaicWidth);
    setMosaicHeight(state.mosaicHeight);
    setNumColors(state.numColors);
    setPrevNumColors(state.numColors); // Important: also update prevNumColors
    setTileSize(state.tileSize);
    setTileSpacing(state.tileSpacing);
    setSpacingColor(state.spacingColor || '#F5F1E8');  // Default if undefined
    setBorderEnabled(state.borderEnabled);
    setBorderColor(state.borderColor || '#A89F91');  // Default if undefined
    setBorderWidth(state.borderWidth);
    setEffect3D(state.effect3D);
    setTileDepth(state.tileDepth);
    updateColorStats(state.colorMap, state.palette);
    
    // CRITICAL: Update prevMosaicDimensionsRef to prevent useEffect from thinking dimensions changed
    prevMosaicDimensionsRef.current = { width: state.mosaicWidth, height: state.mosaicHeight };
    
    // CRITICAL: Reset selectedColorGroup if it's out of bounds
    // This can happen when undoing a color merge operation
    setSelectedColorGroup(prev => {
      if (prev !== null && prev >= state.palette.length) {
        return null;
      }
      return prev;
    });
  }, [updateColorStats]);

  const expandPalette = useCallback((currentPalette: string[], targetCount: number) => {
    if (!image || targetCount <= currentPalette.length) return currentPalette;

    const tilesX = mosaicWidth;
    const tilesY = mosaicHeight;

    // Resample image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tilesX;
    tempCanvas.height = tilesY;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return currentPalette;

    tempCtx.drawImage(image, 0, 0, tilesX, tilesY);
    const imageData = tempCtx.getImageData(0, 0, tilesX, tilesY);

    // Extract more colors from image
    const extraColorsNeeded = targetCount - currentPalette.length;
    const generatedPalette = quantizeColors(imageData, targetCount + 20);

    // Analyze color distribution to get smart thresholds
    const colorStats = analyzeColorDistribution(currentPalette);

    // Deduplicate generated palette
    const uniqueGeneratedPalette: string[] = [];
    const seenColors = new Set<string>();
    
    for (const color of generatedPalette) {
      if (!seenColors.has(color)) {
        seenColors.add(color);
        uniqueGeneratedPalette.push(color);
      }
    }

    // Filter out colors similar to existing ones
    const newColors: string[] = [];
    let similarityThreshold = Math.max(20, colorStats.minColorDistance * 0.8);
    
    // Try to find distinct colors, relaxing threshold if needed
    while (newColors.length < extraColorsNeeded && similarityThreshold <= 100) {
      for (const color of uniqueGeneratedPalette) {
        if (newColors.length >= extraColorsNeeded) break;
        if (newColors.includes(color)) continue;
        if (currentPalette.includes(color)) continue;
        
        const colorRgb = hexToRgbArray(color);
        const isSimilarToExisting = currentPalette.some(existingColor => {
          if (!existingColor) return false;  // Guard against undefined
          const existingRgb = hexToRgbArray(existingColor.startsWith('#') ? existingColor : rgbToHex(existingColor));
          const distance = Math.sqrt(
            Math.pow(colorRgb[0] - existingRgb[0], 2) +
            Math.pow(colorRgb[1] - existingRgb[1], 2) +
            Math.pow(colorRgb[2] - existingRgb[2], 2)
          );
          return distance < similarityThreshold;
        });
        
        const isSimilarToNew = newColors.some(newColor => {
          const newColorRgb = hexToRgbArray(newColor);
          const distance = Math.sqrt(
            Math.pow(colorRgb[0] - newColorRgb[0], 2) +
            Math.pow(colorRgb[1] - newColorRgb[1], 2) +
            Math.pow(colorRgb[2] - newColorRgb[2], 2)
          );
          return distance < 10;
        });

        if (!isSimilarToExisting && !isSimilarToNew) {
          newColors.push(color);
        }
      }
      
      if (newColors.length < extraColorsNeeded) {
        similarityThreshold += 20;
      }
    }

    const finalPalette = [...currentPalette, ...newColors];
    const uniqueFinalPalette = Array.from(new Set(finalPalette));
    
    return uniqueFinalPalette;
  }, [image, mosaicWidth, mosaicHeight]);

  const reducePaletteByUsage = useCallback((
    currentPalette: string[],
    currentColorMap: number[][],
    targetCount: number,
    userModifiedIndices: Set<number>
  ) => {
    if (targetCount >= currentPalette.length) return { palette: currentPalette, colorMap: currentColorMap };

    // Count color usage
    const colorUsage: { index: number; count: number; color: string; isModified: boolean }[] = currentPalette.map((color, index) => ({
      index,
      color,
      count: 0,
      isModified: userModifiedIndices.has(index),
    }));

    currentColorMap.forEach(row => {
      row.forEach(colorIndex => {
        if (colorUsage[colorIndex]) {
          colorUsage[colorIndex].count++;
        }
      });
    });

    // Separate modified and non-modified colors
    const modifiedColors = colorUsage.filter(c => c.isModified);
    const nonModifiedColors = colorUsage.filter(c => !c.isModified);

    // Sort by usage
    modifiedColors.sort((a, b) => b.count - a.count);
    nonModifiedColors.sort((a, b) => b.count - a.count);

    // Strategy: Keep as many modified colors as possible, then fill with most-used non-modified colors
    let keptColors: typeof colorUsage = [];
    
    if (modifiedColors.length >= targetCount) {
      // If we have more modified colors than target, keep the most-used modified colors
      keptColors = modifiedColors.slice(0, targetCount);
    } else {
      // Keep all modified colors, then add non-modified colors to reach target
      keptColors = [
        ...modifiedColors,
        ...nonModifiedColors.slice(0, targetCount - modifiedColors.length)
      ];
    }

    const keptIndices = new Set(keptColors.map(c => c.index));

    // Create new palette
    const newPalette = keptColors.map(c => c.color);

    // Update modified indices for the new palette
    const newModifiedIndices = new Set<number>();
    keptColors.forEach((c, newIndex) => {
      if (c.isModified) {
        newModifiedIndices.add(newIndex);
      }
    });
    setModifiedColorIndices(newModifiedIndices);

    // Create mapping from old index to new index
    const indexMapping: { [key: number]: number } = {};
    keptColors.forEach((c, newIndex) => {
      indexMapping[c.index] = newIndex;
    });

    // For removed colors, find closest remaining color
    currentPalette.forEach((color, oldIndex) => {
      if (!keptIndices.has(oldIndex)) {
        const colorRgb = hexToRgb(color);
        let closestIndex = 0;
        let closestDistance = Infinity;

        newPalette.forEach((newColor, newIndex) => {
          const newColorRgb = hexToRgb(newColor);
          const distance = Math.sqrt(
            Math.pow(colorRgb[0] - newColorRgb[0], 2) +
            Math.pow(colorRgb[1] - newColorRgb[1], 2) +
            Math.pow(colorRgb[2] - newColorRgb[2], 2)
          );
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = newIndex;
          }
        });

        indexMapping[oldIndex] = closestIndex;
      }
    });

    // Remap color map
    const newColorMap = currentColorMap.map(row =>
      row.map(oldIndex => indexMapping[oldIndex] ?? 0)
    );

    return { palette: newPalette, colorMap: newColorMap };
  }, []);

  const generateMosaic = (overrideWidth?: number, overrideHeight?: number) => {
    if (!image) return;
    
    if (isRestoringHistoryRef.current) return;

    const tilesX = overrideWidth ?? mosaicWidth;
    const tilesY = overrideHeight ?? mosaicHeight;

    // Resample image to mosaic dimensions
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tilesX;
    tempCanvas.height = tilesY;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.drawImage(image, 0, 0, tilesX, tilesY);
    const rawImageData = tempCtx.getImageData(0, 0, tilesX, tilesY);

    // Process transparency: extract transparent pixels and composite semi-transparent ones
    const { imageData, transparentMask } = processImageDataForTransparency(rawImageData);

    // Generate and process color palette (only from non-transparent pixels)
    const generatedPalette = quantizeColors(imageData, numColors);
    const { uniqueColors: dedupedColors, mapping: dedupeMapping } = deduplicatePalette(generatedPalette);
    const { reducedColors: finalPalette, mapping: reduceMapping } = reducePalette(dedupedColors, numColors);

    // Create tile color map
    const newColorMap: number[][] = [];

    for (let y = 0; y < tilesY; y++) {
      newColorMap[y] = [];
      for (let x = 0; x < tilesX; x++) {
        const pixelIndex = y * tilesX + x;
        
        if (transparentMask[pixelIndex] === 1) {
          // Transparent tile
          newColorMap[y][x] = -1;
        } else {
          // Non-transparent tile - find closest color
          const i = pixelIndex * 4;
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];

          const oldColorIndex = findClosestColor(r, g, b, generatedPalette);
          const dedupedIndex = dedupeMapping[oldColorIndex];
          const finalColorIndex = reduceMapping[dedupedIndex];
          newColorMap[y][x] = finalColorIndex;
        }
      }
    }

    // Apply segment memory modifications (if any)
    const hasModifications = segmentMemoryRef.current.size() > 0;
    let finalPaletteWithModifications = finalPalette;
    
    if (hasModifications) {
      finalPaletteWithModifications = segmentMemoryRef.current.applyModificationsToPalette(
        newColorMap,
        finalPalette
      );
    }
    
    setPalette(finalPaletteWithModifications);
    setPaletteModified(hasModifications);
    originalPaletteSnapshotRef.current = finalPalette;  // 🔥 FIX: Use ref for immediate sync
    setModifiedColorIndices(new Set());
    setTileColorMap(newColorMap);

    // Determine if this is a new image upload or a color count change
    const isNewImageOrFirstGeneration = tileColorMap.length === 0 || imageChanged;
    
    if (isNewImageOrFirstGeneration) {
      // Initialize history with complete state (for new images)
      resetHistory({
        colorMap: newColorMap,
        palette: finalPaletteWithModifications,
        mosaicWidth: tilesX,
        mosaicHeight: tilesY,
        numColors,
        tileSize,
        tileSpacing,
        spacingColor,
        borderEnabled,
        borderColor,
        borderWidth,
        effect3D,
        tileDepth,
      });
    } else {
      // Add to history (for color count changes)
      addToHistory({
        colorMap: newColorMap,
        palette: finalPaletteWithModifications,
        mosaicWidth: tilesX,
        mosaicHeight: tilesY,
        numColors: finalPaletteWithModifications.length,  // 🔥 Use actual palette length
        tileSize,
        tileSpacing,
        spacingColor,
        borderEnabled,
        borderColor,
        borderWidth,
        effect3D,
        tileDepth,
      });
    }

    // Update statistics
    updateColorStats(newColorMap, finalPaletteWithModifications);
  };

  const resampleMosaicWithPalette = useCallback(() => {
    if (!image || palette.length === 0) return;
    
    if (isRestoringHistoryRef.current) return;
    
    if (colorChangeTimerRef.current) {
      clearTimeout(colorChangeTimerRef.current);
      colorChangeTimerRef.current = null;
    }
    
    const tilesX = mosaicWidth;
    const tilesY = mosaicHeight;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tilesX;
    tempCanvas.height = tilesY;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) {
      return;
    }

    tempCtx.drawImage(image, 0, 0, tilesX, tilesY);
    const imageData = tempCtx.getImageData(0, 0, tilesX, tilesY);

    const newColorMap: number[][] = [];
    for (let y = 0; y < tilesY; y++) {
      newColorMap[y] = [];
      for (let x = 0; x < tilesX; x++) {
        const i = (y * tilesX + x) * 4;
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        const colorIndex = findClosestColor(r, g, b, palette);
        newColorMap[y][x] = colorIndex;
      }
    }
    
    setTileColorMap(newColorMap);
    updateColorStats(newColorMap, palette);
    
    addToHistory({
      colorMap: newColorMap,
      palette: [...palette],
      mosaicWidth,
      mosaicHeight,
      numColors,
      tileSize,
      tileSpacing,
      spacingColor,
      borderEnabled,
      borderColor,
      borderWidth,
      effect3D,
      tileDepth,
    });
  }, [image, palette, mosaicWidth, mosaicHeight, numColors, tileSize, tileSpacing, 
      spacingColor, borderEnabled, borderColor, borderWidth, effect3D, tileDepth, 
      addToHistory, updateColorStats]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // ALWAYS recalculate mosaic size on new image upload
          const aspectRatio = img.width / img.height;
          
          // Target total tiles: ~1600 tiles (40x40)
          // This ensures both dimensions have reasonable sizes
          const targetTiles = 1600;
          const targetWidth = Math.round(Math.sqrt(targetTiles * aspectRatio));
          const targetHeight = Math.round(targetWidth / aspectRatio);
          
          // Ensure minimum 20 tiles on each side
          const finalWidth = Math.max(20, targetWidth);
          const finalHeight = Math.max(20, targetHeight);
          
          // Store dimensions in ref for useEffect to use
          pendingDimensionsRef.current = { width: finalWidth, height: finalHeight };
          
          // CRITICAL: Clear ALL state when uploading new image
          // This prevents memory leaks and ensures clean slate for new image
          setTileColorMap([]);
          
          // Clear segment memory - each image should have its own memory
          // Don't carry over modifications from previous images!
          segmentMemoryRef.current.clear();
          
          // Update dimensions and image
          setMosaicWidth(finalWidth);
          setMosaicHeight(finalHeight);
          setKeepAspectRatio(true);
          setImage(img);
          setImageChanged(true);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCanvasTileClick = (tileX: number, tileY: number) => {
    if (selectedColorGroup === null || tileColorMap.length === 0) return;

    // Only change if different from current color
    if (tileColorMap[tileY][tileX] !== selectedColorGroup) {
      const newColorMap = tileColorMap.map(row => [...row]);
      newColorMap[tileY][tileX] = selectedColorGroup;
      
      setTileColorMap(newColorMap);
      updateColorStats(newColorMap);
      
      // Add to history with complete state (using current state values)
      addToHistory({
        colorMap: newColorMap,
        palette: [...palette],
        mosaicWidth,
        mosaicHeight,
        numColors: palette.length,  // 🔥 Use actual palette length
        tileSize,
        tileSpacing,
        spacingColor,
        borderEnabled,
        borderColor,
        borderWidth,
        effect3D,
        tileDepth,
      });
    }
  };

  const handleColorChange = (colorIndex: number, newColor: string) => {
    if (!newColor) return;
    const newColorHex = newColor.startsWith('#') ? newColor : `#${newColor}`;
    
    // Get original color from snapshot for SegmentMemory tracking
    const oldColorHex = originalPaletteSnapshotRef.current[colorIndex] || palette[colorIndex];
    if (!oldColorHex) return;
    
    // Convert to "r,g,b" format for SegmentMemory
    const oldColorRgbArray = hexToRgbArray(oldColorHex.startsWith('#') ? oldColorHex : rgbToHex(oldColorHex));
    const newColorRgbArray = hexToRgbArray(newColorHex);
    
    const oldColorRgbString = oldColorRgbArray.join(',');
    const newColorRgbString = newColorRgbArray.join(',');
    
    // Record modification in SegmentMemory (tracks spatial regions + color changes)
    segmentMemoryRef.current.recordModification(
      tileColorMap,
      colorIndex,
      oldColorRgbString,
      newColorRgbString
    );
    
    // Convert to RGB format for palette consistency
    const newColorRgb = hexToRgb(newColorHex);
    
    // 🔥 ANTI-DUPLICATE: Prevent redundant operations if color already matches
    // This handles color picker double-firing and repeated clicks
    if (palette[colorIndex] === newColorRgb) {
      return;
    }
    
    setPaletteModified(true);
    
    // Mark this color index as modified
    setModifiedColorIndices(prev => {
      const newSet = new Set(prev);
      newSet.add(colorIndex);
      return newSet;
    });
    
    // Check if this color already exists in palette (auto-merge duplicates)
    const existingIndex = palette.findIndex((c, i) => i !== colorIndex && c === newColorRgb);
    
    if (existingIndex !== -1) {
      // 🎯 COLOR MERGE: User changed a color to match another existing color
      // Remove the duplicate and remap all tile indices
      const newPalette = palette.filter((_, i) => i !== colorIndex);
      
      // Remap all tile indices: merge colorIndex into existingIndex, shift others down
      const newColorMap = tileColorMap.map(row => 
        row.map(idx => {
          if (idx === colorIndex) {
            return existingIndex > colorIndex ? existingIndex - 1 : existingIndex;
          } else if (idx > colorIndex) {
            return idx - 1;
          } else {
            return idx;
          }
        })
      );
      
      // 🎯 CRITICAL: Preserve SegmentMemory when merging colors
      // Problem solved: User changes index=4 and index=5 both to white, triggering merge
      //   - WITHOUT preserving: Only index=4 modification saved, index=5 lost
      //   - Canvas resize would only apply index=4 change, index=5 reverts to original
      // Solution: Keep ALL modifications in SegmentMemory, even for merged colors
      //   - Both (4→white) and (5→white) are preserved
      //   - Canvas resize correctly re-applies both changes
      
      // 🎯 CRITICAL: Never modify originalPaletteSnapshot after initial generation
      // It must remain the original palette for canvas resize remapping to work
      // The merge is reflected in current palette state, not the base snapshot
      
      setPalette(newPalette);
      setTileColorMap(newColorMap);
      
      // Update numColors to match new palette length
      setNumColors(newPalette.length);
      setPrevNumColors(newPalette.length);
      
      // When merging colors, update selection to the merged color
      if (selectedColorGroup === colorIndex) {
        setSelectedColorGroup(existingIndex > colorIndex ? existingIndex - 1 : existingIndex);
      } else if (selectedColorGroup !== null && selectedColorGroup > colorIndex) {
        setSelectedColorGroup(selectedColorGroup - 1);
      }
      
      updateColorStats(newColorMap, newPalette);
      
      // Debounce history update
      if (colorChangeTimerRef.current) {
        clearTimeout(colorChangeTimerRef.current);
      }
      
      colorChangeTimerRef.current = setTimeout(() => {
        // 🔥 CRITICAL: Use newColorMap and newPalette.length, not captured closure values!
        addToHistory({
          colorMap: newColorMap,
          palette: newPalette,
          mosaicWidth,
          mosaicHeight,
          numColors: newPalette.length, // ✅ Use actual palette length
          tileSize,
          tileSpacing,
          spacingColor,
          borderEnabled,
          borderColor,
          borderWidth,
          effect3D,
          tileDepth,
        });
      }, 300);
    } else {
      // Update color normally - store in RGB format to maintain consistency
      const newPalette = [...palette];
      newPalette[colorIndex] = newColorRgb;
      setPalette(newPalette);
      
      updateColorStats(tileColorMap, newPalette);
      
      // Debounce history update
      if (colorChangeTimerRef.current) {
        clearTimeout(colorChangeTimerRef.current);
      }
      
      // 🔥 CRITICAL: Capture colorMap NOW (outside setTimeout) to avoid closure issues
      const colorMapCopy = tileColorMap.map(row => [...row]);
      
      colorChangeTimerRef.current = setTimeout(() => {
        addToHistory({
          colorMap: colorMapCopy,
          palette: newPalette,
          mosaicWidth,
          mosaicHeight,
          numColors: newPalette.length,  // 🔥 Use actual palette length
          tileSize,
          tileSpacing,
          spacingColor,
          borderEnabled,
          borderColor,
          borderWidth,
          effect3D,
          tileDepth,
        });
      }, 300);
    }
  };

  const handleUndo = useCallback(() => {
    const previousState = undo();
    if (previousState) {
      isRestoringHistoryRef.current = true;
      applyStateFromHistory(previousState);
      
      // Just redraw canvas with the restored state
      setTimeout(() => {
        canvasRef.current?.redraw();
        isRestoringHistoryRef.current = false;
      }, 50);
    }
  }, [undo, applyStateFromHistory]);

  const handleRedo = useCallback(() => {
    const nextState = redo();
    if (nextState) {
      isRestoringHistoryRef.current = true;
      applyStateFromHistory(nextState);
      
      // Just redraw canvas with the restored state
      setTimeout(() => {
        canvasRef.current?.redraw();
        isRestoringHistoryRef.current = false;
      }, 50);
    }
  }, [redo, applyStateFromHistory]);

  const handleReset = useCallback(() => {
    // Reset to "just uploaded" state - keep image but reset all parameters
    if (!image) return;
    
    // Recalculate mosaic dimensions based on image aspect ratio (same logic as upload)
    const aspectRatio = image.width / image.height;
    const targetTiles = 1600;
    const targetWidth = Math.round(Math.sqrt(targetTiles * aspectRatio));
    const targetHeight = Math.round(targetWidth / aspectRatio);
    const finalWidth = Math.max(20, targetWidth);
    const finalHeight = Math.max(20, targetHeight);
    
    // Reset all parameters to initial values
    setMosaicWidth(finalWidth);
    setMosaicHeight(finalHeight);
    setKeepAspectRatio(true);
    setNumColors(8);
    setPrevNumColors(8);
    setPalette([]);
    setPaletteModified(false);
    setModifiedColorIndices(new Set());
    originalPaletteSnapshotRef.current = [];  // 🔥 FIX: Use ref
    setColorStats([]);
    setTileColorMap([]);
    setTileSize(20);
    setTileSpacing(2);
    setSpacingColor('#F5F1E8');
    setBorderEnabled(false);
    setBorderColor('#A89F91');
    setBorderWidth(10);
    setEffect3D(false);
    setTileDepth(3);
    setSelectedColorGroup(null);
    setHoveredColorGroup(null);
    setShowColorPicker(null);
    setShowBackgroundColorPicker(false);
    setShowSpacingColorPicker(false);
    setShowBorderColorPicker(false);
    setDownloadFormat('png');
    setIsGenerating(false);
    
    // Clear segment memory (user's color modifications)
    segmentMemoryRef.current.clear();
    
    // Reset history
    resetHistory({ colorMap: [], palette: [] });
    
    // Update refs with new dimensions
    pendingDimensionsRef.current = { width: finalWidth, height: finalHeight };
    prevMosaicDimensionsRef.current = { width: finalWidth, height: finalHeight };
    
    // Trigger regeneration with fresh image (this will happen via useEffect)
    setImageChanged(true);
  }, [image, resetHistory]);

  const handleDownload = () => {
    const canvas = canvasRef.current?.getCanvas();
    if (!canvas) return;
    
    if (downloadFormat === 'svg') {
      const svg = generateSVG();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'mosaic-art.svg';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const link = document.createElement('a');
      link.download = 'mosaic-art.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  const handleCopy = async () => {
    const canvas = canvasRef.current?.getCanvas();
    if (!canvas) return;
    
    try {
      if (downloadFormat === 'svg') {
        // Copy SVG as text using fallback method
        const svg = generateSVG();
        
        // Create a temporary textarea element
        const textarea = document.createElement('textarea');
        textarea.value = svg;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        
        // Select and copy
        textarea.select();
        textarea.setSelectionRange(0, svg.length);
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            toast.success(t('copySuccess'));
          } else {
            toast.error(t('copyError'));
          }
        } catch (err) {
          console.error('Copy command failed:', err);
          toast.error(t('copyError'));
        } finally {
          document.body.removeChild(textarea);
        }
      } else {
        // For PNG, the Clipboard API is restricted in this environment
        // Show a helpful message suggesting to use download instead
        toast.warning(t('pngCopyNotSupported'), {
          duration: 4000,
        });
      }
    } catch (err) {
      console.error('Copy failed:', err);
      toast.error(t('copyError'));
    }
  };

  const generateSVG = (): string => {
    const { offsetX, offsetY } = calculateOffsets(borderEnabled, borderWidth);
    const { width, height } = calculateCanvasSize(
      mosaicWidth,
      mosaicHeight,
      tileSize,
      tileSpacing,
      borderEnabled,
      borderWidth
    );

    const bgColor = spacingColor && spacingColor.startsWith('#') ? spacingColor : rgbToHex(spacingColor || '#FFFFFF');
    const bdColor = borderColor && borderColor.startsWith('#') ? borderColor : rgbToHex(borderColor || '#000000');

    let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <!-- Mosaic Tiles -->
`;

    for (let y = 0; y < mosaicHeight; y++) {
      for (let x = 0; x < mosaicWidth; x++) {
        const colorIndex = tileColorMap[y]?.[x];
        if (colorIndex === undefined) continue;
        
        // 🔥 Skip transparent tiles (-1 index) - don't render them in SVG
        if (colorIndex === -1) continue;

        const tileColor = rgbToHex(palette[colorIndex]);
        const px = offsetX + x * (tileSize + tileSpacing);
        const py = offsetY + y * (tileSize + tileSpacing);

        if (effect3D) {
          svgContent += `  <rect x="${px + tileDepth}" y="${py + tileDepth}" width="${tileSize}" height="${tileSize}" fill="rgba(0,0,0,0.2)"/>\n`;
          svgContent += `  <rect x="${px}" y="${py}" width="${tileSize}" height="${tileSize}" fill="${tileColor}"/>\n`;
          svgContent += `  <rect x="${px}" y="${py}" width="${tileSize / 2}" height="${tileSize / 4}" fill="rgba(255,255,255,0.3)"/>\n`;
        } else {
          svgContent += `  <rect x="${px}" y="${py}" width="${tileSize}" height="${tileSize}" fill="${tileColor}"/>\n`;
        }
      }
    }

    if (borderEnabled) {
      svgContent += `  
  <!-- Border -->
  <rect x="${borderWidth / 2}" y="${borderWidth / 2}" width="${width - borderWidth}" height="${height - borderWidth}" fill="none" stroke="${bdColor}" stroke-width="${borderWidth}"/>
`;
    }

    svgContent += `</svg>`;
    return svgContent;
  };

  const handleOutsideClick = () => {
    if (showColorPicker !== null) {
      setShowColorPicker(null);
      return;
    }
    if (showBackgroundColorPicker) {
      setShowBackgroundColorPicker(false);
      return;
    }
    if (showSpacingColorPicker) {
      setShowSpacingColorPicker(false);
      return;
    }
    if (showBorderColorPicker) {
      setShowBorderColorPicker(false);
      return;
    }
    setSelectedColorGroup(null);
  };

  useEffect(() => {
    return () => {
      if (colorChangeTimerRef.current) {
        clearTimeout(colorChangeTimerRef.current);
      }
      if (sliderChangeTimerRef.current) {
        clearTimeout(sliderChangeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Global click handler to close color pickers and unselect color groups when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is inside any interactive color element
      const isInsideColorPicker = target.closest('.chrome-picker') || 
                                   target.closest('[data-color-swatch]') ||
                                   target.closest('[data-color-picker-trigger]');
      
      // Check if click is inside control panels (sliders, inputs, etc.)
      const isInsideControlPanel = target.closest('[data-control-panel]') ||
                                    target.closest('input[type="range"]') ||
                                    target.closest('input[type="number"]') ||
                                    target.closest('input[type="checkbox"]') ||
                                    target.closest('button');
      
      // Check if click is on the canvas
      const isInsideCanvas = target.closest('canvas');
      
      if (!isInsideColorPicker && !isInsideControlPanel && !isInsideCanvas) {
        // Clicked outside - close all color pickers and unselect color group
        if (showColorPicker !== null) {
          setShowColorPicker(null);
        }
        if (showBackgroundColorPicker) {
          setShowBackgroundColorPicker(false);
        }
        if (showSpacingColorPicker) {
          setShowSpacingColorPicker(false);
        }
        if (showBorderColorPicker) {
          setShowBorderColorPicker(false);
        }
        if (selectedColorGroup !== null) {
          setSelectedColorGroup(null);
        }
      } else if (!isInsideColorPicker && !isInsideCanvas) {
        // Clicked on control panel - only close color pickers, not selection
        if (showColorPicker !== null) {
          setShowColorPicker(null);
        }
        if (showBackgroundColorPicker) {
          setShowBackgroundColorPicker(false);
        }
        if (showSpacingColorPicker) {
          setShowSpacingColorPicker(false);
        }
        if (showBorderColorPicker) {
          setShowBorderColorPicker(false);
        }
      }
    };

    // Add listener if any color picker is open OR if a color group is selected
    if (showColorPicker !== null || 
        showBackgroundColorPicker || 
        showSpacingColorPicker || 
        showBorderColorPicker ||
        selectedColorGroup !== null) {
      // Use capture phase to ensure we catch the event early
      document.addEventListener('click', handleClickOutside, true);
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
      };
    }
  }, [showColorPicker, showBackgroundColorPicker, showSpacingColorPicker, showBorderColorPicker, selectedColorGroup]);

  useEffect(() => {
    if (!image || isGenerating || isRestoringHistoryRef.current) return;

    // 🔥 All operations use setTimeout to avoid blocking
    setIsGenerating(true);

    const timeoutId = setTimeout(() => {
      if (imageChanged) {
        // New image uploaded - use dimensions from ref if available
        setImageChanged(false);
        setPaletteModified(false);
        
        if (pendingDimensionsRef.current) {
          const { width, height } = pendingDimensionsRef.current;
          generateMosaic(width, height);
          pendingDimensionsRef.current = null; // Clear after use
        } else {
          generateMosaic();
        }
      } else if (numColors !== prevNumColors && !isRestoringHistoryRef.current) {
        // Color count changed BY USER (not by Undo/Redo)
        setPrevNumColors(numColors);
        
        setPaletteModified(false);
        setModifiedColorIndices(new Set());
        generateMosaic();
      } else if (palette.length === 0) {
        generateMosaic();
      }
      
      setIsGenerating(false);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      setIsGenerating(false);
    };
  }, [image, numColors, imageChanged]); // ✅ Removed mosaicWidth and mosaicHeight - handled by onSizeChange

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || 
                 ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleCanvasSizeChange = useCallback((newWidth: number, newHeight: number) => {
    // Update dimensions immediately
    setMosaicWidth(newWidth);
    setMosaicHeight(newHeight);
    
    // If no image or palette yet, just update dimensions
    if (!image || palette.length === 0 || tileColorMap.length === 0) {
      prevMosaicDimensionsRef.current = { width: newWidth, height: newHeight };
      return;
    }
    
    // Skip if restoring history
    if (isRestoringHistoryRef.current) {
      return;
    }
    
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    
    // Update ref
    prevMosaicDimensionsRef.current = { width: newWidth, height: newHeight };
    
    // Resample IMMEDIATELY from original image with ORIGINAL palette (before modifications)
    // This ensures correct index mapping
    const tilesX = newWidth;
    const tilesY = newHeight;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tilesX;
    tempCanvas.height = tilesY;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      tempCtx.drawImage(image, 0, 0, tilesX, tilesY);
      const rawImageData = tempCtx.getImageData(0, 0, tilesX, tilesY);

      // Process transparency
      const { imageData, transparentMask } = processImageDataForTransparency(rawImageData);

      // 🎯 CANVAS RESIZE WORKFLOW - Two-phase color restoration system
      // Phase 1: Resample using originalPaletteSnapshot (base colors from initial generation)
      //   - Ensures consistent color mapping regardless of user modifications
      //   - Example: If original had 7 colors, resample with those same 7 colors
      // Phase 2: Apply SegmentMemory modifications (see lines below)
      //   - Re-applies all user color changes on top of resampled base
      //   - Preserves color merges, manual adjustments, etc.
      const resamplePalette = originalPaletteSnapshotRef.current.length > 0 ? originalPaletteSnapshotRef.current : palette;
      
      const newColorMap: number[][] = [];
      for (let y = 0; y < tilesY; y++) {
        newColorMap[y] = [];
        for (let x = 0; x < tilesX; x++) {
          const pixelIndex = y * tilesX + x;
          
          if (transparentMask[pixelIndex] === 1) {
            // Transparent tile
            newColorMap[y][x] = -1;
          } else {
            // Non-transparent tile
            const i = pixelIndex * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];

            const colorIndex = findClosestColor(r, g, b, resamplePalette);
            newColorMap[y][x] = colorIndex;
          }
        }
      }
      
      // 🔥 FIX: Extract ONLY the colors actually used in newColorMap (excluding transparent -1)
      // Build a new palette from the used color indices
      const usedIndices = new Set<number>();
      for (let y = 0; y < tilesY; y++) {
        for (let x = 0; x < tilesX; x++) {
          const index = newColorMap[y][x];
          if (index !== -1) {
            usedIndices.add(index);
          }
        }
      }
      
      // Create a mapping from old indices to new indices
      const oldToNewIndex = new Map<number, number>();
      const newPalette: string[] = [];
      const sortedIndices = Array.from(usedIndices).sort((a, b) => a - b);
      
      sortedIndices.forEach((oldIndex, newIndex) => {
        oldToNewIndex.set(oldIndex, newIndex);
        newPalette.push(resamplePalette[oldIndex]);
      });
      
      // Remap the color indices in newColorMap
      const remappedColorMap = newColorMap.map(row =>
        row.map(oldIndex => {
          // Keep transparent tiles as -1
          if (oldIndex === -1) return -1;
          return oldToNewIndex.get(oldIndex) ?? 0;
        })
      );
      
      // 🎯 Phase 2: Apply SegmentMemory modifications
      // This restores all user color changes on top of the resampled base palette
      // Handles: color adjustments, color merges, manual tweaks
      const hasModifications = segmentMemoryRef.current.size() > 0;
      let finalPalette = newPalette;
      
      if (hasModifications) {
        finalPalette = segmentMemoryRef.current.applyModificationsToPalette(
          remappedColorMap,
          newPalette
        );
      }
      
      // Update state
      setTileColorMap(remappedColorMap);
      setPalette(finalPalette);
      updateColorStats(remappedColorMap, finalPalette);
      
      // 🔥 FIX: Use actual palette length instead of numColors state
      // This ensures history records the correct color count after merges
      // Add to history
      addToHistory({
        colorMap: remappedColorMap,
        palette: [...finalPalette],
        mosaicWidth: newWidth,
        mosaicHeight: newHeight,
        numColors: finalPalette.length,
        tileSize,
        tileSpacing,
        spacingColor,
        borderEnabled,
        borderColor,
        borderWidth,
        effect3D,
        tileDepth,
      });
    }
  }, [image, palette, tileColorMap, mosaicWidth, mosaicHeight,
      numColors, tileSize, tileSpacing, spacingColor, borderEnabled, borderColor, 
      borderWidth, effect3D, tileDepth, addToHistory, updateColorStats]);

  // Add history entry with debouncing for slider changes
  const addHistoryEntryDebounced = useCallback(() => {
    if (isRestoringHistoryRef.current || tileColorMap.length === 0) return;

    if (sliderChangeTimerRef.current) {
      clearTimeout(sliderChangeTimerRef.current);
    }

    sliderChangeTimerRef.current = setTimeout(() => {
      addToHistory({
        colorMap: tileColorMap.map(row => [...row]),
        palette: [...palette],
        mosaicWidth,
        mosaicHeight,
        numColors: palette.length,  // 🔥 Use actual palette length
        tileSize,
        tileSpacing,
        spacingColor,
        borderEnabled,
        borderColor,
        borderWidth,
        effect3D,
        tileDepth,
      });
    }, 500); // 500ms debounce
  }, [tileColorMap, palette, mosaicWidth, mosaicHeight, numColors, tileSize, 
      tileSpacing, spacingColor, borderEnabled, borderColor, borderWidth, 
      effect3D, tileDepth, addToHistory]);

  // Wrapper functions with history support
  const handleTileSizeChange = useCallback((value: number) => {
    setTileSize(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    addHistoryEntryDebounced();
  }, [addHistoryEntryDebounced]);

  const handleTileSpacingChange = useCallback((value: number) => {
    setTileSpacing(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    addHistoryEntryDebounced();
  }, [addHistoryEntryDebounced]);

  const handleSpacingColorChange = useCallback((value: string) => {
    setSpacingColor(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    addHistoryEntryDebounced();
  }, [addHistoryEntryDebounced]);

  const handleBorderEnabledChange = useCallback((value: boolean) => {
    if (isRestoringHistoryRef.current) return;
    setBorderEnabled(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    // For toggles, add to history immediately (no debounce)
    if (tileColorMap.length > 0) {
      addToHistory({
        colorMap: tileColorMap.map(row => [...row]),
        palette: [...palette],
        mosaicWidth,
        mosaicHeight,
        numColors: palette.length,  // 🔥 Use actual palette length
        tileSize,
        tileSpacing,
        spacingColor,
        borderEnabled: value,
        borderColor,
        borderWidth,
        effect3D,
        tileDepth,
      });
    }
  }, [tileColorMap, palette, mosaicWidth, mosaicHeight, numColors, tileSize, 
      tileSpacing, spacingColor, borderColor, borderWidth, effect3D, tileDepth, addToHistory]);

  const handleBorderWidthChange = useCallback((value: number) => {
    setBorderWidth(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    addHistoryEntryDebounced();
  }, [addHistoryEntryDebounced]);

  const handleBorderColorChange = useCallback((value: string) => {
    setBorderColor(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    addHistoryEntryDebounced();
  }, [addHistoryEntryDebounced]);

  const handleEffect3DChange = useCallback((value: boolean) => {
    if (isRestoringHistoryRef.current) return;
    setEffect3D(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    // For toggles, add to history immediately (no debounce)
    if (tileColorMap.length > 0) {
      addToHistory({
        colorMap: tileColorMap.map(row => [...row]),
        palette: [...palette],
        mosaicWidth,
        mosaicHeight,
        numColors: palette.length,  // 🔥 Use actual palette length
        tileSize,
        tileSpacing,
        spacingColor,
        borderEnabled,
        borderColor,
        borderWidth,
        effect3D: value,
        tileDepth,
      });
    }
  }, [tileColorMap, palette, mosaicWidth, mosaicHeight, numColors, tileSize, 
      tileSpacing, spacingColor, borderEnabled, borderColor, borderWidth, tileDepth, addToHistory]);

  const handleTileDepthChange = useCallback((value: number) => {
    setTileDepth(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
    addHistoryEntryDebounced();
  }, [addHistoryEntryDebounced]);

  const handleNumColorsChange = useCallback((value: number) => {
    setNumColors(value);
    // User is adjusting other parameters - unselect color group
    setSelectedColorGroup(null);
    setShowColorPicker(null);
  }, []);

  return (
    <ToolPageLayout
      title="mosaicGenerator"
      description="mosaicGeneratorDesc"
      onBack={onBack}
    >
      <div className="container mx-auto max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Left Sidebar - Controls */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            {/* Upload Card */}
            <Card>
              <CardHeader>
                <CardTitle>{t('uploadImage')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t('chooseImage')}
                </Button>
              </CardContent>
            </Card>

            {/* Canvas Size Panel */}
            <CanvasSizePanel
              mosaicWidth={mosaicWidth}
              mosaicHeight={mosaicHeight}
              keepAspectRatio={keepAspectRatio}
              tileSize={tileSize}
              tileSpacing={tileSpacing}
              onWidthChange={(value) => {
                const newWidth = value;
                let newHeight = mosaicHeight;
                
                if (keepAspectRatio && image) {
                  const aspectRatio = image.width / image.height;
                  newHeight = Math.round(newWidth / aspectRatio);
                  setMosaicHeight(newHeight);
                }
                
                setMosaicWidth(newWidth);
                handleCanvasSizeChange(newWidth, newHeight);
              }}
              onHeightChange={(value) => {
                const newHeight = value;
                let newWidth = mosaicWidth;
                
                if (keepAspectRatio && image) {
                  const aspectRatio = image.width / image.height;
                  newWidth = Math.round(newHeight * aspectRatio);
                  setMosaicWidth(newWidth);
                }
                
                setMosaicHeight(newHeight);
                handleCanvasSizeChange(newWidth, newHeight);
              }}
              onKeepAspectRatioChange={setKeepAspectRatio}
            />

            {/* Color Settings Panel */}
            <ColorSettingsPanel
              numColors={numColors}
              onNumColorsChange={handleNumColorsChange}
            />

            {/* Color Palette Panel */}
            {palette.length > 0 && (
              <ColorPalettePanel
                palette={palette}
                colorStats={colorStats}
                selectedColorGroup={selectedColorGroup}
                hoveredColorGroup={hoveredColorGroup}
                showColorPicker={showColorPicker}
                hasTransparent={hasTransparent}
                transparentCount={transparentCount}
                onColorSelect={(index) => {
                  // Allow selecting transparent swatch (-1) to paint transparency
                  const newIndex = selectedColorGroup === index ? null : index;
                  setSelectedColorGroup(newIndex);
                  
                  // Don't show color picker for transparent swatch
                  if (index === -1) {
                    setShowColorPicker(null);
                  } else if (showColorPicker !== null) {
                    setShowColorPicker(newIndex);
                  }
                }}
                onColorHover={setHoveredColorGroup}
                onColorChange={handleColorChange}
                onColorPickerToggle={setShowColorPicker}
              />
            )}

            {/* Tile Settings Panel */}
            <TileSettingsPanel
              tileSize={tileSize}
              tileSpacing={tileSpacing}
              spacingColor={spacingColor}
              showSpacingColorPicker={showSpacingColorPicker}
              onTileSizeChange={handleTileSizeChange}
              onTileSpacingChange={handleTileSpacingChange}
              onSpacingColorChange={handleSpacingColorChange}
              onSpacingColorPickerToggle={setShowSpacingColorPicker}
            />

            {/* Border & Effects Panel */}
            {tileColorMap.length > 0 && (
              <BorderEffectsPanel
                borderEnabled={borderEnabled}
                borderColor={borderColor}
                borderWidth={borderWidth}
                showBorderColorPicker={showBorderColorPicker}
                effect3D={effect3D}
                tileDepth={tileDepth}
                onBorderEnabledChange={handleBorderEnabledChange}
                onBorderColorChange={handleBorderColorChange}
                onBorderWidthChange={handleBorderWidthChange}
                onBorderColorPickerToggle={setShowBorderColorPicker}
                onEffect3DChange={handleEffect3DChange}
                onTileDepthChange={handleTileDepthChange}
              />
            )}

            {/* Output Card */}
            {tileColorMap.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('output')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Format Selection with Radio Group */}
                  <div className="space-y-2">
                    <Label className="text-sm">{t('format')}</Label>
                    <RadioGroup
                      value={downloadFormat}
                      onValueChange={(value) => setDownloadFormat(value as 'png' | 'svg')}
                      className="flex gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="png" id="format-png" />
                        <Label htmlFor="format-png" className="cursor-pointer font-normal">
                          PNG
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="svg" id="format-svg" />
                        <Label htmlFor="format-svg" className="cursor-pointer font-normal">
                          SVG
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      onClick={handleDownload}
                      variant="outline"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t('download')}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCopy}
                      variant="outline"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('copy')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>

          {/* Right Side - Canvas Preview (Sticky) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="sticky self-start"
            style={{ 
              top: `${stickyTop}px`, 
              height: `${viewportHeight}px` 
            }}
          >
            <MosaicCanvas
              ref={canvasRef}
              colorMap={tileColorMap}
              palette={palette}
              mosaicWidth={mosaicWidth}
              mosaicHeight={mosaicHeight}
              tileSize={tileSize}
              tileSpacing={tileSpacing}
              spacingColor={spacingColor}
              borderEnabled={borderEnabled}
              borderColor={borderColor}
              borderWidth={borderWidth}
              effect3D={effect3D}
              tileDepth={tileDepth}
              selectedColorGroup={selectedColorGroup}
              hoveredColorGroup={hoveredColorGroup}
              onClick={handleCanvasTileClick}
              onUploadClick={() => fileInputRef.current?.click()}
              onClearSelection={() => setSelectedColorGroup(null)}
              hasImage={image !== null}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onReset={handleReset}
              canUndo={canUndo}
              canRedo={canRedo}
            />
          </motion.div>
        </div>
      </div>
    </ToolPageLayout>
  );
};

MosaicGenerator.displayName = 'MosaicGenerator';