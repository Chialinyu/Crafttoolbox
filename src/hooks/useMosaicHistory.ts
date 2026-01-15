import { useState, useCallback, useEffect } from 'react';

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

/**
 * Custom hook for managing mosaic editing history (undo/redo)
 * @returns Object with history state and control functions
 */
export const useMosaicHistory = () => {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  /**
   * Add new state to history
   * Clears any future history if we're not at the end
   */
  const addToHistory = useCallback((state: HistoryState) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(state);
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
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