import { useState, useEffect } from 'react';

/**
 * Custom Hook: useViewportHeight
 * 
 * Calculates available viewport height for sticky content,
 * taking into account Header, Footer, and layout padding.
 * 
 * Usage:
 * ```tsx
 * const { viewportHeight, stickyTop } = useViewportHeight();
 * 
 * <div 
 *   className="sticky" 
 *   style={{ top: `${stickyTop}px`, height: `${viewportHeight}px` }}
 * >
 *   {content}
 * </div>
 * ```
 * 
 * @returns {Object} viewportHeight, stickyTop, minHeight
 */
export const useViewportHeight = () => {
  const [viewportHeight, setViewportHeight] = useState<number>(0);

  useEffect(() => {
    const calculateHeight = () => {
      // Header height: 64px (h-16)
      const headerHeight = 64;
      
      // Footer height: estimate ~68px (py-3 * 2 + content)
      const footerHeight = 68;
      
      // ToolPageLayout padding: py-8 (32px top + 32px bottom)
      const toolLayoutPadding = 64;
      
      // Additional spacing for sticky positioning and margins
      const additionalSpacing = 16;
      
      // Calculate available height
      const totalSubtract = headerHeight + footerHeight + toolLayoutPadding + additionalSpacing;
      const availableHeight = window.innerHeight - totalSubtract;
      
      setViewportHeight(Math.max(400, availableHeight)); // Minimum 400px
    };

    // Calculate on mount
    calculateHeight();

    // Recalculate on window resize
    window.addEventListener('resize', calculateHeight);

    return () => {
      window.removeEventListener('resize', calculateHeight);
    };
  }, []);

  return {
    /**
     * Available viewport height for sticky content
     */
    viewportHeight,
    
    /**
     * Top position for sticky elements (after header)
     */
    stickyTop: 80, // 80px to account for header (64px) + some spacing
    
    /**
     * Minimum content height
     */
    minHeight: 400,
  };
};