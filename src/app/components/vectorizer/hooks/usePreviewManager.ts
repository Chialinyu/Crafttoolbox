import { useState, useCallback } from 'react';

/**
 * Custom hook to manage mutually exclusive preview states between Step 3 and Step 4
 * 
 * Step 3 Preview: Color highlighting (hover/selection)
 * Step 4 Preview: Path highlighting (hover/selection)
 * 
 * These two previews cannot be active at the same time to avoid visual confusion.
 */

type PreviewSection = 'step3' | 'step4' | null;

export interface Step3PreviewState {
  hoveredColorIndex: number | null;
  selectedColorIndices: number[];
}

export interface Step4PreviewState {
  hoveredPathIndex: number | null;
  selectedPathIndices: number[];
}

export const usePreviewManager = () => {
  // Track which preview section is currently active
  const [activePreviewSection, setActivePreviewSection] = useState<PreviewSection>(null);
  
  // Step 3: Color preview states
  const [hoveredColorIndex, setHoveredColorIndex] = useState<number | null>(null);
  const [selectedColorIndices, setSelectedColorIndices] = useState<number[]>([]);
  
  // Step 4: Path preview states
  const [hoveredPathIndex, setHoveredPathIndex] = useState<number | null>(null);
  const [selectedPathIndices, setSelectedPathIndices] = useState<number[]>([]);

  /**
   * Switch to Step 3 preview mode
   * Clears Step 4 preview states
   */
  const activateStep3Preview = useCallback((
    options?: {
      hoveredColor?: number | null;
      selectedColors?: number[];
    }
  ) => {
    setActivePreviewSection('step3');
    
    // Set Step 3 states
    if (options?.hoveredColor !== undefined) {
      setHoveredColorIndex(options.hoveredColor);
    }
    if (options?.selectedColors !== undefined) {
      setSelectedColorIndices(options.selectedColors);
    }
    
    // Clear Step 4 states
    setHoveredPathIndex(null);
    setSelectedPathIndices([]);
  }, []);

  /**
   * Switch to Step 4 preview mode
   * Clears Step 3 preview states
   */
  const activateStep4Preview = useCallback((
    options?: {
      hoveredPath?: number | null;
      selectedPaths?: number[];
    }
  ) => {
    setActivePreviewSection('step4');
    
    // Set Step 4 states
    if (options?.hoveredPath !== undefined) {
      setHoveredPathIndex(options.hoveredPath);
    }
    if (options?.selectedPaths !== undefined) {
      setSelectedPathIndices(options.selectedPaths);
    }
    
    // Clear Step 3 states
    setHoveredColorIndex(null);
    setSelectedColorIndices([]);
  }, []);

  /**
   * Clear all preview states
   */
  const clearAllPreviews = useCallback(() => {
    setActivePreviewSection(null);
    setHoveredColorIndex(null);
    setSelectedColorIndices([]);
    setHoveredPathIndex(null);
    setSelectedPathIndices([]);
  }, []);

  /**
   * Get props to pass to SVGCanvas component
   */
  const getCanvasPreviewProps = useCallback(() => {
    return {
      hoveredColorIndex: activePreviewSection === 'step3' ? hoveredColorIndex : null,
      highlightedColorIndices: activePreviewSection === 'step3' ? selectedColorIndices : [],
      selectedPathIndices: activePreviewSection === 'step4' ? selectedPathIndices : [],
      hoveredPathIndex: activePreviewSection === 'step4' ? hoveredPathIndex : null,
    };
  }, [activePreviewSection, hoveredColorIndex, selectedColorIndices, selectedPathIndices, hoveredPathIndex]);

  return {
    // States
    activePreviewSection,
    step3: {
      hoveredColorIndex,
      selectedColorIndices,
      setHoveredColorIndex,
      setSelectedColorIndices,
    },
    step4: {
      hoveredPathIndex,
      selectedPathIndices,
      setHoveredPathIndex,
      setSelectedPathIndices,
    },
    
    // Actions
    activateStep3Preview,
    activateStep4Preview,
    clearAllPreviews,
    
    // Helpers
    getCanvasPreviewProps,
  };
};
