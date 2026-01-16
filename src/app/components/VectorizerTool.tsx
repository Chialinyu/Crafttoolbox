import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useViewportHeight } from '../../hooks/useViewportHeight';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Upload, Check, ChevronRight, Construction, Download, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { ToolPageLayout } from './ui/ToolPageLayout';
import { ImageUploader } from './vectorizer/ImageUploader';
import { ModeSelector } from './vectorizer/ModeSelector';
import { PreprocessPanel } from './vectorizer/PreprocessPanel';
import { SVGCanvas, type SVGCanvasRef } from './vectorizer/SVGCanvas';
import { PathLayerPanel } from './vectorizer/PathLayerPanel';
import { preprocessImage, calculateOptimalThreshold, type PreprocessResult } from './vectorizer/utils/cvProcessing';
import { vectorizeImage, generateSVG } from './vectorizer/utils/vectorization';
import { DEFAULT_VALUES, LIMITS } from './vectorizer/constants';
import { usePreviewManager } from './vectorizer/hooks/usePreviewManager';
import { mergeColorGroups } from './vectorizer/utils/colorMerging';
import { trackToolUsage, trackImageUpload, trackExport } from '@/utils/analytics';
import type { VectorPath, VectorizationConfig } from './vectorizer/utils/vectorization';

type VectorizationMode = 'line' | 'fill' | 'mixed';
type Step = 1 | 2 | 3 | 4 | 5;

/**
 * VectorizerTool - Image Vectorization Tool
 * 
 * 5-step workflow:
 * 1. Upload Image
 * 2. Select Mode (line/fill/mixed)
 * 3. Adjust Parameters (with real-time preview)
 * 4. Generate & View Vectors (with layer management)
 * 5. Export SVG
 */
interface VectorizerToolProps {
  onBack: () => void;
}

export const VectorizerTool: React.FC<VectorizerToolProps> = ({ onBack }) => {
  const { t } = useLanguage();
  const { viewportHeight, stickyTop } = useViewportHeight();
  
  // Preview manager hook - handles Step 3 and Step 4 preview mutual exclusion
  const previewManager = usePreviewManager();

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current workflow step
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [editingStep, setEditingStep] = useState<Step | null>(null);

  // Step 1: Image
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);

  // Step 2: Mode
  const [mode, setMode] = useState<VectorizationMode>('line');
  const [tempMode, setTempMode] = useState<VectorizationMode>('line'); // For edit mode
  const [isGeneratingModePreview, setIsGeneratingModePreview] = useState(false); // Loading state for mode preview
  
  // ✨ NEW: Mode preview cache - store results for each mode to avoid recalculation
  const modePreviewCacheRef = useRef<Map<VectorizationMode, ImageData>>(new Map());
  const isPrecomputingModesRef = useRef(false); // Prevent duplicate precomputation
  const precomputeTimerRef = useRef<NodeJS.Timeout | null>(null); // Track precompute timer for cancellation
  const precomputeSessionIdRef = useRef<number>(0); // 🐛 FIX: Track precomputation session to cancel stale computations
  const svgCanvasRef = useRef<SVGCanvasRef | null>(null); // Direct canvas update ref
  const latestTempModeRef = useRef<VectorizationMode>('line'); // 🐛 FIX: Track latest selected mode during precomputation
  
  // 🎯 NEW: Also cache cluster labels for each mode
  const modeLabelsCache = useRef<Map<VectorizationMode, {
    labels: Uint8Array | null;
    clusterCount: number | null;
  }>>(new Map());
  
  // Step 3: Parameters (mode-specific)
  const [blurRadius, setBlurRadius] = useState(DEFAULT_VALUES.BLUR_RADIUS);
  const [threshold, setThreshold] = useState(DEFAULT_VALUES.THRESHOLD);
  const [useAutoThreshold, setUseAutoThreshold] = useState(true);
  const [autoThresholdValue, setAutoThresholdValue] = useState<number | undefined>(undefined);
  const [minArea, setMinArea] = useState(DEFAULT_VALUES.MIN_AREA);
  const [colorCount, setColorCount] = useState(DEFAULT_VALUES.COLOR_COUNT); // For fill/mixed mode
  
  // Temp values for editing
  const [tempBlurRadius, setTempBlurRadius] = useState(DEFAULT_VALUES.BLUR_RADIUS);
  const [tempThreshold, setTempThreshold] = useState(DEFAULT_VALUES.THRESHOLD);
  const [tempUseAutoThreshold, setTempUseAutoThreshold] = useState(true);
  const [tempMinArea, setTempMinArea] = useState(DEFAULT_VALUES.MIN_AREA);
  const [tempColorCount, setTempColorCount] = useState(DEFAULT_VALUES.COLOR_COUNT);

  const [processedImageData, setProcessedImageData] = useState<ImageData | null>(null);
  const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);
  
  // 🎯 NEW: Store cluster labels from preprocessing for layer-based vectorization
  const [clusterLabels, setClusterLabels] = useState<Uint8Array | null>(null);
  const [clusterCount, setClusterCount] = useState<number | null>(null);
  const [clusterToMorandiMap, setClusterToMorandiMap] = useState<number[] | null>(null); // 🎯 Mapping from cluster ID to Morandi palette index
  
  // ✨ Remember last computed parameters - only recompute if parameters actually changed
  const lastComputedParamsRef = useRef<string | null>(null);
  
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const vectorizationTimerRef = useRef<NodeJS.Timeout | null>(null); // Track vectorization timeout for cancellation
  const isCancelledRef = useRef<boolean>(false); // Track if vectorization should be cancelled
  const wasCancelledFromStep4Ref = useRef<boolean>(false); // Track if we cancelled from step 4

  // Step 3 parameters
  const [precision, setPrecision] = useState(70);
  const [simplifyPath, setSimplifyPath] = useState(true);
  // ❌ REMOVED: useBezierCurves state - now always uses Potrace fallback strategy
  
  // Step 4: Vectorization
  const [pathPrecision, setPathPrecision] = useState(DEFAULT_VALUES.PATH_PRECISION);
  const [vectorPaths, setVectorPaths] = useState<VectorPath[]>([]);
  const [isVectorizing, setIsVectorizing] = useState(false);
  
  // NEW: Step 3 preview generation loading state
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  
  // Path layer management
  const [selectedPathIndices, setSelectedPathIndices] = useState<number[]>([]);
  const [hoveredPathIndex, setHoveredPathIndex] = useState<number | null>(null);
  const [hiddenPathIndices, setHiddenPathIndices] = useState<number[]>([]);

  // Display settings
  const [showOriginalImage, setShowOriginalImage] = useState(true);
  const [imageOpacity, setImageOpacity] = useState(0.3);
  
  // Color selection state for merge colors feature
  const [selectedColorIndices, setSelectedColorIndices] = useState<number[]>([]);

  // ======================================================================
  // Step 1: Upload Image
  // ======================================================================
  const handleImageUpload = useCallback((imageData: ImageData, img: HTMLImageElement) => {
    // ✅ CRITICAL: Cancel any ongoing precomputation
    if (precomputeTimerRef.current) {
      clearTimeout(precomputeTimerRef.current);
      precomputeTimerRef.current = null;
    }
    
    // ✅ Reset precomputing flag
    isPrecomputingModesRef.current = false;
    
    // 🐛 FIX: Increment session ID to invalidate any ongoing precomputation
    precomputeSessionIdRef.current++;
    
    // ✅ Clear ALL previous states when uploading new image
    setOriginalImage(img);
    setOriginalImageData(imageData);
    
    // Clear all processing data
    setProcessedImageData(null);
    setPreviewImageData(null);
    setVectorPaths([]);
    
    // ✨ Clear mode preview cache - CRITICAL for memory management
    modePreviewCacheRef.current.clear();
    
    // 🐛 FIX: Also clear cluster labels cache for memory management
    modeLabelsCache.current.clear();
    
    // Clear all preview manager states
    previewManager.clearAllPreviews();
    
    // Reset all selections and visibility
    setSelectedPathIndices([]);
    setHoveredPathIndex(null);
    setHiddenPathIndices([]);
    setSelectedColorIndices([]);
    
    // Reset editing state
    setEditingStep(null);
    
    // Reset all parameters to defaults
    setMode('line');
    setTempMode('line');
    setBlurRadius(DEFAULT_VALUES.BLUR_RADIUS);
    setThreshold(DEFAULT_VALUES.THRESHOLD);
    setUseAutoThreshold(true);
    setMinArea(DEFAULT_VALUES.MIN_AREA);
    setColorCount(DEFAULT_VALUES.COLOR_COUNT);
    setTempBlurRadius(DEFAULT_VALUES.BLUR_RADIUS);
    setTempThreshold(DEFAULT_VALUES.THRESHOLD);
    setTempUseAutoThreshold(true);
    setTempMinArea(DEFAULT_VALUES.MIN_AREA);
    setTempColorCount(DEFAULT_VALUES.COLOR_COUNT);
    setPathPrecision(DEFAULT_VALUES.PATH_PRECISION);
    setSimplifyPath(true);
    
    // ⚡ Show loading IMMEDIATELY before calculating
    setIsGeneratingModePreview(true);
    setIsVectorizing(false);
    
    // Calculate auto threshold for new image (synchronous, fast)
    const autoThresh = calculateOptimalThreshold(imageData);
    setAutoThresholdValue(autoThresh);
    setTempThreshold(autoThresh);
    
    // Move to step 2 (this will trigger the precomputation useEffect)
    setCurrentStep(2);
  }, [previewManager]);

  // ======================================================================
  // Step 2: Select Mode
  // ======================================================================
  
  // ✨ NEW: Precompute ALL mode previews when entering Step 2
  useEffect(() => {
    if ((currentStep === 2 || editingStep === 2) && originalImageData && autoThresholdValue !== undefined && !isPrecomputingModesRef.current) {
      // ✅ FIXED: Check !== undefined instead of truthy to handle autoThresholdValue=0
      // Check if we already have all modes cached
      const allModesCached = ['line', 'fill', 'mixed'].every(m => 
        modePreviewCacheRef.current.has(m as VectorizationMode)
      );
      
      if (allModesCached) {
        // All modes already computed, just show the current one
        const cachedPreview = modePreviewCacheRef.current.get(tempMode);
        if (cachedPreview) {
          setPreviewImageData(cachedPreview);
          setIsGeneratingModePreview(false);
        }
        return;
      }
      
      // Not all modes cached - precompute all of them ASYNCHRONOUSLY
      isPrecomputingModesRef.current = true;
      setIsGeneratingModePreview(true);
      
      // 🐛 FIX: Capture current session ID to detect cancellation
      const currentSessionId = precomputeSessionIdRef.current;
      
      // ⚡ Asynchronous batch processing - compute one mode at a time to avoid blocking
      const modes: VectorizationMode[] = ['line', 'fill', 'mixed'];
      let currentModeIndex = 0;
      
      const computeNextMode = () => {
        // 🐛 FIX: Check if this computation has been cancelled
        if (currentSessionId !== precomputeSessionIdRef.current) {
          // Session changed - this precomputation is stale, abort
          return;
        }
        
        if (currentModeIndex >= modes.length) {
          // All done! Show the CURRENTLY SELECTED mode (not the last computed one)
          // 🐛 FIX: Use latestTempModeRef to get the mode user selected during precomputation
          const selectedMode = latestTempModeRef.current;
          const currentPreview = modePreviewCacheRef.current.get(selectedMode);
          if (currentPreview) {
            setPreviewImageData(currentPreview);
          }
          setIsGeneratingModePreview(false);
          isPrecomputingModesRef.current = false;
          return;
        }
        
        const m = modes[currentModeIndex];
        
        // Skip if already cached
        if (modePreviewCacheRef.current.has(m)) {
          currentModeIndex++;
          // Schedule next mode with timeout to avoid stack overflow
          precomputeTimerRef.current = setTimeout(computeNextMode, 0);
          return;
        }
        
        // Compute this mode
        const config = {
          blurRadius: DEFAULT_VALUES.BLUR_RADIUS,
          threshold: autoThresholdValue,
          useAutoThreshold: true,
          mode: m,
          colorCount: m !== 'line' ? DEFAULT_VALUES.COLOR_COUNT : undefined,
        };
        
        // ⚡ Use 80ms delay to give browser enough time to process scroll/render events
        precomputeTimerRef.current = setTimeout(() => {
          // 🐛 FIX: Double-check session hasn't changed during delay
          if (currentSessionId !== precomputeSessionIdRef.current) {
            return; // Abort stale computation
          }
          
          try {
            const result = preprocessImage(originalImageData, config);
            
            // 🐛 FIX: Check again after computation (in case image changed during processing)
            if (currentSessionId !== precomputeSessionIdRef.current) {
              return; // Discard stale results
            }
            
            modePreviewCacheRef.current.set(m, result.imageData);
            
            // 🎯 NEW: Cache cluster labels and count
            modeLabelsCache.current.set(m, {
              labels: result.labels || null,
              clusterCount: result.clusterCount || null
            });
            
            // 🐛 FIX: If this is the currently selected mode, show it immediately
            // Use ref to get the latest selected mode
            if (m === latestTempModeRef.current) {
              setPreviewImageData(result.imageData);
            }
            
            // Move to next mode
            currentModeIndex++;
            // ⚡ CRITICAL: Use setTimeout to avoid stack overflow
            precomputeTimerRef.current = setTimeout(computeNextMode, 0);
          } catch (error) {
            console.error(`Mode precomputation error for ${m}:`, error);
            currentModeIndex++;
            // ⚡ CRITICAL: Use setTimeout to avoid stack overflow
            precomputeTimerRef.current = setTimeout(computeNextMode, 0);
          }
        }, 80); // ⚡ Longer delay for smooth scrolling
      };
      
      // Start the batch processing
      computeNextMode();
      
      // Cleanup
      return () => {
        if (precomputeTimerRef.current) {
          clearTimeout(precomputeTimerRef.current);
          precomputeTimerRef.current = null;
        }
        // 🐛 FIX: Reset precomputing flag when cleanup
        // This ensures that if user leaves Step 2 during precomputation,
        // the flag is reset so precomputation can restart when returning
        isPrecomputingModesRef.current = false;
      };
    }
  }, [currentStep, editingStep, originalImageData, autoThresholdValue]);
  
  // ✨ Separate effect: Handle tempMode changes during/after precomputation
  // 🐛 FIX: tempMode changes should NOT trigger new precomputation
  useEffect(() => {
    if (!originalImageData || (currentStep !== 2 && editingStep !== 2)) return;
    
    // 🎯 If precomputation is in progress, do nothing
    // The selected mode will be shown when precomputation completes
    if (isPrecomputingModesRef.current) {
      return;
    }
    
    // 🎯 If precomputation is complete, instantly show cached preview
    const cachedPreview = modePreviewCacheRef.current.get(tempMode);
    if (cachedPreview) {
      // ⚡ Try direct canvas update first (instant)
      if (svgCanvasRef.current?.updatePreviewDirectly) {
        svgCanvasRef.current.updatePreviewDirectly(cachedPreview);
      }
      // Also update state for consistency
      setPreviewImageData(cachedPreview);
      setIsGeneratingModePreview(false);
    }
  }, [tempMode, currentStep, editingStep, originalImageData]);
  
  // 🐛 FIX: Sync tempMode changes to ref for precomputation to access latest value
  useEffect(() => {
    latestTempModeRef.current = tempMode;
  }, [tempMode]);
  
  const handleConfirmMode = useCallback(() => {
    // ⚡ Remember current parameters to skip recalculation in Step 3
    const effectiveThreshold = tempUseAutoThreshold 
      ? (autoThresholdValue ?? tempThreshold) 
      : tempThreshold;
    
    const currentParams = JSON.stringify({
      blurRadius: tempBlurRadius,
      threshold: effectiveThreshold,
      useAutoThreshold: tempUseAutoThreshold,
      mode: tempMode, // ⚡ Use tempMode since we're about to confirm it
      colorCount: tempMode !== 'line' ? tempColorCount : undefined,
    });
    
    // ✨ Remember these parameters so Step 3 useEffect knows they're already computed
    lastComputedParamsRef.current = currentParams;
    
    // 🎯 NEW: Restore cluster labels from cache when entering Step 3
    const cachedLabels = modeLabelsCache.current.get(tempMode);
    if (cachedLabels) {
      setClusterLabels(cachedLabels.labels);
      setClusterCount(cachedLabels.clusterCount);
    } else {
      setClusterLabels(null);
      setClusterCount(null);
    }
    
    // Just move to Step 3 - the preview is already correct from Step 2!
    setMode(tempMode);
    setColorCount(tempColorCount);
    setCurrentStep(3);
  }, [tempMode, tempColorCount, tempBlurRadius, tempThreshold, tempUseAutoThreshold, autoThresholdValue]);

  // ======================================================================
  // Step 3: Adjust Parameters (Real-time preview)
  // ======================================================================
  
  // Handle color merging - merge smaller groups into the largest selected group
  const handleMergeColors = useCallback((indices: number[]) => {
    if (!previewImageData || indices.length < 2) return;
    
    // ✅ Show loading during merge operation
    setIsGeneratingPreview(true);
    
    // Use setTimeout to avoid blocking UI
    setTimeout(() => {
      try {
        // ✅ Use extracted utility function
        const result = mergeColorGroups(previewImageData, indices);
        
        // ⚡ Update preview with merged result
        setPreviewImageData(result.mergedImageData);
        
        // ⚡ Update color count to reflect the merge (but don't trigger recalculation)
        const newColorCount = result.newColorCount;
        setTempColorCount(newColorCount);
        
        // 🎯 CRITICAL FIX: Update cluster labels, count, and mapping after merge!
        setClusterLabels(result.newLabels);
        setClusterCount(newColorCount);
        setClusterToMorandiMap(result.clusterToMorandiMap); // 🎯 Save the mapping
        
        // ⚡ CRITICAL: Update lastComputedParamsRef to prevent useEffect from recalculating
        const effectiveThreshold = tempUseAutoThreshold 
          ? (autoThresholdValue ?? tempThreshold) 
          : tempThreshold;
        
        const newParams = JSON.stringify({
          blurRadius: tempBlurRadius,
          threshold: effectiveThreshold,
          useAutoThreshold: tempUseAutoThreshold,
          mode,
          colorCount: mode !== 'line' ? newColorCount : undefined,
        });
        
        lastComputedParamsRef.current = newParams;
        
        setSelectedColorIndices([]); // Clear selection after merge
        
        // 🎯 FIX: Don't clear preview manager - we're still in Step 3 preview mode!
        // Just clear the selection state, preview should remain active
        previewManager.activateStep3Preview({ selectedColors: [] });
      } catch (error) {
        console.error('Color merge error:', error);
      } finally {
        setIsGeneratingPreview(false);
      }
    }, 0);
  }, [previewImageData, previewManager, tempBlurRadius, tempThreshold, tempUseAutoThreshold, autoThresholdValue, mode]);
  
  // Handle auto threshold toggle - sync manual threshold when turning off auto
  const handleAutoThresholdToggle = useCallback((value: boolean) => {
    if (!value && autoThresholdValue !== undefined) {
      // When turning OFF auto, sync the manual threshold
      setTempThreshold(autoThresholdValue);
    }
    setTempUseAutoThreshold(value);
    // The useEffect will handle preview update
  }, [autoThresholdValue]);
  
  // Auto-update preview when parameters actually change in step 3
  useEffect(() => {
    if (!originalImageData || (currentStep !== 3 && editingStep !== 3)) {
      return;
    }
    
    // Always use autoThresholdValue when auto is ON, otherwise use tempThreshold
    const effectiveThreshold = tempUseAutoThreshold 
      ? (autoThresholdValue ?? tempThreshold) 
      : tempThreshold;
    
    // ✨ Create parameter signature to detect real changes
    const currentParams = JSON.stringify({
      blurRadius: tempBlurRadius,
      threshold: effectiveThreshold,
      useAutoThreshold: tempUseAutoThreshold,
      mode,
      colorCount: mode !== 'line' ? tempColorCount : undefined,
    });
    
    // ⚡ Skip if parameters haven't changed (e.g., just entering Step 3 from Step 2, or after merging colors)
    if (lastComputedParamsRef.current === currentParams) {
      setIsGeneratingPreview(false);
      return;
    }
    
    // Parameters changed - need to recompute
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
    }
    
    setIsGeneratingPreview(true);
    
    previewTimerRef.current = setTimeout(() => {
      const config = {
        blurRadius: tempBlurRadius,
        threshold: effectiveThreshold,
        useAutoThreshold: tempUseAutoThreshold,
        mode,
        colorCount: mode !== 'line' ? tempColorCount : undefined,
      };
      
      // ⚡ Use setTimeout(0) to yield to browser and allow scroll
      setTimeout(() => {
        try {
          const result = preprocessImage(originalImageData, config);
          setPreviewImageData(result.imageData);
          
          // 🎯 Save cluster labels if in fill/mixed mode
          if (result.labels && result.clusterCount) {
            setClusterLabels(result.labels);
            setClusterCount(result.clusterCount);
          } else {
            setClusterLabels(null);
            setClusterCount(null);
          }
          
          // ✨ Remember these parameters
          lastComputedParamsRef.current = currentParams;
        } finally {
          setIsGeneratingPreview(false);
        }
      }, 0);
    }, 50);
    
    return () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
      }
    };
  }, [tempBlurRadius, tempThreshold, tempUseAutoThreshold, tempColorCount, originalImageData, currentStep, editingStep, autoThresholdValue, mode]);

  const handleConfirmParams = useCallback(() => {
    // Apply temp values
    setBlurRadius(tempBlurRadius);
    setThreshold(tempThreshold);
    setUseAutoThreshold(tempUseAutoThreshold);
    setMinArea(tempMinArea);
    setColorCount(tempColorCount);
    
    if (!originalImageData) return;

    try {
      // ⚡ Determine if we should recompute or reuse preview
      let processed: ImageData;
      let processedLabels: Uint8Array | null = null;
      let processedClusterCount: number | null = null;
      let processedClusterToMorandiMap: number[] | null = null; // 🎯 Track mapping
      
      // ✅ If user cancelled from step 4, we MUST recompute (preview is just a restore, not a fresh calculation)
      if (wasCancelledFromStep4Ref.current) {
        // Force recalculation after cancel
        const effectiveThreshold = tempUseAutoThreshold ? (autoThresholdValue || tempThreshold) : tempThreshold;
        const config = {
          blurRadius: tempBlurRadius,
          threshold: effectiveThreshold,
          useAutoThreshold: tempUseAutoThreshold,
          mode,
          colorCount: mode !== 'line' ? tempColorCount : undefined,
        };
        const result = preprocessImage(originalImageData, config);
        processed = result.imageData;
        processedLabels = result.labels || null;
        processedClusterCount = result.clusterCount || null;
        processedClusterToMorandiMap = null; // Preprocessing doesn't have mapping (labels are sequential)
        wasCancelledFromStep4Ref.current = false; // Reset flag
      } else if (previewImageData && clusterLabels && clusterToMorandiMap) {
        // User has a preview (after merging colors or editing params) - use it directly WITH labels AND mapping
        processed = previewImageData;
        processedLabels = clusterLabels;
        processedClusterCount = clusterCount;
        processedClusterToMorandiMap = clusterToMorandiMap; // 🎯 Use mapping from merge
      } else if (previewImageData && clusterLabels) {
        // User has a preview with labels but no mapping (from preprocessing)
        processed = previewImageData;
        processedLabels = clusterLabels;
        processedClusterCount = clusterCount;
        processedClusterToMorandiMap = null; // No mapping needed, labels are sequential
      } else if (previewImageData) {
        // User has a preview but no labels (shouldn't happen, but handle it)
        processed = previewImageData;
      } else {
        // No preview - calculate from scratch
        const effectiveThreshold = tempUseAutoThreshold ? (autoThresholdValue || tempThreshold) : tempThreshold;
        const config = {
          blurRadius: tempBlurRadius,
          threshold: effectiveThreshold,
          useAutoThreshold: tempUseAutoThreshold,
          mode,
          colorCount: mode !== 'line' ? tempColorCount : undefined,
        };
        const result = preprocessImage(originalImageData, config);
        processed = result.imageData;
        processedLabels = result.labels || null;
        processedClusterCount = result.clusterCount || null;
        processedClusterToMorandiMap = null; // Preprocessing doesn't have mapping
      }
      
      setProcessedImageData(processed);
      
      // 🎯 CRITICAL FIX: Save cluster labels to state so they can be used in handleGenerateVectors!
      setClusterLabels(processedLabels);
      setClusterCount(processedClusterCount);
      setClusterToMorandiMap(processedClusterToMorandiMap);
      
      // ✅ Jump to Step 4 FIRST before clearing preview
      setCurrentStep(4);
      setEditingStep(null);
      
      // ✅ Now safe to clear preview (Step 4 UI is already showing)
      setPreviewImageData(null);
      
      // ✅ Reset cancellation flag before starting
      isCancelledRef.current = false;
      
      // Auto-generate vectors after preprocessing
      setIsVectorizing(true);
      vectorizationTimerRef.current = setTimeout(async () => {
        try {
          const vectorConfig = {
            mode: mode === 'line' ? 'stroke' : mode === 'fill' ? 'fill' : 'mixed',
            precision: pathPrecision,
            minArea: tempMinArea,
            simplify: simplifyPath,
            // ❌ REMOVED: useBezierCurves, now always uses Potrace fallback strategy
            isCancelledRef, // ✅ Pass cancellation ref
            labels: processedLabels || undefined, // 🎯 Pass cluster labels
            clusterCount: processedClusterCount || undefined, // 🎯 Pass cluster count
            clusterToMorandiMap: processedClusterToMorandiMap || undefined, // 🎯 Pass cluster to Morandi map
          } as VectorizationConfig;
          
          const paths = await vectorizeImage(processed, vectorConfig);
          
          // ✅ Only update if not cancelled
          if (!isCancelledRef.current) {
            setVectorPaths(paths);
            setIsVectorizing(false);
          }
          vectorizationTimerRef.current = null;
        } catch (error) {
          console.error('Vectorization error:', error);
          if (!isCancelledRef.current) {
            setIsVectorizing(false);
            setVectorPaths([]);
          }
          vectorizationTimerRef.current = null;
        }
      }, 100);
    } catch (error) {
      console.error('Preprocessing error:', error);
      setEditingStep(null);
    }
  }, [originalImageData, previewImageData, clusterLabels, clusterCount, clusterToMorandiMap, tempBlurRadius, tempThreshold, tempUseAutoThreshold, tempMinArea, tempColorCount, autoThresholdValue, mode, pathPrecision, simplifyPath]); // 🔧 FIX: Add useBezierCurves to deps

  // ======================================================================
  // Step 4: Generate Vectors
  // ======================================================================
  
  // Cancel vectorization and return to Step 3
  const handleCancelVectorization = useCallback(() => {
    // ✅ Set cancellation flag FIRST - this will stop ongoing vectorization
    isCancelledRef.current = true;
    wasCancelledFromStep4Ref.current = true;
    
    // Clear the timeout
    if (vectorizationTimerRef.current) {
      clearTimeout(vectorizationTimerRef.current);
      vectorizationTimerRef.current = null;
    }
    
    // Stop loading
    setIsVectorizing(false);
    
    // Restore previewImageData from processedImageData
    if (processedImageData) {
      setPreviewImageData(processedImageData);
    }
    
    // Return to Step 3
    setCurrentStep(3);
  }, [processedImageData]);
  
  const handleGenerateVectors = useCallback(async () => {
    // 🎯 CRITICAL FIX: Use previewImageData (after merge) instead of processedImageData
    if (!previewImageData) return;

    setIsVectorizing(true);

    setTimeout(async () => {
      const config = {
        mode: mode === 'line' ? 'stroke' : mode === 'fill' ? 'fill' : 'mixed',
        precision: pathPrecision,
        minArea,
        simplify: simplifyPath,
        // ❌ REMOVED: useBezierCurves, now always uses Potrace fallback strategy
        labels: clusterLabels || undefined, // 🎯 Pass cluster labels FROM STATE
        clusterCount: clusterCount || undefined, // 🎯 Pass cluster count FROM STATE
        clusterToMorandiMap: clusterToMorandiMap || undefined, // 🎯 Pass cluster to Morandi map FROM STATE
      };

      // 🎯 Use previewImageData which reflects any merge operations from Step 3
      const paths = await vectorizeImage(previewImageData, config); // 🆕 await async function
      setVectorPaths(paths);
      setIsVectorizing(false);
      setCurrentStep(5);
    }, 100);
  }, [previewImageData, mode, pathPrecision, minArea, simplifyPath, clusterLabels, clusterCount, clusterToMorandiMap]);

  // ======================================================================
  // Edit Mode Handlers
  // ======================================================================
  const handleEditStep = useCallback((step: Step) => {
    setEditingStep(step);
    
    // ✅ Clear all preview states when entering edit mode
    previewManager.clearAllPreviews();
    
    // Copy current values to temp for editing
    if (step === 2) {
      setTempMode(mode);
      setTempColorCount(colorCount); // Also copy colorCount when editing step 2
    } else if (step === 3) {
      // ✅ Activate step 3 preview (already clears step 4)
      previewManager.activateStep3Preview({});
      
      // ⚡ Restore previewImageData from processedImageData if not available
      if (!previewImageData && processedImageData) {
        setPreviewImageData(processedImageData);
      }
      
      setTempBlurRadius(blurRadius);
      setTempThreshold(threshold);
      setTempUseAutoThreshold(useAutoThreshold);
      setTempMinArea(minArea);
      setTempColorCount(colorCount);
    } else if (step === 4) {
      // ✅ Activate step 4 preview (clears step 3 preview)
      previewManager.activateStep4Preview({});
    }
  }, [mode, colorCount, blurRadius, threshold, useAutoThreshold, minArea, previewManager, previewImageData, processedImageData]);

  const handleCancelEdit = useCallback(() => {
    // ✅ IMPORTANT: editingStep retains old value due to closure  
    // This allows us to check which step we're canceling before clearing it
    const stepBeingCanceled = editingStep;
    
    setEditingStep(null);
    
    // ✅ Clear all preview states when canceling edit
    previewManager.clearAllPreviews();
    
    // ✅ Restore preview to the confirmed mode (not tempMode!)
    if (stepBeingCanceled === 2) {
      const cachedPreview = modePreviewCacheRef.current.get(mode);
      if (cachedPreview) {
        setPreviewImageData(cachedPreview);
      }
    } else {
      setPreviewImageData(null);
    }
    
    // Restore temp values to confirmed values
    setTempMode(mode);
    setTempBlurRadius(blurRadius);
    setTempThreshold(threshold);
    setTempUseAutoThreshold(useAutoThreshold);
    setTempMinArea(minArea);
    setTempColorCount(colorCount);
  }, [mode, blurRadius, threshold, useAutoThreshold, minArea, colorCount, previewManager, editingStep]);

  const handleConfirmEdit = useCallback((step: Step) => {
    setEditingStep(null);
    
    // ✅ Clear all preview states when confirming edit
    previewManager.clearAllPreviews();
    
    if (step === 2) {
      // Edited mode -> save mode and colorCount, then proceed to step 3
      setMode(tempMode);
      setColorCount(tempColorCount); // Also save colorCount when editing mode
      setCurrentStep(3);
      // Clear preview since we're starting fresh
      setPreviewImageData(null);
    } else if (step === 3) {
      // Edited params -> apply preprocessing and proceed to step 4
      handleConfirmParams();
      // handleConfirmParams will set currentStep to 4
    }
  }, [tempMode, handleConfirmParams, tempColorCount, previewManager]);

  // ======================================================================
  // Render Helpers
  // ======================================================================
  const isStepCompleted = (step: Step) => step < currentStep;
  const isStepCurrent = (step: Step) => step === currentStep || step === editingStep;
  const isStepDisabled = (step: Step) => step > currentStep;

  return (
    <ToolPageLayout
      title="vectorizerTool"
      description="vectorizerToolDesc"
      onBack={onBack}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Left Sidebar */}
        <div className="space-y-4">
          
          {/* Step 1: Upload Image */}
          <Card className={isStepCompleted(1) ? 'border-accent/30' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(1) && <Check className="w-4 h-4 text-accent" />}
                <span>1. {t('stepUploadImage')}</span>
              </CardTitle>
            </CardHeader>
            {isStepCurrent(1) && (
              <CardContent>
                <ImageUploader onImageUpload={handleImageUpload} />
              </CardContent>
            )}
            {isStepCompleted(1) && originalImage && (
              <CardContent>
                <div className="flex items-center gap-3">
                  <img 
                    src={originalImage.src} 
                    alt="Uploaded" 
                    className="w-12 h-12 object-cover rounded border"
                  />
                  <div className="text-xs text-muted-foreground flex-1">
                    {originalImage.width} × {originalImage.height}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t('upload')}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // Track image upload
                      trackImageUpload('vectorizer-tool', file.size, file.type);
                      
                      const reader = new FileReader();
                      reader.onload = (readerEvent) => {
                        const img = new Image();
                        img.onload = () => {
                          // ✅ Check image dimensions and resize if needed
                          let targetWidth = img.width;
                          let targetHeight = img.height;
                          const totalPixels = img.width * img.height;
                          
                          // Check if image exceeds size limits
                          if (img.width > LIMITS.MAX_IMAGE_WIDTH || 
                              img.height > LIMITS.MAX_IMAGE_HEIGHT || 
                              totalPixels > LIMITS.MAX_PIXELS) {
                            
                            // Calculate scale to fit within limits
                            const scaleWidth = LIMITS.MAX_IMAGE_WIDTH / img.width;
                            const scaleHeight = LIMITS.MAX_IMAGE_HEIGHT / img.height;
                            const scalePixels = Math.sqrt(LIMITS.MAX_PIXELS / totalPixels);
                            const scale = Math.min(scaleWidth, scaleHeight, scalePixels);
                            
                            targetWidth = Math.floor(img.width * scale);
                            targetHeight = Math.floor(img.height * scale);
                            
                            toast.warning(
                              `Image too large (${img.width}×${img.height}). Resized to ${targetWidth}×${targetHeight} for processing.`,
                              { duration: 5000 }
                            );
                          }
                          
                          const canvas = document.createElement('canvas');
                          canvas.width = targetWidth;
                          canvas.height = targetHeight;
                          const ctx = canvas.getContext('2d');
                          
                          if (ctx) {
                            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                            
                            try {
                              const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                              
                              // Create a new image object with the resized dimensions
                              const resizedImg = new Image();
                              resizedImg.width = targetWidth;
                              resizedImg.height = targetHeight;
                              resizedImg.src = canvas.toDataURL();
                              
                              handleImageUpload(imageData, resizedImg);
                            } catch (error) {
                              console.error('Failed to process image:', error);
                              toast.error('Failed to process image. Please try a smaller image.');
                            }
                          }
                        };
                        
                        img.onerror = () => {
                          toast.error('Failed to load image');
                        };
                        
                        img.src = readerEvent.target?.result as string;
                      };
                      
                      reader.onerror = () => {
                        toast.error('Failed to read file');
                      };
                      
                      reader.readAsDataURL(file);
                    }}
                    className="hidden"
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Step 2: Select Mode */}
          <Card className={isStepDisabled(2) ? 'opacity-50' : isStepCompleted(2) ? 'border-accent/30' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(2) && <Check className="w-4 h-4 text-accent" />}
                <span className="flex-1">2. {t('stepSelectMode')}</span>
                {isStepCompleted(2) && !isStepCurrent(2) && (
                  <Button variant="ghost" size="sm" onClick={() => handleEditStep(2)}>
                    {t('edit')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            {isStepCurrent(2) && (
              <CardContent className="space-y-3">
                <ModeSelector selectedMode={tempMode} onModeChange={setTempMode} />
                <div className="flex gap-2">
                  {editingStep === 2 && (
                    <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                      {t('cancel')}
                    </Button>
                  )}
                  <Button 
                    onClick={editingStep === 2 ? () => handleConfirmEdit(2) : handleConfirmMode} 
                    className="flex-1"
                  >
                    <span className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4" />
                      {t('confirmMode')}
                    </span>
                  </Button>
                </div>
              </CardContent>
            )}
            {isStepCompleted(2) && !isStepCurrent(2) && (
              <CardContent>
                <span className="text-sm">
                  {t(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}Title`)}
                </span>
              </CardContent>
            )}
            {isStepDisabled(2) && (
              <CardContent>
                <p className="text-xs text-muted-foreground">{t('completeStepFirst')}</p>
              </CardContent>
            )}
          </Card>

          {/* Step 3: Adjust Parameters */}
          <Card className={isStepDisabled(3) ? 'opacity-50' : isStepCompleted(3) ? 'border-accent/30' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(3) && <Check className="w-4 h-4 text-accent" />}
                <span className="flex-1">3. {t('stepAdjustParams')}</span>
                {isStepCompleted(3) && !isStepCurrent(3) && (
                  <Button variant="ghost" size="sm" onClick={() => handleEditStep(3)}>
                    {t('edit')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            {isStepCurrent(3) && (
              <CardContent>
                <PreprocessPanel
                  blurRadius={tempBlurRadius}
                  threshold={tempThreshold}
                  useAutoThreshold={tempUseAutoThreshold}
                  autoThresholdValue={autoThresholdValue}
                  onBlurRadiusChange={setTempBlurRadius}
                  onThresholdChange={setTempThreshold}
                  onAutoThresholdToggle={handleAutoThresholdToggle}
                  onApplyPreprocess={editingStep === 3 ? () => handleConfirmEdit(3) : handleConfirmParams}
                  isPreviewMode={true}
                  showColorClustering={mode !== 'line'}
                  colorCount={tempColorCount}
                  onColorCountChange={setTempColorCount}
                  mode={mode}
                  isEditMode={editingStep === 3}
                  onCancel={handleCancelEdit}
                  previewImageData={previewImageData}
                  onColorHighlight={(index) => {
                    // ✅ MIGRATED to usePreviewManager
                    previewManager.activateStep3Preview({ hoveredColor: index });
                  }}
                  onMergeColors={handleMergeColors}
                  selectedColorIndices={selectedColorIndices}
                  onColorSelect={(indices) => {
                    // ✅ MIGRATED to usePreviewManager
                    previewManager.activateStep3Preview({ selectedColors: indices });
                    setSelectedColorIndices(indices); // Still need this for merge colors logic
                  }}
                  // ❌ REMOVED: useBezierCurves prop, now always uses Potrace fallback strategy
                />
              </CardContent>
            )}
            {isStepCompleted(3) && !isStepCurrent(3) && (
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('blurRadius')}</span>
                    <span className="font-medium">{blurRadius}px</span>
                  </div>
                  {/* Only show threshold in line/mixed mode */}
                  {(mode === 'line' || mode === 'mixed') && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t('threshold')}</span>
                      <span className="font-medium">{useAutoThreshold ? `${t('autoThreshold')} (${autoThresholdValue})` : threshold}</span>
                    </div>
                  )}
                  {/* Only show colorCount in fill/mixed mode */}
                  {(mode === 'fill' || mode === 'mixed') && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t('colorCount')}</span>
                      <span className="font-medium">{colorCount}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
            {isStepDisabled(3) && (
              <CardContent>
                <p className="text-xs text-muted-foreground">{t('completeStepFirst')}</p>
              </CardContent>
            )}
          </Card>

          {/* Step 4: Edit Vector Nodes */}
          <Card className={isStepDisabled(4) ? 'opacity-50' : isStepCompleted(4) ? 'border-accent/30' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(4) && <Check className="w-4 h-4 text-accent" />}
                <span className="flex-1">4. {t('stepEditVectors')}</span>
                {isStepCompleted(4) && !isStepCurrent(4) && (
                  <Button variant="ghost" size="sm" onClick={() => handleEditStep(4)}>
                    {t('edit')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            {isStepCurrent(4) && (
              <CardContent>
                <div className="space-y-3">
                  {isVectorizing ? (
                    <div className="space-y-4 py-6">
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground">{t('vectorizing')}...</div>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={handleCancelVectorization}
                        className="w-full"
                      >
                        {t('cancel')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 bg-primary/5 rounded-lg">
                        <p className="text-xs text-muted-foreground">
                          {vectorPaths.length} {t('pathsGenerated')}
                        </p>
                      </div>
                      
                      {/* Path Layer Panel */}
                      <PathLayerPanel
                        paths={vectorPaths}
                        selectedPathIndices={selectedPathIndices}
                        hiddenPathIndices={hiddenPathIndices}
                        onPathSelect={(indices) => {
                          // ✅ MIGRATED to usePreviewManager
                          previewManager.activateStep4Preview({ selectedPaths: indices });
                          setSelectedPathIndices(indices); // Still need this for path operations
                        }}
                        onPathToggleVisibility={(index) => {
                          setHiddenPathIndices(prev =>
                            prev.includes(index)
                              ? prev.filter(i => i !== index)
                              : [...prev, index]
                          );
                        }}
                        onGroupToggleVisibility={(indices) => {
                          // 🎯 Toggle visibility for all paths in a group
                          // If ALL paths in the group are hidden, show them all
                          // Otherwise, hide them all
                          const allHidden = indices.every(idx => hiddenPathIndices.includes(idx));
                          
                          if (allHidden) {
                            // Show all paths in this group
                            setHiddenPathIndices(prev => prev.filter(idx => !indices.includes(idx)));
                          } else {
                            // Hide all paths in this group
                            setHiddenPathIndices(prev => {
                              const newHidden = [...prev];
                              indices.forEach(idx => {
                                if (!newHidden.includes(idx)) {
                                  newHidden.push(idx);
                                }
                              });
                              return newHidden;
                            });
                          }
                        }}
                        onPathDelete={(index) => {
                          setVectorPaths(prev => prev.filter((_, i) => i !== index));
                          setSelectedPathIndices(prev => prev.filter(i => i !== index));
                          setHiddenPathIndices(prev => prev.filter(i => i !== index));
                        }}
                        onPathHover={(index) => {
                          // ✅ MIGRATED to usePreviewManager
                          previewManager.activateStep4Preview({ hoveredPath: index });
                        }}
                      />
                      
                      <div className="flex gap-2 mt-4">
                        {editingStep === 4 && (
                          <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                            {t('cancel')}
                          </Button>
                        )}
                        <Button 
                          onClick={() => {
                            if (editingStep === 4) {
                              handleConfirmEdit(4);
                            } else {
                              setCurrentStep(5);
                            }
                          }}
                          className="flex-1"
                        >
                          <span className="flex items-center gap-2">
                            <ChevronRight className="h-4 w-4" />
                            {t('confirmGenerate')}
                          </span>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            )}
            {isStepCompleted(4) && !isStepCurrent(4) && (
              <CardContent>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary" />
                  <span>{vectorPaths.length} {t('pathsGenerated')}</span>
                </div>
              </CardContent>
            )}
            {isStepDisabled(4) && (
              <CardContent>
                <p className="text-xs text-muted-foreground">{t('completeStepFirst')}</p>
              </CardContent>
            )}
          </Card>

          {/* Step 5: Export SVG */}
          <Card className={isStepDisabled(5) ? 'opacity-50' : isStepCompleted(5) ? 'border-accent/30' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(5) && <Check className="w-4 h-4 text-accent" />}
                <span>5. {t('stepExport')}</span>
              </CardTitle>
            </CardHeader>
            {isStepCurrent(5) && (
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 bg-primary/5 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('imageSize')}</span>
                      <span className="font-medium">{originalImage?.width} × {originalImage?.height}px</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('pathsGenerated')}</span>
                      <span className="font-medium">{vectorPaths.length}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (!originalImage) return;
                        const svg = generateSVG(
                          vectorPaths,
                          originalImage.width,
                          originalImage.height
                        );
                        
                        // Track copy action
                        trackToolUsage('vectorizer-tool', 'copy_svg', `${vectorPaths.length} paths`);
                        
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
                            toast.success(t('copiedToClipboard') || 'SVG copied to clipboard!');
                          } else {
                            toast.error(t('copyFailed') || 'Failed to copy SVG');
                          }
                        } catch (err) {
                          console.error('Copy failed:', err);
                          toast.error(t('copyFailed') || 'Failed to copy SVG');
                        } finally {
                          document.body.removeChild(textarea);
                        }
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('copySVG') || 'Copy SVG'}
                    </Button>
                    
                    <Button
                      onClick={() => {
                        if (!originalImage) return;
                        const svg = generateSVG(
                          vectorPaths,
                          originalImage.width,
                          originalImage.height
                        );
                        const blob = new Blob([svg], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `vectorized-${Date.now()}.svg`;
                        a.click();
                        URL.revokeObjectURL(url);
                        
                        // Track download
                        trackExport('vectorizer-tool', 'svg', blob.size);
                      }}
                      className="flex-1"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {t('downloadSVG')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
            {isStepDisabled(5) && (
              <CardContent>
                <p className="text-xs text-muted-foreground">{t('completeStepFirst')}</p>
              </CardContent>
            )}
          </Card>

        </div>

        {/* Right Side - Canvas */}
        <div 
          className="sticky self-start bg-card rounded-lg border p-4"
          style={{ 
            top: `${stickyTop}px`, 
            height: `${viewportHeight}px` 
          }}
        >
          <SVGCanvas
            ref={svgCanvasRef}
            originalImage={originalImage}
            processedImageData={processedImageData}
            previewImageData={previewImageData}
            vectorPaths={currentStep <= 3 || editingStep === 2 || editingStep === 3 ? [] : vectorPaths}
            showOriginalImage={showOriginalImage}
            imageOpacity={imageOpacity}
            isPreviewMode={currentStep === 2 || currentStep === 3 || editingStep === 2 || editingStep === 3}
            hoveredColorIndex={previewManager.activePreviewSection === 'step3' ? previewManager.step3.hoveredColorIndex : null}
            highlightedColorIndices={previewManager.activePreviewSection === 'step3' ? previewManager.step3.selectedColorIndices : []}
            selectedPathIndices={previewManager.activePreviewSection === 'step4' ? previewManager.step4.selectedPathIndices : []}
            hoveredPathIndex={previewManager.activePreviewSection === 'step4' ? previewManager.step4.hoveredPathIndex : null}
            hiddenPathIndices={hiddenPathIndices}
            isProcessing={isGeneratingModePreview || isGeneratingPreview || isVectorizing}
          />
        </div>
      </div>
    </ToolPageLayout>
  );
};

VectorizerTool.displayName = 'VectorizerTool';