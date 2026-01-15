import React, { useRef, useEffect, useLayoutEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '../ui/button';
import { VectorPath, pointsToSVGPath } from './utils/vectorization';

interface SVGCanvasProps {
  originalImage: HTMLImageElement | null;
  processedImageData: ImageData | null;
  previewImageData: ImageData | null;
  vectorPaths: VectorPath[];
  showOriginalImage?: boolean;
  imageOpacity?: number;
  isPreviewMode?: boolean;
  hoveredColorIndex?: number | null;
  highlightedColorIndices?: number[];
  selectedPathIndices?: number[];
  hoveredPathIndex?: number | null;
  hiddenPathIndices?: number[];
  isProcessing?: boolean; // NEW: Loading state for long computations
}

// ✨ Exposed ref methods for direct canvas updates
export interface SVGCanvasRef {
  updatePreviewDirectly: (imageData: ImageData) => void;
}

/**
 * SVGCanvas - Main canvas display component
 * 
 * Features:
 * - Zoom & pan controls
 * - Original image overlay (adjustable opacity)
 * - Color highlight preview (hover + selection)
 * - Vector path rendering
 */
export const SVGCanvas = forwardRef<SVGCanvasRef, SVGCanvasProps>(({
  originalImage,
  processedImageData,
  previewImageData,
  vectorPaths,
  showOriginalImage = true,
  imageOpacity = 0.3,
  isPreviewMode = false,
  hoveredColorIndex = null,
  highlightedColorIndices = [],
  selectedPathIndices = [],
  hoveredPathIndex = null,
  hiddenPathIndices = [],
  isProcessing = false, // NEW: Loading state for long computations
}, ref) => {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const hasInitializedZoom = useRef(false);
  
  // ✨ Internal state for direct preview updates (bypasses prop updates)
  const directPreviewRef = useRef<ImageData | null>(null);

  // ✨ STEP 1: Pre-calculate color metadata (only once when image changes)
  // This dramatically improves hover performance by avoiding repeated color analysis
  const colorMetadata = React.useMemo(() => {
    const imageData = previewImageData || processedImageData;
    if (!imageData) return null;

    const data = imageData.data;
    const pixelCount = imageData.width * imageData.height;
    
    // 🎯 Build color map using Morandi palette order (index 0-9)
    // This ensures colorIndex matches cluster ID and color palette order
    const morandiPalette = [
      [168, 159, 145], // 0: Coffee
      [232, 180, 184], // 1: Pink
      [198, 219, 213], // 2: Mint
      [229, 206, 192], // 3: Beige
      [183, 196, 207], // 4: Blue-gray
      [208, 193, 201], // 5: Lavender
      [196, 186, 167], // 6: Warm gray
      [217, 206, 185], // 7: Sand
      [172, 184, 177], // 8: Sage
      [201, 179, 169], // 9: Taupe
    ];
    
    // First pass: Count pixels for each Morandi color
    const colorMap = new Map<string, number[]>();
    
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      
      // Skip transparent/white background
      if (a < 128 || (r > 250 && g > 250 && b > 250)) {
        continue;
      }
      
      const key = `${r},${g},${b}`;
      
      if (!colorMap.has(key)) {
        colorMap.set(key, []);
      }
      colorMap.get(key)!.push(i);
    }
    
    // 🎯 Build ordered color array following Morandi palette sequence
    // This ensures colors[0] = Morandi[0], colors[1] = Morandi[1], etc.
    const orderedColors: Array<[string, number[]]> = [];
    
    for (const [r, g, b] of morandiPalette) {
      const key = `${r},${g},${b}`;
      if (colorMap.has(key)) {
        orderedColors.push([key, colorMap.get(key)!]);
      }
    }
    
    // ✨ NEW: Pre-generate grayscale background (only once!)
    const grayBackground = new ImageData(imageData.width, imageData.height);
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      
      // Fade to light gray
      const gray = (r + g + b) / 3;
      const lightGray = gray * 0.3 + 255 * 0.7; // 70% white, 30% original
      grayBackground.data[offset] = lightGray;
      grayBackground.data[offset + 1] = lightGray;
      grayBackground.data[offset + 2] = lightGray;
      grayBackground.data[offset + 3] = 255;
    }
    
    return {
      sortedColors: orderedColors, // 🎯 Now in Morandi palette order, not sorted by area
      imageData,
      width: imageData.width,
      height: imageData.height,
      grayBackground, // Pre-generated background
    };
  }, [previewImageData, processedImageData]);

  // ✨ STEP 2: Generate highlight overlay (ultra-fast, using pre-generated background)
  // Priority: hoveredColorIndex > highlightedColorIndices
  const highlightOverlay = React.useMemo(() => {
    if (!colorMetadata) return null;
    
    let colorIndicesToHighlight: number[] = [];
    
    if (hoveredColorIndex !== null) {
      colorIndicesToHighlight = [hoveredColorIndex];
    } else if (highlightedColorIndices.length > 0) {
      colorIndicesToHighlight = highlightedColorIndices;
    } else {
      return null;
    }
    
    // Validate indices
    if (colorIndicesToHighlight.some(index => index >= colorMetadata.sortedColors.length)) {
      return null;
    }
    
    // ✨ Clone pre-generated gray background (fast!)
    const overlay = new ImageData(
      new Uint8ClampedArray(colorMetadata.grayBackground.data),
      colorMetadata.width,
      colorMetadata.height
    );
    
    const srcData = colorMetadata.imageData.data;
    const dstData = overlay.data;
    
    // ✨ Only process pixels for highlighted colors (much faster!)
    for (const colorIndex of colorIndicesToHighlight) {
      const pixelIndices = colorMetadata.sortedColors[colorIndex][1];
      
      for (const pixelIdx of pixelIndices) {
        const offset = pixelIdx * 4;
        // Restore original color for highlighted pixels
        dstData[offset] = srcData[offset];
        dstData[offset + 1] = srcData[offset + 1];
        dstData[offset + 2] = srcData[offset + 2];
        dstData[offset + 3] = 255;
      }
    }
    
    return overlay;
  }, [hoveredColorIndex, highlightedColorIndices, colorMetadata]);

  // Fit to screen BEFORE first paint to avoid flash
  useLayoutEffect(() => {
    if (originalImage && canvasRef.current && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const canvasWidth = originalImage.width;
      const canvasHeight = originalImage.height;
      
      // Calculate scale
      const scaleX = (containerWidth - 80) / canvasWidth;
      const scaleY = (containerHeight - 80) / canvasHeight;
      const scale = Math.min(scaleX, scaleY);
      
      setZoom(scale);
      setPan({ x: 0, y: 0 });
    }
  }, [originalImage]); // Every time originalImage changes, recalculate zoom

  // Draw processed or preview image on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size first if we have an original image
    if (originalImage) {
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Priority: previewImageData > processedImageData > originalImage
    if (previewImageData) {
      ctx.putImageData(previewImageData, 0, 0);
    } else if (processedImageData) {
      ctx.putImageData(processedImageData, 0, 0);
    } else if (originalImage) {
      ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImage, processedImageData, previewImageData]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.1));
  };

  const handleFitToScreen = () => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;
    
    // Add padding
    const scaleX = (containerWidth - 80) / canvasWidth;
    const scaleY = (containerHeight - 80) / canvasHeight;
    const scale = Math.min(scaleX, scaleY);
    
    setZoom(scale);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      
      setPan(prev => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Handle wheel with native event listener to properly prevent default
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom when Ctrl/Cmd is pressed
      if (!e.ctrlKey && !e.metaKey) {
        // Let the page scroll normally
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      // Slower zoom speed: 0.95 instead of 0.9
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      const newZoom = Math.min(Math.max(zoom * delta, 0.1), 5);
      
      // Get mouse position relative to container
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate the point in the canvas that the mouse is over
      const canvasX = (mouseX - rect.width / 2 - pan.x) / zoom;
      const canvasY = (mouseY - rect.height / 2 - pan.y) / zoom;
      
      // Calculate new pan to keep the mouse over the same point
      const newPanX = mouseX - rect.width / 2 - canvasX * newZoom;
      const newPanY = mouseY - rect.height / 2 - canvasY * newZoom;
      
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    // Add event listener with passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, pan]);

  // ✨ Expose ref methods
  useImperativeHandle(ref, () => ({
    updatePreviewDirectly: (imageData: ImageData) => {
      // ⚡ Direct canvas update - immediately draw without state update
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Immediately update canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(imageData, 0, 0);
      
      // Store for future reference
      directPreviewRef.current = imageData;
    }
  }));

  return (
    <div className="relative h-full flex flex-col">
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={handleZoomIn}
          title={t('zoomIn')}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleZoomOut}
          title={t('zoomOut')}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleFitToScreen}
          title={t('fitToScreen')}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-muted/30 rounded-lg relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        {/* ✨ Loading Overlay - Non-blocking */}
        {isProcessing && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none">
            <div className="text-center space-y-3 pointer-events-auto">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-sm font-medium text-foreground">{t('processing')}</p>
              <p className="text-xs text-muted-foreground">{t('pleaseWait')}</p>
            </div>
          </div>
        )}
        
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          {originalImage ? (
            <div className="relative">
              {/* Canvas for raster image */}
              <canvas
                ref={canvasRef}
                className="shadow-lg bg-white"
                style={{
                  imageRendering: zoom > 2 ? 'pixelated' : 'auto',
                  opacity: vectorPaths.length > 0 ? 0.5 : 1,
                }}
              />
              
              {/* Color highlight overlay (NEW) */}
              {(hoveredColorIndex !== null || highlightedColorIndices.length > 0) && (previewImageData || processedImageData) && (
                <canvas
                  ref={(highlightCanvas) => {
                    if (!highlightCanvas) return;
                    const imageData = previewImageData || processedImageData;
                    if (!imageData) return;
                    
                    highlightCanvas.width = imageData.width;
                    highlightCanvas.height = imageData.height;
                    
                    const ctx = highlightCanvas.getContext('2d');
                    if (!ctx) return;
                    
                    // Draw pre-calculated highlight overlay
                    if (highlightOverlay) {
                      ctx.putImageData(highlightOverlay, 0, 0);
                    }
                  }}
                  className="absolute top-0 left-0 pointer-events-none shadow-lg bg-white"
                  style={{ 
                    zIndex: 10,
                  }}
                />
              )}
              
              {/* SVG overlay for vector paths */}
              {vectorPaths.length > 0 && (
                <svg
                  ref={svgRef}
                  width={originalImage.width}
                  height={originalImage.height}
                  viewBox={`0 0 ${originalImage.width} ${originalImage.height}`}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{ zIndex: 10 }}
                >
                  {vectorPaths.map((path, index) => {
                    const isHidden = hiddenPathIndices.includes(index);
                    if (isHidden) return null;
                    
                    const isSelected = selectedPathIndices.includes(index);
                    const isHovered = hoveredPathIndex === index;
                    
                    return (
                      <path
                        key={index}
                        d={path.svgPath || pointsToSVGPath(path.points, path.closed)}
                        fill={path.type === 'fill' ? (path.color || '#E8B4B8') : 'none'}
                        stroke={
                          isSelected ? '#2563eb' : // Blue for selected
                          isHovered ? '#f59e0b' : // Amber for hovered
                          (path.type === 'stroke' ? (path.color || '#A89F91') : (path.color || '#A89F91'))
                        }
                        strokeWidth={
                          isSelected ? 4 :
                          isHovered ? 3 :
                          (path.type === 'stroke' ? 2 : 0.5)
                        }
                        opacity={
                          isSelected ? 1 :
                          isHovered ? 0.9 :
                          0.8
                        }
                        filter={
                          isSelected ? 'drop-shadow(0 0 8px rgba(37, 99, 235, 0.5))' :
                          isHovered ? 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))' :
                          undefined
                        }
                      />
                    );
                  })}
                </svg>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              <p className="text-sm">{t('noImageUploaded')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="mt-2 flex justify-between items-center text-xs text-muted-foreground px-2">
        <span>
          {originalImage && `${originalImage.width} × ${originalImage.height}px`}
          {vectorPaths.length > 0 && ` • ${vectorPaths.length} paths`}
        </span>
        <span>
          {t('zoomIn')}: {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
});

SVGCanvas.displayName = 'SVGCanvas';