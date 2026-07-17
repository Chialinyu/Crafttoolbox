import { useState, useCallback } from 'react';

/**
 * History state for undo/redo functionality
 */
export interface HistoryState {
  colorMap: number[][];
  palette: string[];
  // Canvas dimensions
  mosaicWidth: number;
  mosaicHeight: number;
  // Color settings
  numColors: number;
  // Tile settings
  tileSize: number;
  tileSpacing: number;
  spacingColor: string;
  // Border settings
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  // 3D effects
  effect3D: boolean;
  tileDepth: number;
}

/** Maximum undo/redo snapshots to keep in memory */
export const MAX_HISTORY_STEPS = 40;

/**
 * Custom hook for managing mosaic editing history (undo/redo)
 * @returns Object with history state and control functions
 */
export const useMosaicHistory = () => {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  /**
   * Add new state to history.
   * Clears any future history if we're not at the end.
   * Caps length at MAX_HISTORY_STEPS by dropping oldest entries.
   */
  const addToHistory = useCallback((state: HistoryState) => {
    setHistory(prev => {
      const truncated = prev.slice(0, historyIndex + 1);
      truncated.push(state);
      if (truncated.length > MAX_HISTORY_STEPS) {
        return truncated.slice(truncated.length - MAX_HISTORY_STEPS);
      }
      return truncated;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_STEPS - 1));
  }, [historyIndex]);

  /**
   * Undo to previous state
   * @returns Previous state or null if can't undo
   */
  const undo = useCallback((): HistoryState | null => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      return history[newIndex];
    }
    return null;
  }, [history, historyIndex]);

  /**
   * Redo to next state
   * @returns Next state or null if can't redo
   */
  const redo = useCallback((): HistoryState | null => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      return history[newIndex];
    }
    return null;
  }, [history, historyIndex]);

  /**
   * Reset history with initial state
   */
  const resetHistory = useCallback((initialState: HistoryState) => {
    setHistory([initialState]);
    setHistoryIndex(0);
  }, []);

  /**
   * Get current state
   */
  const getCurrentState = useCallback((): HistoryState | null => {
    return history[historyIndex] || null;
  }, [history, historyIndex]);

  return {
    // State
    history,
    historyIndex,
    
    // Actions
    addToHistory,
    undo,
    redo,
    resetHistory,
    getCurrentState,
    
    // Status
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
};
