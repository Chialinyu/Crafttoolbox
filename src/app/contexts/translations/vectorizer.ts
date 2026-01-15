/**
 * Image Vectorizer tool translations
 */
export const vectorizerTranslations = {
  // Tool info
  vectorizerTool: { zh: '圖片向量化', en: 'Image Vectorizer' },
  vectorizerToolDesc: { zh: '上傳圖片轉換為可編輯的 SVG 向量格式，支援描線、填色和混合模式', en: 'Upload images and convert to editable SVG vectors with stroke, fill, and mixed modes' },
  
  // Steps
  stepUploadImage: { zh: '上傳圖片', en: 'Upload Image' },
  stepSelectMode: { zh: '選擇模式', en: 'Select Mode' },
  stepAdjustParams: { zh: '調整參數', en: 'Adjust Parameters' },
  stepGenerateVectors: { zh: '生成向量', en: 'Generate Vectors' },
  stepEditVectors: { zh: '編輯向量', en: 'Edit Vectors' },
  stepExport: { zh: '輸出檔案', en: 'Export File' },
  
  // Mode Selection
  modeLineTitle: { zh: '線條模式', en: 'Line Mode' },
  modeLineDesc: { zh: '單色黑白線條向量化', en: 'Single-color black and white line vectorization' },
  modeLineUseCase: { zh: '適合：手繪稿、Logo、文字', en: 'Best for: Sketches, logos, text' },
  
  modeFillTitle: { zh: '填充模式', en: 'Fill Mode' },
  modeFillDesc: { zh: '多色封閉區塊向量化', en: 'Multi-color filled region vectorization' },
  modeFillUseCase: { zh: '適合：插畫、平面設計、剪影', en: 'Best for: Illustrations, flat designs, silhouettes' },
  
  modeMixedTitle: { zh: '混合模式', en: 'Mixed Mode' },
  modeMixedDesc: { zh: '線條與填充結合', en: 'Combination of lines and fills' },
  modeMixedUseCase: { zh: '適合：漫畫、複雜插圖', en: 'Best for: Comics, complex illustrations' },
  
  selected: { zh: '已選', en: 'Selected' },
  currentMode: { zh: '當前模式', en: 'Current Mode' },
  clickToChange: { zh: '點擊更改', en: 'Click to change' },
  
  // Image Processing
  preprocessing: { zh: '圖像預處理', en: 'Preprocessing' },
  blurRadius: { zh: '模糊半徑', en: 'Blur Radius' },
  threshold: { zh: '閾值', en: 'Threshold' },
  autoThreshold: { zh: '自動閾值', en: 'Auto Threshold' },
  applyThreshold: { zh: '應用閾值', en: 'Apply Threshold' },
  detectEdges: { zh: '邊緣檢測', en: 'Edge Detection' },
  edgeStrength: { zh: '邊緣強度', en: 'Edge Strength' },
  
  // Color Segmentation (Fill mode)
  colorSegmentation: { zh: '顏色分群', en: 'Color Segmentation' },
  numColors: { zh: '顏色數量', en: 'Number of Colors' },
  colorCount: { zh: '顏色數量', en: 'Color Count' },
  colorPalette: { zh: '調色盤', en: 'Color Palette' },
  editColors: { zh: '編輯顏色', en: 'Edit Colors' },
  
  // Vectorization
  vectorization: { zh: '向量化', en: 'Vectorization' },
  pathPrecision: { zh: '路徑精度', en: 'Path Precision' },
  simplifyPath: { zh: '簡��路徑', en: 'Simplify Path' },
  minArea: { zh: '最小區域', en: 'Minimum Area' },
  generateVectors: { zh: '生成向量', en: 'Generate Vectors' },
  vectorizing: { zh: '向量化中...', en: 'Vectorizing...' },
  confirmGenerate: { zh: '儲存並繼續', en: 'Save & Next' },
  
  // Summary
  imageSize: { zh: '圖片尺寸', en: 'Image Size' },
  pathsGenerated: { zh: '個向量路徑', en: 'vector paths' },
  
  // Node Editor
  nodeEditor: { zh: '節點編輯', en: 'Node Editor' },
  showNodes: { zh: '顯示節點', en: 'Show Nodes' },
  showControlPoints: { zh: '顯示控制點', en: 'Show Control Points' },
  showOriginalImage: { zh: '顯示原圖', en: 'Show Original Image' },
  imageOpacity: { zh: '原圖不透明度', en: 'Image Opacity' },
  deleteNode: { zh: '刪除節點', en: 'Delete Node' },
  addNode: { zh: '添加節點', en: 'Add Node' },
  nodeType: { zh: '節點類型', en: 'Node Type' },
  cornerNode: { zh: '尖角', en: 'Corner' },
  smoothNode: { zh: '平滑', en: 'Smooth' },
  asymmetricNode: { zh: '非對稱', en: 'Asymmetric' },
  selectedNodes: { zh: '已選節點', en: 'Selected Nodes' },
  
  // Canvas Controls  
  snapToGrid: { zh: '對齊網格', en: 'Snap to Grid' },
  zoomIn: { en: 'Zoom In', zh: '放大' },
  zoomOut: { en: 'Zoom Out', zh: '縮小' },
  fitToScreen: { en: 'Fit to Screen', zh: '符合螢幕' },
  noImageUploaded: { en: 'No image uploaded', zh: '尚未上傳圖片' },
  processing: { en: 'Processing', zh: '處理中' },
  pleaseWait: { en: 'Please wait...', zh: '請稍候...' },
  
  // Export
  exportSVG: { zh: '導出 SVG', en: 'Export SVG' },
  downloadSVG: { zh: '下載 SVG', en: 'Download SVG' },
  optimizePaths: { zh: '優化路徑', en: 'Optimize Paths' },
  svgQuality: { zh: 'SVG 品質', en: 'SVG Quality' },
  copySVG: { zh: '複製 SVG', en: 'Copy SVG' },
  copiedToClipboard: { zh: 'SVG 已複製到剪貼簿！', en: 'SVG copied to clipboard!' },
  copyFailed: { zh: '複製失敗', en: 'Failed to copy SVG' },
  
  // Actions
  upload: { zh: '上傳', en: 'Upload' },
  confirm: { zh: '確認', en: 'Confirm' },
  confirmMode: { zh: '下一步', en: 'Next' },
  cancel: { zh: '取消', en: 'Cancel' },
  edit: { zh: '編輯', en: 'Edit' },
  save: { zh: '儲存', en: 'Save' },
  export: { zh: '匯出', en: 'Export' },
  reset: { zh: '重設', en: 'Reset' },
  
  // Instructions
  ctrlClickToAdd: { zh: 'Ctrl+點擊添加節點', en: 'Ctrl+Click to add node' },
  completeStepFirst: { zh: '請先完成上一步', en: 'Please complete the previous step first' },
  
  // Color Palette
  colorGroups: { zh: '顏色群組', en: 'Color Groups' },
  hoverToPreview: { zh: '滑鼠移到色票上可預覽，點擊鎖定高亮', en: 'Hover to preview, click to lock highlight' },
  mergeColors: { zh: '合併', en: 'Merge' },
  ctrlClickToSelect: { zh: '點擊色票選取，選取 2 個以上即可合併', en: 'Click swatches to select, select 2+ to merge' },
  mergeInstruction: { zh: '💡 如何合併：點擊想合併的色票（至少 2 個），然後點擊「合併」按鈕', en: '💡 How to merge: Click swatches to select (2+), then click Merge button' },
  selectedColors: { zh: '已選', en: 'Selected' },
  clickMergeButton: { zh: '點擊上方「合併」按鈕', en: 'Click Merge button above' },
  selectMore: { zh: '再選至少 1 個即可合併', en: 'Select 1+ more to merge' },
  
  // Parameter descriptions
  reduceNoiseDesc: { zh: '減少雜訊並平滑細節', en: 'Reduce noise and smooth details' },
  autoThresholdDesc: { zh: '自動計算最佳閾值', en: 'Automatically calculate optimal threshold' },
  separateFgBgDesc: { zh: '分離前景與背景', en: 'Separate foreground from background' },
  colorClustersDesc: { zh: '向量化的顏色分群數量', en: 'Number of color clusters for vectorization' },
  vectorEditInProgress: { zh: '向量節點編輯功能開發中...', en: 'Vector node editing feature in development...' },
  
  // Bezier Curves
  useBezierCurves: { zh: '使用貝茲曲線', en: 'Use Bezier Curves' },
  useBezierCurvesDesc: { zh: '啟用平滑的貝茲曲線路徑', en: 'Enable smooth bezier curve paths' },
  bezierAlgorithm: { zh: '曲線算法', en: 'Curve Algorithm' },
  bezierAlgorithmDesc: { zh: 'Custom：自適應曲率算法 | Potrace：行業標準算法', en: 'Custom: Adaptive curvature | Potrace: Industry standard' },
  bezierCustom: { zh: '自定義', en: 'Custom' },
  bezierPotrace: { zh: 'Potrace', en: 'Potrace' },
  
  // Path Layer Panel
  vectorLayers: { zh: '向量圖層', en: 'Vector Layers' },
  collapseAll: { zh: '全部收起', en: 'Collapse All' },
  expandAll: { zh: '全部展開', en: 'Expand All' },
  showAllInGroup: { zh: '顯示整組', en: 'Show All in Group' },
  hideAllInGroup: { zh: '隱藏整組', en: 'Hide All in Group' },
  paths: { zh: '路徑', en: 'paths' },
  visible: { zh: '顯示', en: 'visible' },
  nodes: { zh: '節點', en: 'nodes' },
  stroke: { zh: '描線', en: 'Stroke' },
  fill: { zh: '填充', en: 'Fill' },
  pathsSelected: { zh: '個路徑已選取', en: 'paths selected' },
  ctrlClickMultiSelect: { zh: 'Ctrl+點擊可多選', en: 'Ctrl+Click for multi-select' },
};