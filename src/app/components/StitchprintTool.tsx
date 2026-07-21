import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { ToolPageLayout } from './ui/ToolPageLayout';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import {
  Check,
  Link2,
  Link2Off,
  Maximize2,
  Pencil,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { trackExport, trackToolUsage } from '@/utils/analytics';
import { toast } from 'sonner';
import {
  formatResizeWarning,
  guardImageUpload,
} from '@/utils/imageUploadGuard';
import { rgbToHex } from '@/utils/colorUtils';
import { CustomColorPicker } from './CustomColorPicker';
import {
  BOARD_STYLE_MAP,
  BOARD_THICKNESS_MAX_MM,
  BOARD_THICKNESS_MIN_MM,
  CANVAS_PRESETS,
  CANVAS_PRESET_MAP,
  SIZE_TEMPLATES,
  TRANSPARENT_STITCH_INDEX,
  boardPassesFromThickness,
  changePaletteColor,
  cloneColorMap,
  countPaletteUsage,
  emptyColorMap,
  generateCrossStitch,
  gridDimensions,
  imageDataToColorPattern,
  paintCell,
  patternToGcode,
  patternToSvgDocument,
  patternToSvgMarkup,
  sampleCornerBackground,
  type Backboard,
  type BaseStrategy,
  type BoardStyleId,
  type CanvasPresetId,
  type CanvasShape,
  type CanvasStyle,
  type EmptyCellMode,
  type ImageFitMode,
  type SizeTemplate,
  type StitchColorMap,
} from './stitchprint';

type Step = 1 | 2 | 3 | 4 | 5;

interface StitchprintToolProps {
  onBack: () => void;
}

const DEFAULT_GRID_COLOR = '#94a3b8';
const DEFAULT_STITCH_COLOR = '#1e293b';
const SIZE_MIN_MM = 20;
const SIZE_MAX_MM = 250;

function clampSize(value: number): number {
  return Math.max(SIZE_MIN_MM, Math.min(SIZE_MAX_MM, Math.round(value)));
}

/**
 * Stitchprint V2 — image → cell mask → X stitches; grid base optional.
 */
export const StitchprintTool: React.FC<StitchprintToolProps> = ({ onBack }) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState<Step>(1);

  const [widthMm, setWidthMm] = useState(SIZE_TEMPLATES.bookmark.widthMm);
  const [heightMm, setHeightMm] = useState(SIZE_TEMPLATES.bookmark.heightMm);
  const [sizeTemplate, setSizeTemplate] = useState<SizeTemplate>('bookmark');
  const [lockAspect, setLockAspect] = useState(true);
  const aspectRatioRef = useRef(
    SIZE_TEMPLATES.bookmark.widthMm / SIZE_TEMPLATES.bookmark.heightMm
  );

  const [sourceImageData, setSourceImageData] = useState<ImageData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [emptyMode, setEmptyMode] = useState<EmptyCellMode>('background');
  const [threshold, setThreshold] = useState(235);
  const [invert, setInvert] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [backgroundTolerance, setBackgroundTolerance] = useState(14);
  const [minCoveragePercent, setMinCoveragePercent] = useState(18);
  const [fitMode, setFitMode] = useState<ImageFitMode>('contain');
  const [colorCount, setColorCount] = useState(4);
  const [editableColorMap, setEditableColorMap] = useState<StitchColorMap | null>(null);
  const [editablePalette, setEditablePalette] = useState<string[]>([]);
  const [selectedPaintIndex, setSelectedPaintIndex] = useState<number | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<number | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);

  const [cellSize, setCellSize] = useState(4);
  const [strokeWidth, setStrokeWidth] = useState(0.4);
  const [gridWeight, setGridWeight] = useState(0.3);
  const [fillPercent, setFillPercent] = useState(70);
  const [showBorder, setShowBorder] = useState(true);
  const [gridColor, setGridColor] = useState(DEFAULT_GRID_COLOR);
  const [stitchColor, setStitchColor] = useState(DEFAULT_STITCH_COLOR);

  const [baseStrategy, setBaseStrategy] = useState<BaseStrategy>('print-grid');
  const [autoPause, setAutoPause] = useState(true);
  const [canvasPreset, setCanvasPreset] = useState<CanvasPresetId>('custom');
  const [canvasStyle, setCanvasStyle] = useState<CanvasStyle>('square');
  const [backboard, setBackboard] = useState<Backboard>('none');
  const [canvasShape, setCanvasShape] = useState<CanvasShape>('rect');
  const [polygonSides, setPolygonSides] = useState(6);
  const [starPoints, setStarPoints] = useState(5);
  const [heartFullness, setHeartFullness] = useState(1);
  // Default thin enough for the bookmark size template; thicker styles are a click away.
  const [boardStyle, setBoardStyle] = useState<BoardStyleId>('bookmark');
  const [boardThicknessMm, setBoardThicknessMm] = useState(
    BOARD_STYLE_MAP.bookmark.thicknessMm
  );
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const previewContentRef = useRef<HTMLDivElement>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [isPreviewPanning, setIsPreviewPanning] = useState(false);
  const previewPointerRef = useRef({ x: 0, y: 0 });
  const panMovedRef = useRef(false);
  const sourcePaletteRef = useRef<string[]>([]);

  const resetPreviewView = useCallback(() => {
    setPreviewZoom(1);
    setPreviewPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code === 'Space' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        setSpacePressed(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const rect = container.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const nextZoom = Math.min(
        8,
        Math.max(0.25, previewZoom * (event.deltaY > 0 ? 0.9 : 1.1))
      );
      const contentX = (pointerX - rect.width / 2 - previewPan.x) / previewZoom;
      const contentY = (pointerY - rect.height / 2 - previewPan.y) / previewZoom;

      setPreviewZoom(nextZoom);
      setPreviewPan({
        x: pointerX - rect.width / 2 - contentX * nextZoom,
        y: pointerY - rect.height / 2 - contentY * nextZoom,
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [previewPan, previewZoom]);

  const { cols, rows, safeCell } = useMemo(
    () => gridDimensions(widthMm, heightMm, cellSize),
    [widthMm, heightMm, cellSize]
  );

  const quantized = useMemo(() => {
    if (!sourceImageData) return null;
    return imageDataToColorPattern(sourceImageData, {
      cols,
      rows,
      emptyMode,
      threshold,
      invert,
      fit: fitMode,
      colorCount,
      backgroundColor,
      backgroundTolerance,
      minCoveragePercent,
    });
  }, [
    sourceImageData,
    cols,
    rows,
    emptyMode,
    threshold,
    invert,
    fitMode,
    colorCount,
    backgroundColor,
    backgroundTolerance,
    minCoveragePercent,
  ]);

  // Re-seed editable map whenever quantization inputs change.
  useEffect(() => {
    if (quantized) {
      setEditableColorMap(cloneColorMap(quantized.colorMap));
      setEditablePalette([...quantized.palette]);
      sourcePaletteRef.current = [...quantized.palette];
      setSelectedPaintIndex(null);
      setShowColorPicker(null);
      return;
    }
    setEditableColorMap(emptyColorMap(cols, rows));
    setEditablePalette([stitchColor]);
    sourcePaletteRef.current = [stitchColor];
    setSelectedPaintIndex(null);
    setShowColorPicker(null);
  }, [quantized, cols, rows]);

  // Keep the single fallback stitch color in sync when there is no uploaded image.
  useEffect(() => {
    if (sourceImageData) return;
    setEditablePalette((current) => {
      if (current.length === 1 && current[0] !== stitchColor) {
        return [stitchColor];
      }
      return current;
    });
  }, [stitchColor, sourceImageData]);

  const paletteUsage = useMemo(
    () => countPaletteUsage(editableColorMap, editablePalette.length),
    [editableColorMap, editablePalette.length]
  );

  const pattern = useMemo(
    () =>
      generateCrossStitch({
        widthMm,
        heightMm,
        cellSize,
        strokeWidth,
        gridWeight,
        fillPercent,
        showBorder,
        baseStrategy,
        canvasStyle,
        backboard,
        canvasShape,
        shapeOptions: { polygonSides, starPoints, heartFullness },
        colorMap: editableColorMap,
        palette: editablePalette,
        gridColor,
        stitchColor,
        borderColor: stitchColor,
      }),
    [
      widthMm,
      heightMm,
      cellSize,
      strokeWidth,
      gridWeight,
      fillPercent,
      showBorder,
      baseStrategy,
      canvasStyle,
      backboard,
      canvasShape,
      polygonSides,
      starPoints,
      heartFullness,
      editableColorMap,
      editablePalette,
      gridColor,
      stitchColor,
    ]
  );

  const applyCanvasPreset = (presetId: CanvasPresetId) => {
    setCanvasPreset(presetId);
    if (presetId === 'custom') return;
    const preset = CANVAS_PRESET_MAP[presetId];
    setCellSize(preset.cellMm);
    setGridWeight(preset.gridWeight);
    setStrokeWidth(preset.strokeWidth);
  };

  const applyBoardStyle = (styleId: BoardStyleId) => {
    setBoardStyle(styleId);
    if (styleId === 'custom') return;
    setBoardThicknessMm(BOARD_STYLE_MAP[styleId].thicknessMm);
  };

  const applyCanvasShape = (shape: CanvasShape) => {
    setCanvasShape(shape);
    if (shape === 'circle') {
      const side = Math.min(widthMm, heightMm);
      setWidthMm(side);
      setHeightMm(side);
      aspectRatioRef.current = 1;
      setLockAspect(true);
      setSizeTemplate('custom');
    }
  };

  const previewMarkup = useMemo(
    () => patternToSvgMarkup(pattern),
    [pattern]
  );

  const isStepCompleted = (step: Step) => step < currentStep;
  const isStepCurrent = (step: Step) => step === currentStep;
  const isStepDisabled = (step: Step) => step > currentStep;

  const goNext = useCallback(() => {
    setCurrentStep((s) => (s < 5 ? ((s + 1) as Step) : s));
  }, []);

  const goToStep = useCallback(
    (step: Step) => {
      if (step <= currentStep) setCurrentStep(step);
    },
    [currentStep]
  );

  const applyTemplate = (template: SizeTemplate) => {
    setSizeTemplate(template);
    const size = SIZE_TEMPLATES[template];
    setWidthMm(size.widthMm);
    setHeightMm(size.heightMm);
    aspectRatioRef.current = size.widthMm / size.heightMm;
    // Soft suggestion only — board style stays independently editable.
    if (template === 'bookmark' && boardStyle !== 'custom') {
      applyBoardStyle('bookmark');
    } else if (template === 'coaster' && boardStyle !== 'custom') {
      applyBoardStyle('rigid');
    }
  };

  const updateWidth = (nextWidth: number) => {
    const width = clampSize(nextWidth);
    setSizeTemplate('custom');
    if (!lockAspect) {
      setWidthMm(width);
      aspectRatioRef.current = width / Math.max(1, heightMm);
      return;
    }
    let height = clampSize(width / aspectRatioRef.current);
    let resolvedWidth = width;
    // If height hits a bound, re-solve width from the locked ratio.
    if (height === SIZE_MIN_MM || height === SIZE_MAX_MM) {
      resolvedWidth = clampSize(height * aspectRatioRef.current);
      height = clampSize(resolvedWidth / aspectRatioRef.current);
    }
    setWidthMm(resolvedWidth);
    setHeightMm(height);
  };

  const updateHeight = (nextHeight: number) => {
    const height = clampSize(nextHeight);
    setSizeTemplate('custom');
    if (!lockAspect) {
      setHeightMm(height);
      aspectRatioRef.current = widthMm / Math.max(1, height);
      return;
    }
    let width = clampSize(height * aspectRatioRef.current);
    let resolvedHeight = height;
    if (width === SIZE_MIN_MM || width === SIZE_MAX_MM) {
      resolvedHeight = clampSize(width / aspectRatioRef.current);
      width = clampSize(resolvedHeight * aspectRatioRef.current);
    }
    setWidthMm(width);
    setHeightMm(resolvedHeight);
  };

  const handleFile = async (file: File) => {
    const result = await guardImageUpload(file);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    if (result.wasResized) {
      toast.warning(
        formatResizeWarning(
          result.originalWidth,
          result.originalHeight,
          result.image.width,
          result.image.height
        ),
        { duration: 5000 }
      );
    }
    setSourceImageData(result.imageData);
    setPreviewUrl(result.previewDataUrl);
    setBackgroundColor(sampleCornerBackground(result.imageData));
    trackToolUsage('stitchprint-tool', 'pattern_upload');
  };

  const clearImage = () => {
    setSourceImageData(null);
    setPreviewUrl(null);
  };

  const resetPaletteToSource = () => {
    if (sourcePaletteRef.current.length === 0) return;
    if (quantized) {
      setEditableColorMap(cloneColorMap(quantized.colorMap));
      setEditablePalette([...quantized.palette]);
      sourcePaletteRef.current = [...quantized.palette];
    } else {
      setEditableColorMap(emptyColorMap(cols, rows));
      setEditablePalette([stitchColor]);
      sourcePaletteRef.current = [stitchColor];
    }
    setSelectedPaintIndex(null);
    setShowColorPicker(null);
  };

  const handlePaletteColorChange = (colorIndex: number, nextColor: string) => {
    if (!editableColorMap) return;
    const result = changePaletteColor(
      editableColorMap,
      editablePalette,
      colorIndex,
      nextColor
    );
    setEditableColorMap(result.colorMap);
    setEditablePalette(result.palette);
    if (result.mergedInto !== null) {
      setSelectedPaintIndex(result.mergedInto);
      setShowColorPicker(null);
      toast.message(t('spPaletteMerged'));
    }
  };

  const clientToCell = useCallback(
    (clientX: number, clientY: number): { row: number; col: number } | null => {
      const content = previewContentRef.current;
      if (!content) return null;
      const rect = content.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const mx = ((clientX - rect.left) / rect.width) * widthMm;
      const my = ((clientY - rect.top) / rect.height) * heightMm;
      const usedW = cols * safeCell;
      const usedH = rows * safeCell;
      const offsetX = (widthMm - usedW) / 2;
      const offsetY = (heightMm - usedH) / 2;
      const col = Math.floor((mx - offsetX) / safeCell);
      const row = Math.floor((my - offsetY) / safeCell);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
      return { row, col };
    },
    [widthMm, heightMm, cols, rows, safeCell]
  );

  const paintAtClient = useCallback(
    (clientX: number, clientY: number) => {
      if (selectedPaintIndex === null) return;
      const cell = clientToCell(clientX, clientY);
      if (!cell) return;
      setEditableColorMap((current) => {
        if (!current) return current;
        return paintCell(current, cell.row, cell.col, selectedPaintIndex) ?? current;
      });
    },
    [selectedPaintIndex, clientToCell]
  );

  const downloadTextFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    trackExport('stitchprint-tool', filename.split('.').pop() || 'file', blob.size);
  };

  const handleExportSvg = () => {
    if (pattern.polylines.length === 0) {
      toast.error(t('spExportNeedPattern'));
      return;
    }
    trackToolUsage('stitchprint-tool', 'export_svg');
    downloadTextFile(
      `stitchprint-${Math.round(widthMm)}x${Math.round(heightMm)}-${Date.now()}.svg`,
      patternToSvgDocument(pattern),
      'image/svg+xml;charset=utf-8'
    );
    toast.success(t('spExportSvgDone'));
  };

  const handleExportGcode = () => {
    const hasStitches = pattern.occupiedCount > 0;
    const hasGrid = pattern.polylines.some((p) => p.layer === 'grid');
    if (!hasStitches && !hasGrid && !pattern.polylines.some((p) => p.layer === 'border')) {
      toast.error(t('spExportNeedPattern'));
      return;
    }
    if (!hasStitches && baseStrategy !== 'print-grid') {
      toast.message(t('spExportNoStitches'));
    }
    trackToolUsage('stitchprint-tool', 'export_gcode');
    const withPause = baseStrategy === 'insert-mesh' && autoPause;
    const output = patternToGcode(
      { ...pattern, insertPauseBeforeStitch: withPause },
      { pauseCommand: 'M400 U1', boardThicknessMm }
    );
    downloadTextFile(
      `stitchprint-${Math.round(widthMm)}x${Math.round(heightMm)}-${Date.now()}.gcode`,
      output,
      'text/plain;charset=utf-8'
    );
    toast.success(t('spExportGcodeDone'));
  };

  const baseLabel =
    baseStrategy === 'pattern-only'
      ? t('spBasePatternOnly')
      : baseStrategy === 'insert-mesh'
        ? t('spBaseInsertMesh')
        : t('spBasePrintGrid');

  return (
    <ToolPageLayout
      title="stitchprintTool"
      description="stitchprintToolDesc"
      onBack={onBack}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          {/* Step 1: Size */}
          <Card className={isStepCompleted(1) ? 'border-accent/30' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(1) && <Check className="h-4 w-4 text-accent" aria-hidden />}
                <span className="flex-1">1. {t('spStepSize')}</span>
                {isStepCompleted(1) && !isStepCurrent(1) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => goToStep(1)}>
                    {t('edit')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            {isStepCurrent(1) && (
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">{t('spStep1Intro')}</p>

                {/* A · Outline shape (independent) */}
                <section className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                      A
                    </span>
                    <span className="text-sm font-medium">{t('spCanvasShape')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('spCanvasShapeHint')}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(
                      [
                        ['rect', 'spShapeRect'],
                        ['rounded-rect', 'spShapeRoundedRect'],
                        ['capsule', 'spShapeCapsule'],
                        ['circle', 'spShapeCircle'],
                        ['ellipse', 'spShapeEllipse'],
                        ['hexagon', 'spShapeHexagon'],
                        ['diamond', 'spShapeDiamond'],
                        ['heart', 'spShapeHeart'],
                        ['star', 'spShapeStar'],
                        ['polygon', 'spShapePolygon'],
                      ] as const
                    ).map(([value, labelKey]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={canvasShape === value ? 'default' : 'outline'}
                        aria-pressed={canvasShape === value}
                        onClick={() => applyCanvasShape(value)}
                      >
                        {t(labelKey)}
                      </Button>
                    ))}
                  </div>
                  {canvasShape === 'polygon' && (
                    <ParamSlider
                      id="sp-polygon-sides"
                      label={t('spPolygonSides')}
                      value={polygonSides}
                      min={3}
                      max={12}
                      step={1}
                      suffix=""
                      onChange={setPolygonSides}
                    />
                  )}
                  {canvasShape === 'star' && (
                    <ParamSlider
                      id="sp-star-points"
                      label={t('spStarPoints')}
                      value={starPoints}
                      min={4}
                      max={12}
                      step={1}
                      suffix=""
                      onChange={setStarPoints}
                    />
                  )}
                  {canvasShape === 'heart' && (
                    <ParamSlider
                      id="sp-heart-fullness"
                      label={t('spHeartFullness')}
                      value={heartFullness}
                      min={0.6}
                      max={1.4}
                      step={0.05}
                      suffix="×"
                      onChange={setHeartFullness}
                    />
                  )}
                </section>

                {/* B · Size (independent) */}
                <section className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                      B
                    </span>
                    <span className="text-sm font-medium">{t('spSizeTemplate')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['bookmark', 'spSizeBookmark'],
                        ['coaster', 'spSizeCoaster'],
                        ['custom', 'spSizeCustom'],
                      ] as const
                    ).map(([value, labelKey]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={sizeTemplate === value ? 'default' : 'outline'}
                        aria-pressed={sizeTemplate === value}
                        className="min-w-0 px-2 text-xs"
                        onClick={() => applyTemplate(value)}
                      >
                        {t(labelKey)}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="sp-lock-aspect">{t('spLockAspect')}</Label>
                      <p className="text-xs text-muted-foreground">{t('spLockAspectDesc')}</p>
                    </div>
                    <Button
                      id="sp-lock-aspect"
                      type="button"
                      size="sm"
                      variant={lockAspect ? 'default' : 'outline'}
                      aria-pressed={lockAspect}
                      aria-label={t('spLockAspect')}
                      onClick={() => {
                        setLockAspect((locked) => {
                          if (!locked) {
                            aspectRatioRef.current = widthMm / Math.max(1, heightMm);
                          }
                          return !locked;
                        });
                      }}
                    >
                      {lockAspect ? (
                        <Link2 className="h-4 w-4" aria-hidden />
                      ) : (
                        <Link2Off className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                  <ParamSlider
                    id="sp-width"
                    label={t('spWidth')}
                    value={widthMm}
                    min={SIZE_MIN_MM}
                    max={SIZE_MAX_MM}
                    step={1}
                    suffix="mm"
                    onChange={updateWidth}
                  />
                  <ParamSlider
                    id="sp-height"
                    label={t('spHeight')}
                    value={heightMm}
                    min={SIZE_MIN_MM}
                    max={SIZE_MAX_MM}
                    step={1}
                    suffix="mm"
                    onChange={updateHeight}
                  />
                </section>

                {/* C · Canvas gauge (independent) */}
                <section className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                      C
                    </span>
                    <span className="text-sm font-medium">{t('spCanvasPreset')}</span>
                  </div>
                  <select
                    id="sp-canvas-preset"
                    aria-label={t('spCanvasPreset')}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={canvasPreset}
                    onChange={(e) =>
                      applyCanvasPreset(e.target.value as CanvasPresetId)
                    }
                  >
                    <option value="custom">{t('spCanvasCustom')}</option>
                    <optgroup label={t('spCanvasAidaGroup')}>
                      {CANVAS_PRESETS.filter((p) => p.kind === 'aida').map((p) => (
                        <option key={p.id} value={p.id}>
                          {`Aida ${p.count}ct · ${p.cellMm}mm`}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t('spCanvasPlasticGroup')}>
                      {CANVAS_PRESETS.filter((p) => p.kind === 'plastic').map(
                        (p) => (
                          <option key={p.id} value={p.id}>
                            {`Plastic ${p.count}ct · ${p.cellMm}mm`}
                          </option>
                        )
                      )}
                    </optgroup>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {t('spCanvasPresetHint')}
                  </p>
                  <ParamSlider
                    id="sp-cell-size-early"
                    label={t('spCellSize')}
                    value={cellSize}
                    min={1}
                    max={10}
                    step={0.1}
                    suffix="mm"
                    onChange={(value) => {
                      setCellSize(value);
                      setCanvasPreset('custom');
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('spGridSummary')}: {cols}×{rows}
                  </p>
                </section>

                {/* D · Board thickness (independent) */}
                <section className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
                      D
                    </span>
                    <span className="text-sm font-medium">{t('spBoardStyle')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('spBoardStyleHint')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['rigid', 'spBoardRigid'],
                        ['bendable', 'spBoardBendable'],
                        ['bookmark', 'spBoardBookmark'],
                        ['custom', 'spBoardCustom'],
                      ] as const
                    ).map(([value, labelKey]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant={boardStyle === value ? 'default' : 'outline'}
                        aria-pressed={boardStyle === value}
                        onClick={() => applyBoardStyle(value)}
                      >
                        {t(labelKey)}
                      </Button>
                    ))}
                  </div>
                  <ParamSlider
                    id="sp-board-thickness"
                    label={t('spBoardThickness')}
                    value={boardThicknessMm}
                    min={BOARD_THICKNESS_MIN_MM}
                    max={BOARD_THICKNESS_MAX_MM}
                    step={0.1}
                    suffix="mm"
                    onChange={(value) => {
                      setBoardThicknessMm(value);
                      setBoardStyle('custom');
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('spBoardThicknessSummary')
                      .replace('{mm}', boardThicknessMm.toFixed(1))
                      .replace(
                        '{passes}',
                        String(boardPassesFromThickness(boardThicknessMm))
                      )}
                  </p>
                </section>

                <Button type="button" className="w-full" onClick={goNext}>
                  {t('next')}
                </Button>
              </CardContent>
            )}
            {isStepCompleted(1) && !isStepCurrent(1) && (
              <CardContent className="text-xs text-muted-foreground">
                {widthMm}×{heightMm} mm · {cols}×{rows} · {boardThicknessMm.toFixed(1)}
                mm
              </CardContent>
            )}
          </Card>

          {/* Step 2: Pattern upload */}
          <Card
            className={
              isStepDisabled(2) ? 'opacity-50' : isStepCompleted(2) ? 'border-accent/30' : ''
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(2) && <Check className="h-4 w-4 text-accent" aria-hidden />}
                <span className="flex-1">2. {t('spStepPattern')}</span>
                {isStepCompleted(2) && !isStepCurrent(2) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => goToStep(2)}>
                    {t('edit')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            {isStepCurrent(2) && (
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">{t('spUploadHint')}</p>
                {previewUrl ? (
                  <div className="space-y-2">
                    <img
                      src={previewUrl}
                      alt=""
                      className="w-full max-h-32 object-contain rounded border bg-muted/30"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t('spChangeImage')}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={clearImage}>
                        {t('spClearImage')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-24 flex flex-col gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5" aria-hidden />
                    {t('spUploadPattern')}
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) await handleFile(file);
                  }}
                />

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{t('spEmptyMode')}</legend>
                  <p className="text-xs text-muted-foreground">{t('spEmptyModeDesc')}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      size="sm"
                      variant={emptyMode === 'background' ? 'default' : 'outline'}
                      aria-pressed={emptyMode === 'background'}
                      onClick={() => setEmptyMode('background')}
                    >
                      {t('spEmptyBackground')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={emptyMode === 'transparent' ? 'default' : 'outline'}
                      aria-pressed={emptyMode === 'transparent'}
                      onClick={() => setEmptyMode('transparent')}
                    >
                      {t('spEmptyTransparent')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={emptyMode === 'luminance' ? 'default' : 'outline'}
                      aria-pressed={emptyMode === 'luminance'}
                      onClick={() => setEmptyMode('luminance')}
                    >
                      {t('spEmptyLuminance')}
                    </Button>
                  </div>
                </fieldset>
                {emptyMode === 'background' && (
                  <div className="space-y-4 rounded-lg border border-border/60 p-3">
                    <ColorField
                      id="sp-bg-color"
                      label={t('spBackgroundColor')}
                      value={backgroundColor}
                      onChange={setBackgroundColor}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!sourceImageData}
                      onClick={() => {
                        if (!sourceImageData) return;
                        setBackgroundColor(sampleCornerBackground(sourceImageData));
                      }}
                    >
                      {t('spSampleCorners')}
                    </Button>
                    <ParamSlider
                      id="sp-bg-tolerance"
                      label={t('spBackgroundTolerance')}
                      value={backgroundTolerance}
                      min={4}
                      max={40}
                      step={1}
                      suffix=""
                      onChange={setBackgroundTolerance}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('spBackgroundToleranceHint')}
                    </p>
                    <ParamSlider
                      id="sp-min-coverage"
                      label={t('spMinCoverage')}
                      value={minCoveragePercent}
                      min={5}
                      max={60}
                      step={1}
                      suffix="%"
                      onChange={setMinCoveragePercent}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('spMinCoverageHint')}
                    </p>
                  </div>
                )}
                {emptyMode === 'luminance' && (
                  <>
                    <ParamSlider
                      id="sp-threshold"
                      label={t('spThreshold')}
                      value={threshold}
                      min={0}
                      max={255}
                      step={1}
                      suffix=""
                      onChange={setThreshold}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="sp-invert">{t('spInvert')}</Label>
                      <Switch
                        id="sp-invert"
                        checked={invert}
                        onCheckedChange={setInvert}
                      />
                    </div>
                  </>
                )}
                <ParamSlider
                  id="sp-color-count"
                  label={t('spColorCount')}
                  value={colorCount}
                  min={1}
                  max={8}
                  step={1}
                  suffix=""
                  onChange={setColorCount}
                />
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{t('spFitMode')}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={fitMode === 'contain' ? 'default' : 'outline'}
                      aria-pressed={fitMode === 'contain'}
                      onClick={() => setFitMode('contain')}
                    >
                      {t('spFitContain')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={fitMode === 'cover' ? 'default' : 'outline'}
                      aria-pressed={fitMode === 'cover'}
                      onClick={() => setFitMode('cover')}
                    >
                      {t('spFitCover')}
                    </Button>
                  </div>
                </fieldset>
                <p className="text-xs text-muted-foreground">
                  {t('spOccupiedCells')}: {pattern.occupiedCount}
                </p>
                <Button type="button" className="w-full" onClick={goNext}>
                  {t('next')}
                </Button>
              </CardContent>
            )}
            {isStepCompleted(2) && !isStepCurrent(2) && (
              <CardContent className="text-xs text-muted-foreground">
                {sourceImageData
                  ? `${t('spOccupiedCells')}: ${pattern.occupiedCount}`
                  : t('spUploadHint')}
              </CardContent>
            )}
          </Card>

          {/* Step 3: Params & colors */}
          <Card
            className={
              isStepDisabled(3) ? 'opacity-50' : isStepCompleted(3) ? 'border-accent/30' : ''
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(3) && <Check className="h-4 w-4 text-accent" aria-hidden />}
                <span className="flex-1">3. {t('spStepAdjustParams')}</span>
                {isStepCompleted(3) && !isStepCurrent(3) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => goToStep(3)}>
                    {t('edit')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            {isStepCurrent(3) && (
              <CardContent className="space-y-5">
                <ParamSlider
                  id="sp-stroke"
                  label={t('spStrokeWidth')}
                  value={strokeWidth}
                  min={0.2}
                  max={1.2}
                  step={0.05}
                  suffix="mm"
                  onChange={setStrokeWidth}
                />
                <ParamSlider
                  id="sp-grid"
                  label={t('spGridWeight')}
                  value={gridWeight}
                  min={0.15}
                  max={0.8}
                  step={0.05}
                  suffix="mm"
                  onChange={setGridWeight}
                />
                <ParamSlider
                  id="sp-fill"
                  label={t('spFillPercent')}
                  value={fillPercent}
                  min={20}
                  max={100}
                  step={1}
                  suffix="%"
                  onChange={setFillPercent}
                />
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="sp-border">{t('spShowBorder')}</Label>
                  <Switch
                    id="sp-border"
                    checked={showBorder}
                    onCheckedChange={setShowBorder}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ColorField
                    id="sp-grid-color"
                    label={t('spGridColor')}
                    value={gridColor}
                    onChange={setGridColor}
                  />
                  {!sourceImageData && (
                    <ColorField
                      id="sp-stitch-color"
                      label={t('spStitchColor')}
                      value={stitchColor}
                      onChange={setStitchColor}
                    />
                  )}
                </div>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">
                    {t('spDetectedPalette')}
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    {t('spPaintHint')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {editablePalette.map((color, index) => {
                      const isSelected = selectedPaintIndex === index;
                      return (
                        <div
                          key={`palette-${index}-${color}`}
                          className={[
                            'relative rounded-lg border-2 p-2 transition-colors',
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted/30',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            className="flex w-full flex-col items-center gap-1.5"
                            aria-pressed={isSelected}
                            aria-label={`${t('spColor')} ${index + 1}`}
                            onClick={() =>
                              setSelectedPaintIndex((current) =>
                                current === index ? null : index
                              )
                            }
                          >
                            <span
                              className="relative h-10 w-10 rounded border border-border"
                              style={{ backgroundColor: color }}
                              aria-hidden
                            >
                              <span className="absolute inset-0 flex items-center justify-center rounded bg-black/30 opacity-0 hover:opacity-100">
                                <Pencil className="h-3.5 w-3.5 text-white" aria-hidden />
                              </span>
                            </span>
                            <span className="font-mono text-[10px] uppercase text-muted-foreground">
                              {rgbToHex(color)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {paletteUsage.counts[index] ?? 0} {t('spCells')}
                            </span>
                          </button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="absolute right-1 top-1 h-7 w-7"
                            aria-label={`${t('edit')} ${t('spColor')} ${index + 1}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedPaintIndex(index);
                              setShowColorPicker((current) =>
                                current === index ? null : index
                              );
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          {showColorPicker === index && (
                            <div
                              className="absolute left-0 top-full z-50 mt-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <CustomColorPicker
                                color={rgbToHex(color)}
                                onChange={(next) =>
                                  handlePaletteColorChange(index, next)
                                }
                                onClose={() => setShowColorPicker(null)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className={[
                      'w-fit rounded-lg border-2 p-2 transition-colors',
                      selectedPaintIndex === TRANSPARENT_STITCH_INDEX
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/30',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      className="flex flex-col items-center gap-1.5"
                      aria-pressed={selectedPaintIndex === TRANSPARENT_STITCH_INDEX}
                      aria-label={t('transparent')}
                      onClick={() =>
                        setSelectedPaintIndex((current) =>
                          current === TRANSPARENT_STITCH_INDEX
                            ? null
                            : TRANSPARENT_STITCH_INDEX
                        )
                      }
                    >
                      <span
                        className="h-10 w-10 rounded border border-border"
                        style={{
                          backgroundColor: '#fff',
                          backgroundImage: `
                            linear-gradient(45deg, #ccc 25%, transparent 25%),
                            linear-gradient(-45deg, #ccc 25%, transparent 25%),
                            linear-gradient(45deg, transparent 75%, #ccc 75%),
                            linear-gradient(-45deg, transparent 75%, #ccc 75%)
                          `,
                          backgroundSize: '8px 8px',
                          backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                        }}
                        aria-hidden
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {t('transparent')}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {paletteUsage.transparentCount} {t('spCells')}
                      </span>
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetPaletteToSource}
                  >
                    {t('spResetPalette')}
                  </Button>
                </fieldset>
                <Button type="button" className="w-full" onClick={goNext}>
                  {t('next')}
                </Button>
              </CardContent>
            )}
            {isStepCompleted(3) && !isStepCurrent(3) && (
              <CardContent className="text-xs text-muted-foreground flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm border"
                  style={{ backgroundColor: gridColor }}
                  aria-hidden
                />
                {(editablePalette.length > 0
                  ? editablePalette
                  : [stitchColor]
                ).map((color, index) => (
                  <span
                    key={`${color}-${index}`}
                    className="inline-block h-3 w-3 rounded-sm border"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                ))}
                <span>
                  {t('spStrokeWidth')}: {strokeWidth}mm
                </span>
              </CardContent>
            )}
          </Card>

          {/* Step 4: Structure */}
          <Card
            className={
              isStepDisabled(4) ? 'opacity-50' : isStepCompleted(4) ? 'border-accent/30' : ''
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(4) && <Check className="h-4 w-4 text-accent" aria-hidden />}
                <span className="flex-1">4. {t('spStepStructure')}</span>
                {isStepCompleted(4) && !isStepCurrent(4) && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => goToStep(4)}>
                    {t('edit')}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            {isStepCurrent(4) && (
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{t('spBaseStrategy')}</p>
                <ModeCard
                  title={t('spBasePatternOnly')}
                  desc={t('spBasePatternOnlyDesc')}
                  selected={baseStrategy === 'pattern-only'}
                  onSelect={() => setBaseStrategy('pattern-only')}
                />
                <ModeCard
                  title={t('spBasePrintGrid')}
                  desc={t('spBasePrintGridDesc')}
                  selected={baseStrategy === 'print-grid'}
                  onSelect={() => setBaseStrategy('print-grid')}
                />
                <ModeCard
                  title={t('spBaseInsertMesh')}
                  desc={t('spBaseInsertMeshDesc')}
                  selected={baseStrategy === 'insert-mesh'}
                  onSelect={() => {
                    setBaseStrategy('insert-mesh');
                    setAutoPause(true);
                  }}
                />
                {baseStrategy === 'print-grid' && (
                  <div className="space-y-4 rounded-lg border border-border/60 p-3">
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">
                        {t('spCanvasStyle')}
                      </legend>
                      <p className="text-xs text-muted-foreground">
                        {t('spCanvasStyleHint')}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={canvasStyle === 'square' ? 'default' : 'outline'}
                          aria-pressed={canvasStyle === 'square'}
                          onClick={() => setCanvasStyle('square')}
                        >
                          {t('spCanvasSquare')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={canvasStyle === 'rounded' ? 'default' : 'outline'}
                          aria-pressed={canvasStyle === 'rounded'}
                          onClick={() => setCanvasStyle('rounded')}
                        >
                          {t('spCanvasRounded')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={canvasStyle === 'diagonal' ? 'default' : 'outline'}
                          aria-pressed={canvasStyle === 'diagonal'}
                          onClick={() => setCanvasStyle('diagonal')}
                        >
                          {t('spCanvasDiagonal')}
                        </Button>
                      </div>
                    </fieldset>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">
                        {t('spBackboard')}
                      </legend>
                      <p className="text-xs text-muted-foreground">
                        {t('spBackboardHint')}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={backboard === 'none' ? 'default' : 'outline'}
                          aria-pressed={backboard === 'none'}
                          onClick={() => setBackboard('none')}
                        >
                          {t('spBackboardNone')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={backboard === 'solid' ? 'default' : 'outline'}
                          aria-pressed={backboard === 'solid'}
                          onClick={() => setBackboard('solid')}
                        >
                          {t('spBackboardSolid')}
                        </Button>
                      </div>
                    </fieldset>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3 pt-2">
                  <div className="space-y-1">
                    <Label htmlFor="sp-auto-pause">{t('spAutoPause')}</Label>
                    <p className="text-xs text-muted-foreground">{t('spAutoPauseDesc')}</p>
                  </div>
                  <Switch
                    id="sp-auto-pause"
                    checked={autoPause && baseStrategy === 'insert-mesh'}
                    disabled={baseStrategy !== 'insert-mesh'}
                    onCheckedChange={setAutoPause}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t('spMaterialPla')}</p>
                <Button type="button" className="w-full" onClick={goNext}>
                  {t('next')}
                </Button>
              </CardContent>
            )}
            {isStepCompleted(4) && !isStepCurrent(4) && (
              <CardContent className="text-sm text-muted-foreground">{baseLabel}</CardContent>
            )}
          </Card>

          {/* Step 5: Export */}
          <Card
            className={
              isStepDisabled(5) ? 'opacity-50' : isStepCompleted(5) ? 'border-accent/30' : ''
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {isStepCompleted(5) && <Check className="h-4 w-4 text-accent" aria-hidden />}
                <span>5. {t('spStepPreviewExport')}</span>
              </CardTitle>
            </CardHeader>
            {isStepCurrent(5) && (
              <CardContent className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleExportSvg}
                >
                  {t('spExportSvg')}
                </Button>
                <Button type="button" className="w-full" onClick={handleExportGcode}>
                  {t('spExportGcode')}
                </Button>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Live preview */}
        <Card className="min-h-[420px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">{t('spLivePreview')}</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t('zoomIn')}
                title={t('zoomIn')}
                onClick={() => setPreviewZoom((zoom) => Math.min(8, zoom * 1.2))}
              >
                <ZoomIn className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t('zoomOut')}
                title={t('zoomOut')}
                onClick={() => setPreviewZoom((zoom) => Math.max(0.25, zoom / 1.2))}
              >
                <ZoomOut className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t('fitToScreen')}
                title={t('fitToScreen')}
                onClick={resetPreviewView}
              >
                <Maximize2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            {selectedPaintIndex !== null && (
              <p className="text-xs text-muted-foreground">{t('spPaintHint')}</p>
            )}
            <div
              ref={previewContainerRef}
              className="relative flex-1 min-h-[320px] overflow-hidden rounded-lg border touch-none select-none"
              role="img"
              aria-label={t('spLivePreview')}
              onPointerDown={(event) => {
                if (event.button !== 0 && event.button !== 1) return;
                const shouldPan =
                  event.button === 1 ||
                  spacePressed ||
                  selectedPaintIndex === null;
                panMovedRef.current = false;
                previewPointerRef.current = { x: event.clientX, y: event.clientY };
                if (shouldPan) {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setIsPreviewPanning(true);
                  return;
                }
                event.currentTarget.setPointerCapture(event.pointerId);
                paintAtClient(event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (isPreviewPanning) {
                  const dx = event.clientX - previewPointerRef.current.x;
                  const dy = event.clientY - previewPointerRef.current.y;
                  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    panMovedRef.current = true;
                  }
                  previewPointerRef.current = { x: event.clientX, y: event.clientY };
                  setPreviewPan((pan) => ({ x: pan.x + dx, y: pan.y + dy }));
                  return;
                }
                if (
                  selectedPaintIndex !== null &&
                  !spacePressed &&
                  event.buttons === 1
                ) {
                  paintAtClient(event.clientX, event.clientY);
                }
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                setIsPreviewPanning(false);
              }}
              onPointerCancel={() => setIsPreviewPanning(false)}
              style={{
                cursor: isPreviewPanning
                  ? 'grabbing'
                  : selectedPaintIndex !== null && !spacePressed
                    ? 'crosshair'
                    : 'grab',
                backgroundImage: `
                  linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
                  linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
                  linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)
                `,
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                backgroundColor: '#f8fafc',
              }}
            >
              {pattern.polylines.length > 0 || editableColorMap ? (
                <div
                  className="absolute inset-4 flex items-center justify-center"
                  style={{
                    transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <div
                    ref={previewContentRef}
                    className="h-full w-full drop-shadow-sm [&_svg]:h-full [&_svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: previewMarkup }}
                  />
                </div>
              ) : (
                <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  {t('spPreviewPlaceholder')}
                </p>
              )}
              <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">
                {Math.round(previewZoom * 100)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {widthMm}×{heightMm} mm · {cols}×{rows} · {baseLabel}
              {pattern.occupiedCount > 0
                ? ` · ${t('spOccupiedCells')} ${pattern.occupiedCount}`
                : ''}
              {baseStrategy === 'insert-mesh' && autoPause
                ? ` · ${t('spAutoPause')}`
                : ''}
            </p>
          </CardContent>
        </Card>
      </div>
    </ToolPageLayout>
  );
};

StitchprintTool.displayName = 'StitchprintTool';

function ModeCard({
  title,
  desc,
  selected,
  onSelect,
}: {
  title: string;
  desc: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={[
        'w-full text-left rounded-lg border p-3 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
      ].join(' ')}
    >
      <span className="text-sm font-medium">{title}</span>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </button>
  );
}

function ParamSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm text-muted-foreground tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(values) => onChange(values[0])}
      />
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
          aria-label={label}
        />
        <span className="text-xs text-muted-foreground font-mono uppercase">{value}</span>
      </div>
    </div>
  );
}
