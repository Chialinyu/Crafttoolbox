export type {
  PatternMode,
  BaseStrategy,
  SizeTemplate,
  PatternResult,
  CrossStitchParams,
  OccupancyMask,
  StitchColorMap,
  QuantizedStitchPattern,
  ImageFitMode,
  EmptyCellMode,
  CanvasStyle,
  Backboard,
  CanvasShape,
  ShapeOptions,
} from './types';
export {
  SIZE_TEMPLATES,
  CANVAS_PRESETS,
  CANVAS_PRESET_MAP,
  BOARD_STYLES,
  BOARD_STYLE_MAP,
  BOARD_THICKNESS_MIN_MM,
  BOARD_THICKNESS_MAX_MM,
  boardPassesFromThickness,
  type CanvasPreset,
  type CanvasPresetId,
  type BoardStyle,
  type BoardStyleId,
} from './constants';
export { generateCrossStitch, layerStrokeWidth, layerColor } from './crossStitch';
export { patternToSvgDocument, patternToSvgMarkup } from './exportSvg';
export { patternToGcode } from './exportGcode';
export {
  imageDataToStitchMask,
  imageDataToColorPattern,
  emptyOccupancy,
  countOccupied,
  gridDimensions,
  sampleCornerBackground,
} from './imageToStitchMask';
export {
  TRANSPARENT_STITCH_INDEX,
  changePaletteColor,
  cloneColorMap,
  countPaletteUsage,
  emptyColorMap,
  normalizeHexColor,
  paintCell,
} from './paletteOperations';
export {
  canvasShapeOutline,
  cellInCanvasShape,
  pointInCanvasShape,
  pointInPolygon,
  clipSegmentToPolygon,
  DEFAULT_SHAPE_OPTIONS,
} from './canvasShape';
