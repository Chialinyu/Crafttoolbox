import React, { useRef, useEffect, forwardRef, useImperativeHandle, useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Upload, Check, Undo, Redo, RotateCcw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
  calculateCanvasSize, 
  calculateOffsets, 
  calculatePixelPosition 
} from '../../../utils/mosaicUtils';

interface MosaicCanvasProps {
  // Mosaic data
  colorMap: number[][];
  palette: string[];
  
  // Canvas dimensions
  mosaicWidth: number;
  mosaicHeight: number;
  tileSize: number;
  tileSpacing: number;
  
  // Styling
  spacingColor: string;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  
  // Effects
  effect3D: boolean;
  tileDepth: number;
  
  // Interaction
  selectedColorGroup: number | null;
  hoveredColorGroup: number | null;
  onClick?: (tileX: number, tileY: number) => void;
  onUploadClick?: () => void;
  onClearSelection?: () => void;
  hasImage?: boolean;
  
  // History controls
  onUndo?: () => void;
  onRedo?: () => void;
  onReset?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export interface MosaicCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
  redraw: () => void;
}

export const MosaicCanvas = forwardRef<MosaicCanvasHandle, MosaicCanvasProps>(({
  colorMap,
  palette,
  mosaicWidth,
  mosaicHeight,
  tileSize,
  tileSpacing,
  spacingColor,
  borderEnabled,
  borderColor,
  borderWidth,
  effect3D,
  tileDepth,
  selectedColorGroup,
  hoveredColorGroup,
  onClick,
  onUploadClick,
  onClearSelection,
  hasImage = true,
  onUndo,
  onRedo,
  onReset,
  canUndo,
  canRedo,
}, ref) => {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  /**
   * Draw the mosaic on canvas
   */
  const drawMosaic = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || colorMap.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate dimensions
    const { offsetX, offsetY } = calculateOffsets(borderEnabled, borderWidth);
    
    // Clear and redraw background with SPACING COLOR (not backgroundColor)
    ctx.fillStyle = spacingColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Determine active color group (hover takes precedence)
    const activeColorGroup = hoveredColorGroup !== null ? hoveredColorGroup : selectedColorGroup;

    // Draw tiles
    for (let y = 0; y < mosaicHeight; y++) {
      for (let x = 0; x < mosaicWidth; x++) {
        const colorIndex = colorMap[y]?.[x];
        if (colorIndex === undefined) continue;

        const { px, py } = calculatePixelPosition(x, y, offsetX, offsetY, tileSize, tileSpacing);

        // Handle transparent tiles
        if (colorIndex === -1) {
          // Draw transparent tile with rgba(0,0,0,0)
          ctx.fillStyle = 'rgba(0,0,0,0)';
          ctx.fillRect(px, py, tileSize, tileSize);
          
          // If transparent color group is active, draw highlight border
          if (activeColorGroup === -1) {
            ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)'; // Golden highlight
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
          }
          
          continue;
        }

        const tileColor = palette[colorIndex];

        // Apply highlighting effect
        let finalColor = tileColor;
        
        if (activeColorGroup !== null && activeColorGroup !== colorIndex) {
          // Desaturate and dim non-selected tiles
          const match = tileColor.match(/rgb\((\d+), (\d+), (\d+)\)/);
          if (match) {
            const [, r, g, b] = match.map(Number);
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            // Mix gray with fixed light background (245, 241, 232) to simulate 0.4 opacity
            // This preserves the original visual appearance without being affected by spacingColor
            const mixedR = Math.round(gray * 0.4 + 245 * 0.6);
            const mixedG = Math.round(gray * 0.4 + 241 * 0.6);
            const mixedB = Math.round(gray * 0.4 + 232 * 0.6);
            finalColor = `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
          }
        }

        // Draw tile with optional 3D effect
        if (effect3D) {
          // Shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.fillRect(px + tileDepth, py + tileDepth, tileSize, tileSize);
          
          // Main tile
          ctx.fillStyle = finalColor;
          ctx.fillRect(px, py, tileSize, tileSize);
          
          // Highlight (FIXED - not customizable)
          if (activeColorGroup === null || activeColorGroup === colorIndex) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(px, py, tileSize / 2, tileSize / 4);
          }
        } else {
          ctx.fillStyle = finalColor;
          ctx.fillRect(px, py, tileSize, tileSize);
        }
      }
    }

    // Draw border
    if (borderEnabled) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);
    }

    // Draw hover indicator (orange border on hovered tile)
    if (hoveredTile) {
      const { px, py } = calculatePixelPosition(
        hoveredTile.x,
        hoveredTile.y,
        offsetX,
        offsetY,
        tileSize,
        tileSpacing
      );
      
      ctx.strokeStyle = '#ff8c00'; // Orange color
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, tileSize, tileSize);
    }

    // 🎯 Auto-scale canvas to fit container (original feature)
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // Calculate scale to fit container with padding
      const scaleX = (containerWidth - 80) / canvas.width;
      const scaleY = (containerHeight - 80) / canvas.height;
      const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
      
      // Apply auto-scaling via CSS
      canvas.style.width = `${canvas.width * scale}px`;
      canvas.style.height = `${canvas.height * scale}px`;
    }
  }, [
    colorMap,
    palette,
    mosaicWidth,
    mosaicHeight,
    tileSize,
    tileSpacing,
    spacingColor,
    borderEnabled,
    borderColor,
    borderWidth,
    effect3D,
    tileDepth,
    selectedColorGroup,
    hoveredColorGroup,
    hoveredTile,
  ]);

  /**
   * Handle canvas click
   */
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.stopPropagation(); // Prevent triggering handleOutsideClick
    
    if (!onClick || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    // Get click position relative to container
    const containerRect = container.getBoundingClientRect();
    const clickX = event.clientX - containerRect.left;
    const clickY = event.clientY - containerRect.top;
    
    // Get canvas position in container (considering transform)
    const canvasRect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - canvasRect.left;
    const canvasY = event.clientY - canvasRect.top;
    
    // Convert to canvas coordinates (considering CSS scaling)
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    const x = canvasX * scaleX;
    const y = canvasY * scaleY;

    const { offsetX, offsetY } = calculateOffsets(borderEnabled, borderWidth);

    // Calculate clicked tile position
    const tileX = Math.floor((x - offsetX) / (tileSize + tileSpacing));
    const tileY = Math.floor((y - offsetY) / (tileSize + tileSpacing));

    if (tileX >= 0 && tileX < mosaicWidth && tileY >= 0 && tileY < mosaicHeight) {
      onClick(tileX, tileY);
    }
  };

  /**
   * Handle canvas hover for orange border indicator
   */
  const handleCanvasHover = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const canvasRect = canvas.getBoundingClientRect();
    const canvasX = event.clientX - canvasRect.left;
    const canvasY = event.clientY - canvasRect.top;
    
    // Convert to canvas coordinates (considering CSS scaling)
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    const x = canvasX * scaleX;
    const y = canvasY * scaleY;

    const { offsetX, offsetY } = calculateOffsets(borderEnabled, borderWidth);

    // Calculate hovered tile position
    const tileX = Math.floor((x - offsetX) / (tileSize + tileSpacing));
    const tileY = Math.floor((y - offsetY) / (tileSize + tileSpacing));

    if (tileX >= 0 && tileX < mosaicWidth && tileY >= 0 && tileY < mosaicHeight) {
      setHoveredTile({ x: tileX, y: tileY });
    } else {
      setHoveredTile(null);
    }
  };

  /**
   * Handle canvas mouse leave
   */
  const handleCanvasLeave = () => {
    setHoveredTile(null);
  };

  /**
   * Zoom and Pan controls
   */
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.1));
  };

  const handleFitToScreen = () => {
    // Reset zoom to 1 because CSS auto-scaling handles the fit
    setZoom(1);
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

  // Handle wheel zoom with Ctrl/Cmd
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom when Ctrl/Cmd is pressed
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
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

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoom, pan]);

  /**
   * Update canvas size when dimensions change
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height } = calculateCanvasSize(
      mosaicWidth,
      mosaicHeight,
      tileSize,
      tileSpacing,
      borderEnabled,
      borderWidth
    );

    canvas.width = width;
    canvas.height = height;
    
    // 🔥 CRITICAL: Force redraw immediately after canvas size changes
    // This fixes the bug where new images show old dimensions (e.g., 14x7 instead of 40x40)
    drawMosaic();
  }, [mosaicWidth, mosaicHeight, tileSize, tileSpacing, borderEnabled, borderWidth, drawMosaic]);

  /**
   * Fit to screen only when new image is loaded (mosaicWidth/Height change)
   */
  useEffect(() => {
    // Only fit when image dimensions change (new image loaded)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        handleFitToScreen();
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mosaicWidth, mosaicHeight]);

  /**
   * Redraw when any parameter changes
   */
  useEffect(() => {
    drawMosaic();
  }, [drawMosaic]);

  /**
   * Expose methods to parent component
   */
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    redraw: drawMosaic,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <CardTitle>{t('preview')}</CardTitle>
          <span className={`text-sm text-muted-foreground transition-opacity ${selectedColorGroup !== null ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {t('clickTileToChange')}
          </span>
        </div>
        <Button 
          type="button"
          size="sm" 
          variant="ghost" 
          onClick={(e) => {
            e.stopPropagation();
            onClearSelection?.();
          }}
          className={`transition-opacity ${selectedColorGroup !== null ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <Check className="h-3 w-3 mr-1" />
          {t('clearSelection')}
        </Button>
      </CardHeader>
      <CardContent className="h-[calc(100vh-240px)]">
        {!hasImage ? (
          <div 
            className="h-full bg-muted rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors border-2 border-dashed border-muted-foreground/20 hover:border-primary/50"
            onClick={onUploadClick}
          >
            <div className="text-center text-muted-foreground pointer-events-none">
              <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('uploadImage')}</p>
              <p className="text-xs mt-2 opacity-70">{t('chooseImage')}</p>
            </div>
          </div>
        ) : (
          <div className="relative h-full flex flex-col">{/* Toolbar - floats inside the container */}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={onUndo}
                disabled={!canUndo}
                title={t('undo')}
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={onRedo}
                disabled={!canRedo}
                title={t('redo')}
              >
                <Redo className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={onReset}
                disabled={!hasImage}
                title={t('reset')}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
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
            
            {/* Canvas Container - like vectorizer */}
            <div
              ref={containerRef}
              className="flex-1 overflow-hidden bg-muted/30 rounded-lg relative"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              >
                <canvas 
                  ref={canvasRef} 
                  className="shadow-lg cursor-pointer"
                  style={{
                    display: 'block',
                    imageRendering: 'pixelated',
                  }}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasHover}
                  onMouseLeave={handleCanvasLeave}
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

MosaicCanvas.displayName = 'MosaicCanvas';