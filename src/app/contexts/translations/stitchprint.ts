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
    zh: '可先用尺寸模板快速帶入常見成品；外框形狀與尺寸再細調。格距與板材厚度分開設定',
    en: 'Optionally start from a size template, then refine the outline shape and dimensions. Grid pitch and board thickness stay independent',
  },
  spShapeAndSize: { zh: '成品形狀與尺寸', en: 'Shape & dimensions' },
  spCanvasShape: { zh: '外框形狀', en: 'Outline shape' },
  spCanvasShapeHint: {
    zh: '選擇幾何外框；膠囊接近正方形時會自動拉成長條，以免跟圓混淆',
    en: 'Pick a geometric outline; capsule auto-elongates when nearly square so it does not look like a circle',
  },
  spShapeRect: { zh: '方形', en: 'Rect' },
  spShapeRoundedRect: { zh: '圓角方', en: 'Round rect' },
  spShapeCapsule: { zh: '膠囊形', en: 'Capsule' },
  spShapeCircle: { zh: '圓形', en: 'Circle' },
  spShapeEllipse: { zh: '橢圓', en: 'Ellipse' },
  spShapeHexagon: { zh: '六邊形', en: 'Hexagon' },
  spShapeDiamond: { zh: '菱形', en: 'Diamond' },
  spShapeHeart: { zh: '心形', en: 'Heart' },
  spShapeStar: { zh: '星形', en: 'Star' },
  spShapePolygon: { zh: '多邊形', en: 'Polygon' },
  spDiameter: { zh: '直徑', en: 'Diameter' },
  spPolygonSides: { zh: '邊數', en: 'Sides' },
  spPolygonSidesHint: {
    zh: '控制正多邊形的邊／頂點數量',
    en: 'Controls the number of sides and vertices',
  },
  spStarPoints: { zh: '星芒數', en: 'Points' },
  spStarInnerRadius: { zh: '星形內徑比例', en: 'Star inner radius' },
  spStarInnerRadiusHint: {
    zh: '內徑相對外徑的比例；越小星芒越尖長，越大越接近多邊形',
    en: 'Inner-to-outer radius ratio; lower makes longer sharp points, higher approaches a polygon',
  },
  spShapeCornerRadius: { zh: '角圓角', en: 'Corner radius' },
  spShapeCornerRadiusHint: {
    zh: '將尖角向內收並圓滑；數值過大時會依最短邊自動限制',
    en: 'Rounds sharp corners inward; automatically limited by the shortest adjacent edge',
  },
  spHeartFullness: { zh: '瓣部飽滿度', en: 'Lobe fullness' },
  spHeartFullnessHint: {
    zh: '越低越纖細，越高兩側與上方心瓣越飽滿',
    en: 'Lower is slimmer; higher makes the sides and upper lobes fuller',
  },
  spHeartNotchDepth: { zh: '中央凹口深度', en: 'Notch depth' },
  spHeartNotchDepthHint: {
    zh: '控制愛心上方中央凹口的深淺',
    en: 'Controls the depth of the top-center cleft',
  },
  spHeartTipRoundness: { zh: '底部尖端圓潤度', en: 'Tip roundness' },
  spHeartTipRoundnessHint: {
    zh: '0% 為尖底，增加後底部會逐漸圓潤',
    en: '0% keeps a sharp tip; increasing it progressively rounds the bottom',
  },
  spCanvasPreset: { zh: '畫布規格', en: 'Canvas gauge' },
  spCanvasPresetHint: {
    zh: '套用市售繡布／塑膠畫布的格距與建議骨架寬；孔洞大小＝格距−骨架寬，兩者都可再手動微調',
    en: 'Match off-the-shelf Aida / plastic canvas pitch & bar width; hole size = pitch − bar, both stay adjustable',
  },
  spHoleSizeSummary: {
    zh: '孔洞大小約 {mm}mm（＝格距−骨架寬）',
    en: 'Hole size ≈ {mm}mm (= pitch − bar width)',
  },
  spCanvasCustom: { zh: '自訂格距', en: 'Custom pitch' },
  spCanvasAidaGroup: { zh: 'Aida 繡布', en: 'Aida fabric' },
  spCanvasPlasticGroup: { zh: '塑膠畫布（格距）', en: 'Plastic canvas (pitch)' },
  spBoardStyle: { zh: '板材樣式／厚度', en: 'Board style / thickness' },
  spBoardStyleHint: {
    zh: '與格距獨立：硬塑膠板較厚不易彎；塑膠畫布較薄可彎；再薄可當書簽。選樣式帶建議厚度，仍可用滑桿微調',
    en: 'Independent of pitch: rigid board is thick; plastic canvas is thinner and can bend; thinner still works as a bookmark. Presets set a suggested thickness you can fine-tune',
  },
  spBoardRigid: { zh: '硬塑膠板', en: 'Rigid' },
  spBoardBendable: { zh: '可彎畫布', en: 'Bendable' },
  spBoardBookmark: { zh: '書簽薄片', en: 'Bookmark' },
  spBoardCustom: { zh: '自訂厚度', en: 'Custom' },
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
  spHoleShapePrintGridHint: {
    zh: '選擇「列印方眼底」時，孔洞形狀才會出現在成品與預覽中',
    en: 'Hole shape appears in the preview and output when Print grid base is selected',
  },
  spCanvasSquare: { zh: '方孔', en: 'Square' },
  spCanvasRounded: { zh: '圓孔', en: 'Round' },
  spCanvasDiagonal: { zh: '斜向織紋', en: 'Diagonal' },
  spBackboard: { zh: '背板', en: 'Backboard' },
  spBackboardHint: {
    zh: '簍空＝只印骨架省料；實心背板＝印整片底更像實體布',
    en: 'Open = print lattice only (saves material); Solid = full back panel, most fabric-like',
  },
  spBackboardNone: { zh: '簍空', en: 'Open' },
  spBackboardSolid: { zh: '實心背板', en: 'Solid' },
  spSizeTemplate: { zh: '尺寸模板', en: 'Size template' },
  spSizeTemplateHint: {
    zh: '常見成品快捷：書簽會帶入膠囊形與長條尺寸；杯墊會帶入圓形與直徑。之後仍可在下方改形狀',
    en: 'Product shortcuts: Bookmark loads a capsule + tall size; Coaster loads a circle + diameter. You can still change the outline below',
  },
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
  spEdgeMargin: { zh: '孔洞邊距', en: 'Hole edge margin' },
  spEdgeMarginHint: {
    zh: '控制孔洞到外輪廓的最短距離；靠邊放不下完整孔洞時會保留為實心邊框',
    en: 'Minimum distance from holes to the silhouette; edge cells that cannot fit a complete hole become a solid rim',
  },
  spEdgeMarginShapeHint: {
    zh: '非矩形不加實心邊框；邊緣孔洞會裁成半孔，緊貼剪影',
    en: 'Non-rectangular shapes skip the solid rim; edge holes clip to half-holes that hug the silhouette',
  },
  spFillPercent: { zh: 'X 填滿度', en: 'X fill' },
  spFillPercentHint: {
    zh: '十字繡從孔心連到孔心；降低填滿度會沿同軸向內縮短，仍以方眼中心為錨點',
    en: 'Crosses run hole-center to hole-center; lowering fill shortens along that axis while staying hole-anchored',
  },
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
