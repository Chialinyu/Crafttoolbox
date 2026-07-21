/**
 * Stitchprint tool translations
 */
export const stitchprintTranslations = {
  stitchprintTool: { zh: '繡紋列印', en: 'Stitchprint' },
  stitchprintToolDesc: {
    zh: '上傳圖案轉十字繡：方眼底 + 有圖處才打 X，可列印或夾紗暫停',
    en: 'Upload art to cross-stitch: grid base + X only on pattern cells; print or pause for mesh',
  },

  // Steps
  spStepSize: { zh: '尺寸', en: 'Size' },
  spStepPattern: { zh: '圖案', en: 'Pattern' },
  spStepAdjustParams: { zh: '參數與顏色', en: 'Params & Colors' },
  spStepStructure: { zh: '結構／分層', en: 'Structure / Layers' },
  spStepPreviewExport: { zh: '預覽與匯出', en: 'Preview & Export' },

  // Modes (kept for future)
  spModeCrossStitch: { zh: '方眼十字繡', en: 'Grid Cross-Stitch' },
  spComingSoon: { zh: '即將開放', en: 'Coming soon' },

  // Size
  spWidth: { zh: '寬度', en: 'Width' },
  spHeight: { zh: '高度', en: 'Height' },
  spLockAspect: { zh: '等比例縮放', en: 'Lock aspect ratio' },
  spLockAspectDesc: {
    zh: '開啟後調整寬或高，另一邊會等比跟著變',
    en: 'When locked, changing width or height scales the other side',
  },
  spStep1Intro: {
    zh: '以下 A／B／C／D 為四項獨立設定，可自由搭配：A 外框、B 尺寸、C 格距、D 板材厚度（硬／可彎／書簽薄）',
    en: 'A / B / C / D below are independent: A outline, B size, C grid pitch, D board thickness (rigid / bendable / bookmark-thin)',
  },
  spCanvasShape: { zh: '外框形狀', en: 'Outline shape' },
  spCanvasShapeHint: {
    zh: '格線超出形狀的部分會自動裁掉；圓形會自動鎖成正方形外框',
    en: 'Grid past the silhouette is clipped away; Circle locks a square bounding box',
  },
  spShapeRect: { zh: '方形', en: 'Rectangle' },
  spShapeRoundedRect: { zh: '圓角方', en: 'Rounded rect' },
  spShapeCapsule: { zh: '膠囊形', en: 'Capsule' },
  spShapeCircle: { zh: '圓形', en: 'Circle' },
  spShapeEllipse: { zh: '橢圓', en: 'Ellipse' },
  spShapeHexagon: { zh: '六邊形', en: 'Hexagon' },
  spShapeDiamond: { zh: '菱形', en: 'Diamond' },
  spShapeHeart: { zh: '心形', en: 'Heart' },
  spShapeStar: { zh: '星形', en: 'Star' },
  spShapePolygon: { zh: '多邊形', en: 'Polygon' },
  spPolygonSides: { zh: '邊數', en: 'Sides' },
  spStarPoints: { zh: '星芒數', en: 'Points' },
  spHeartFullness: { zh: '心形飽滿度', en: 'Heart fullness' },
  spCanvasPreset: { zh: '畫布規格', en: 'Canvas gauge' },
  spCanvasPresetHint: {
    zh: '套用市售繡布／塑膠畫布的格距與建議線寬；自訂則用下方滑桿',
    en: 'Match off-the-shelf Aida / plastic canvas pitch & suggested weights; Custom uses the slider',
  },
  spCanvasCustom: { zh: '自訂格距', en: 'Custom pitch' },
  spCanvasAidaGroup: { zh: 'Aida 繡布', en: 'Aida fabric' },
  spCanvasPlasticGroup: { zh: '塑膠畫布（格距）', en: 'Plastic canvas (pitch)' },
  spBoardStyle: { zh: '板材樣式／厚度', en: 'Board style / thickness' },
  spBoardStyleHint: {
    zh: '與格距獨立：硬塑膠板較厚不易彎；塑膠畫布較薄可彎；再薄可當書簽。選樣式帶建議厚度，仍可用滑桿微調',
    en: 'Independent of pitch: rigid board is thick; plastic canvas is thinner and can bend; thinner still works as a bookmark. Presets set a suggested thickness you can fine-tune',
  },
  spBoardRigid: { zh: '硬塑膠板', en: 'Rigid board' },
  spBoardBendable: { zh: '可彎塑膠畫布', en: 'Bendable canvas' },
  spBoardBookmark: { zh: '書簽薄片', en: 'Bookmark sheet' },
  spBoardCustom: { zh: '自訂厚度', en: 'Custom thickness' },
  spBoardThickness: { zh: '印刷厚度', en: 'Print thickness' },
  spBoardThicknessSummary: {
    zh: '約 {mm}mm · 基層約 {passes} 層（影響 G-code 堆疊，預覽仍是平面）',
    en: '~{mm}mm · ~{passes} base passes in G-code (preview stays flat)',
  },
  spCanvasStyle: { zh: '孔洞形狀（方眼骨架）', en: 'Hole shape (lattice)' },
  spCanvasStyleHint: {
    zh: '決定方眼「孔」的樣子：直角方孔／圓孔（圓角）／斜向織紋',
    en: 'Shape of each grid hole: square / round (filleted) / woven diagonal',
  },
  spCanvasSquare: { zh: '方孔', en: 'Square holes' },
  spCanvasRounded: { zh: '圓孔', en: 'Round holes' },
  spCanvasDiagonal: { zh: '斜向織紋', en: 'Diagonal' },
  spBackboard: { zh: '背板', en: 'Backboard' },
  spBackboardHint: {
    zh: '簍空＝只印骨架省料；實心背板＝印整片底更像實體布',
    en: 'Open = print lattice only (saves material); Solid = full back panel, most fabric-like',
  },
  spBackboardNone: { zh: '簍空（鏤空）', en: 'Open (hollow)' },
  spBackboardSolid: { zh: '實心背板', en: 'Solid panel' },
  spSizeTemplate: { zh: '尺寸模板', en: 'Size template' },
  spSizeBookmark: { zh: '書簽', en: 'Bookmark' },
  spSizeCoaster: { zh: '杯墊', en: 'Coaster' },
  spSizeCustom: { zh: '自訂', en: 'Custom' },
  spGridSummary: { zh: '格數', en: 'Grid' },

  // Pattern upload
  spUploadPattern: { zh: '上傳圖案', en: 'Upload pattern' },
  spUploadHint: {
    zh: '白色也是繡線色；透明格不繡。可選色後在預覽點格編輯',
    en: 'White is a stitch color; transparent cells stay empty. Select a swatch and paint cells in the preview',
  },
  spChangeImage: { zh: '更換圖片', en: 'Change image' },
  spClearImage: { zh: '清除圖案', en: 'Clear pattern' },
  spEmptyMode: { zh: '空白判定', en: 'Empty cells' },
  spEmptyModeDesc: {
    zh: '紙底／掃描圖建議用「對齊紙色」：用色差挖底，細紙條也留得住',
    en: 'For paper scans use Match paper color: Lab punch keeps thin strip details',
  },
  spEmptyBackground: { zh: '對齊紙色', en: 'Match paper' },
  spEmptyTransparent: { zh: '透明＝空白', en: 'Transparent = empty' },
  spEmptyLuminance: { zh: '亮度挖空', en: 'Luminance punch' },
  spBackgroundColor: { zh: '紙／底色', en: 'Paper / background' },
  spSampleCorners: { zh: '從四角自動取樣', en: 'Sample from corners' },
  spBackgroundTolerance: { zh: '色差容差 ΔE', en: 'Color tolerance ΔE' },
  spBackgroundToleranceHint: {
    zh: '愈小愈嚴格（細線保留多）；紙色不均勻可略調大',
    en: 'Lower keeps more thin lines; raise if the paper tone is uneven',
  },
  spMinCoverage: { zh: '細節覆蓋門檻', en: 'Detail coverage' },
  spMinCoverageHint: {
    zh: '格內前景像素占比低於此值就當空白。細紙條可降到 8–15%',
    en: 'Cells below this foreground % stay empty. Try 8–15% for thin paper strips',
  },
  spThreshold: { zh: '亮度門檻', en: 'Brightness threshold' },
  spColorCount: { zh: '圖案顏色數', en: 'Pattern colors' },
  spInvert: { zh: '反相', en: 'Invert' },
  spFitContain: { zh: '完整放入', en: 'Contain' },
  spFitCover: { zh: '填滿裁切', en: 'Cover' },
  spFitMode: { zh: '對齊', en: 'Fit' },
  spOccupiedCells: { zh: '繡格數', en: 'Stitch cells' },
  spCells: { zh: '格', en: 'cells' },
  spPaintHint: {
    zh: '選色後點／拖預覽格子上色；選透明可挖空。空白＝不繡。空白鍵+拖曳可平移',
    en: 'Select a color, then click/drag cells to paint. Transparent erases stitches. Hold Space to pan',
  },
  spPaletteMerged: {
    zh: '已合併相同顏色的色段',
    en: 'Matching color segments were merged',
  },

  // Structure
  spBaseStrategy: { zh: '底層策略', en: 'Base Strategy' },
  spBasePatternOnly: { zh: '只印圖樣', en: 'Pattern only' },
  spBasePatternOnlyDesc: {
    zh: '只印有圖案的 X（不印方眼）',
    en: 'Print only pattern X stitches (no grid)',
  },
  spBasePrintGrid: { zh: '列印方眼底 + 圖樣', en: 'Print grid base + pattern' },
  spBasePrintGridDesc: {
    zh: '底層只有方眼網格，上層才是圖案 X',
    en: 'Grid mesh on the bottom layer; X stitches on top',
  },
  spBaseInsertMesh: { zh: '夾紗 + 圖樣', en: 'Insert mesh + pattern' },
  spBaseInsertMeshDesc: {
    zh: '不印方眼，改為暫停夾入實體網布後再印 X',
    en: 'Skip printed grid; pause to insert real mesh, then print X',
  },

  // Params
  spCellSize: { zh: '單元大小', en: 'Cell size' },
  spStrokeWidth: { zh: '繡線寬', en: 'Stitch width' },
  spGridWeight: { zh: '方眼粗細', en: 'Grid weight' },
  spFillPercent: { zh: 'X 填滿度', en: 'X fill' },
  spShowBorder: { zh: '外框', en: 'Border' },
  spGridColor: { zh: '方眼顏色', en: 'Grid color' },
  spStitchColor: { zh: '繡線顏色', en: 'Stitch color' },
  spDetectedPalette: { zh: '圖案色票', en: 'Pattern palette' },
  spColor: { zh: '顏色', en: 'Color' },
  spResetPalette: { zh: '還原原圖色票', en: 'Reset source palette' },

  // Print settings
  spAutoPause: { zh: '自動插入暫停', en: 'Auto-insert pause' },
  spAutoPauseDesc: {
    zh: '夾紗模式時在 G-code 寫入暫停（如 M400 U1）',
    en: 'When inserting mesh, write a pause into G-code (e.g. M400 U1)',
  },
  spMaterialHint: { zh: '建議耗材', en: 'Suggested material' },
  spMaterialPla: { zh: 'PLA（薄片／書簽）', en: 'PLA (sheet / bookmark)' },

  // Preview / export
  spLivePreview: { zh: '即時預覽', en: 'Live preview' },
  spPreviewPlaceholder: {
    zh: '調整尺寸後會顯示方眼；上傳圖案後才會出現 X',
    en: 'Grid appears with size; X stitches appear after you upload a pattern',
  },
  spExportSvg: { zh: '匯出 SVG 預覽', en: 'Export SVG preview' },
  spExportGcode: { zh: '匯出 G-code', en: 'Export G-code' },
  spExportSvgDone: { zh: '已下載 SVG', en: 'SVG downloaded' },
  spExportGcodeDone: { zh: '已下載 G-code', en: 'G-code downloaded' },
  spExportNeedPattern: {
    zh: '沒有可匯出的路徑',
    en: 'Nothing to export yet',
  },
  spExportNoStitches: {
    zh: '目前沒有繡格（請上傳圖案、改空白判定，或手動上色）',
    en: 'No stitch cells yet — upload a pattern, change empty mode, or paint cells',
  },
};
