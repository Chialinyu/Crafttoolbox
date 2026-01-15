# Vectorizer Tool - 完整技術文檔

## 🎯 系統概覽

**圖片向量化工具** - 將點陣圖轉換為可縮放的 SVG 向量圖形

### 核心技術棧
- **Potrace 演算法**: 主要向量化引擎（高質量貝茲曲線）
- **K-means 聚類**: 顏色量化與分離
- **Generator 批處理**: 記憶體優化架構
- **多層保護機制**: 防止卡死與記憶體溢出

### 工作流程（5步驟）
```
1. Upload      → 上傳圖片
2. Mode Select → 選擇模式（描邊/填充/混合）
3. Preprocess  → 調整參數（顏色數量、模糊、閾值）
4. Vectorize   → 生成向量路徑
5. Export      → 導出 SVG
```

### 關鍵創新
✅ **ColorMap Index Mapping** - 調整參數後顏色不跑位  
✅ **Generator 批處理** - 記憶體峰值降低 90%（從 500MB → 100MB）  
✅ **多層保護機制** - 複雜度檢測 + 宽高比檢測 + 超時保護  
✅ **Mask 顏色反轉** - 修復 Potrace 形狀挖空問題  
✅ **智能降採樣** - 大區域自動降解析度避免卡死  

---

## 📁 文件結構

```
src/app/components/vectorizer/
├── ImageUploader.tsx          # Step 1: 圖片上傳組件
├── ModeSelector.tsx           # Step 2: 模式選擇組件
├── PreprocessPanel.tsx        # Step 3: 參數調整面板
├── SVGCanvas.tsx              # Step 3/4: 預覽畫布（雙模式渲染）
├── PathLayerPanel.tsx         # Step 4: 圖層管理面板
├── ColorPalette.tsx           # Step 4: 顏色選擇面板（合併功能）
├── constants.ts               # 常量定義
│
├── utils/
│   ├── cvProcessing.ts        # CV 圖像處理算法
│   ├── vectorization.ts       # 向量化核心算法
│   └── colorMerging.ts        # 顏色合併工具
│
└── hooks/
    └── usePreviewManager.ts   # 預覽狀態管理 Hook
```

## 🎯 代碼組織原則

### 1. **關注點分離 (Separation of Concerns)**

- **constants.ts**: 所有常量和配置集中管理
- **utils/**: 純函數工具集，處理密集運算
- **hooks/**: 自定義 Hook，管理複雜狀態
- **components/**: UI 組件，專注於渲染和用戶交互

### 2. **避免 Magic Numbers**

❌ **之前：**
```typescript
if (colorCount < 2 || colorCount > 10) {
  // ...
}
const blurRadius = 2;
setTimeout(() => {...}, 100);
```

✅ **現在：**
```typescript
import { LIMITS, DEFAULT_VALUES, TIMING } from './vectorizer/constants';

if (!LIMITS.isValidColorCount(colorCount)) {
  // ...
}
const blurRadius = DEFAULT_VALUES.BLUR_RADIUS;
setTimeout(() => {...}, TIMING.VECTORIZATION_DELAY_MS);
```

### 3. **類型安全**

❌ **之前：**
```typescript
const [paths, setPaths] = useState([]);
const [config, setConfig] = useState({});
```

✅ **現在：**
```typescript
import { VectorPath, VectorizationConfig } from './vectorizer/utils/vectorization';

const [paths, setPaths] = useState<VectorPath[]>([]);
const [config, setConfig] = useState<VectorizationConfig | null>(null);
```

### 4. **異步處理**

所有密集運算都異步化，防止 UI 凍結：

```typescript
import { TIMING } from './vectorizer/constants';

// ✅ 防抖 + 異步
const handlePreviewUpdate = useCallback(() => {
  if (previewTimerRef.current) {
    clearTimeout(previewTimerRef.current);
  }
  
  previewTimerRef.current = setTimeout(async () => {
    setIsGeneratingPreview(true);
    
    // 異步處理
    setTimeout(() => {
      const result = preprocessImage(...);
      setPreprocessResult(result);
      setIsGeneratingPreview(false);
    }, 0);
    
  }, TIMING.PREVIEW_DEBOUNCE_MS);
}, [dependencies]);
```

## 📚 導入規範

### 優先順序

1. **React 相關**
```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
```

2. **第三方庫**
```typescript
import { Eye, EyeOff, Trash2 } from 'lucide-react';
```

3. **本地 UI 組件**
```typescript
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
```

4. **Vectorizer 組件**
```typescript
import { ImageUploader } from './vectorizer/ImageUploader';
import { SVGCanvas } from './vectorizer/SVGCanvas';
```

5. **類型和常量**
```typescript
import { DEFAULT_VALUES, TIMING } from './vectorizer/constants';
import { VectorPath, VectorizationConfig } from './vectorizer/utils/vectorization';
```

6. **工具函數**
```typescript
import { preprocessImage } from './vectorizer/utils/cvProcessing';
import { vectorizeImage } from './vectorizer/utils/vectorization';
```

7. **Hooks**
```typescript
import { usePreviewManager } from './vectorizer/hooks/usePreviewManager';
```

## 🛠️ 核心模組說明

### constants.ts

**職責**: 統一管理所有常量

```typescript
// 默認值
export const DEFAULT_VALUES = {
  BLUR_RADIUS: 2,
  THRESHOLD: 128,
  COLOR_COUNT: 4,
  // ...
} as const;

// 限制值
export const LIMITS = {
  COLOR_COUNT_MIN: 2,
  COLOR_COUNT_MAX: 10,
  // ...
} as const;

// 特殊標記
export const CLUSTER_LABELS = {
  TRANSPARENT: 255,
} as const;

// 時間常量
export const TIMING = {
  PREVIEW_DEBOUNCE_MS: 10,
  VECTORIZATION_DELAY_MS: 100,
} as const;

// 莫蘭迪色票
export const MORANDI_COLORS = {
  PINK: '#E8B4B8',
  COFFEE: '#A89F91',
  CREAM: '#F5F1E8',
} as const;
```

### utils/cvProcessing.ts

**職責**: 計算機視覺圖像處理

**核心函數**:
```typescript
// 灰階轉換
export function toGrayscale(imageData: ImageData): ImageData

// 高斯模糊
export function gaussianBlur(imageData: ImageData, radius: number): ImageData

// Otsu 自動閾值
export function calculateOptimalThreshold(imageData: ImageData): number

// 二值化
export function applyThreshold(imageData: ImageData, threshold: number): ImageData

// K-means 聚類
export function kMeansClustering(
  imageData: ImageData,
  k: number
): {
  labels: Uint8Array,
  centers: [number, number, number][],
  clusterToMorandiMap: number[]
}

// 完整預處理流程
export function preprocessImage(
  imageData: ImageData,
  blurRadius: number,
  threshold: number,
  colorCount: number,
  useAutoThreshold: boolean
): PreprocessResult
```

**關鍵設計：透明像素處理**
```typescript
// K-means 聚類時，透明像素標記為 255
if (alpha < 128) {
  labels[i] = CLUSTER_LABELS.TRANSPARENT; // 255
  continue; // 不參與聚類
}
```

### utils/vectorization.ts

**職責**: 向量化核心算法（主引擎）

**核心架構**:
```
Potrace (主引擎) → Fallback (備用)
     ↓                  ↓
  Bezier Curves    Contour Tracing
```

**關鍵函數**:
```typescript
// 🎯 主向量化函數（異步）
export async function vectorizeImage(
  imageData: ImageData,
  config: VectorizationConfig
): Promise<VectorPath[]>

// 🔥 Potrace 向量化（帶超時保護）
function traceWithPotrace(
  mask: Uint8Array,
  width: number,
  height: number,
  config: VectorizationConfig
): Promise<string | null>

// 🛡️ Fallback: Moore Neighbor 輪廓追蹤
function traceContour(
  mask: Uint8Array,
  width: number,
  height: number
): Point[]

// 📐 Douglas-Peucker 路徑簡化
export function simplifyPath(
  points: Point[],
  tolerance: number
): Point[]

// 🎨 SVG 生成
export function generateSVG(
  paths: VectorPath[],
  width: number,
  height: number
): string
```

**多層保護機制**:
```typescript
// 1. 複雜度檢測
if (complexity > 20) → 跳過 Potrace，使用 Fallback

// 2. 極端宽高比檢測
if (aspectRatio > 20 || aspectRatio < 0.05) → 跳過 Potrace

// 3. 智能降採樣
if (regionPixels > 500_000) → 自動降採樣到 500K

// 4. 超時保護
Promise.race([potrace, timeout(15s)]) → 超時使用 Fallback

// 5. Region 數量智能過濾
if (regionCount > 200) → 只保留最大的 200 個 regions（按面積排序，靜默過濾）
if (totalPaths > 500) → 停止整體向量化
```

**Generator 批處理架構**:
```typescript
// 傳統方式：一次處理所有 regions（記憶體峰值 500MB）
const regions = findAllRegions(mask); // ❌ 記憶體爆炸
for (const region of regions) { ... }

// 新方式：Generator 逐個生成（記憶體峰值 100MB）
for (const batch of generateRegionBatches(mask, ..., 1)) { // ✅ 記憶體穩定
  const region = batch[0]; // 一次只處理 1 個
  await processRegion(region);
}
```

**🆕 貝茲曲線生成 (Step 4 Enhancement)**:
```typescript
// 自動生成平滑貝茲曲線（默認啟用）
const paths = vectorizeImage(imageData, {
  mode: 'fill',
  precision: 30,
  minArea: 20,
  simplify: true,
  useBezierCurves: true,  // ✅ 默認 true，生成平滑曲線
});

// VectorPath 現在包含 svgPath 屬性
interface VectorPath {
  points: Point[];        // 原始輪廓點（多邊形）
  closed: boolean;
  type: 'stroke' | 'fill';
  color?: string;
  svgPath?: string;       // 🆕 包含貝茲曲線的 SVG path (M...C...C...Z)
}
```

**貝茲曲線算法**:
```typescript
// 使用切線計算生成平滑曲線
// 1. 計算每個點的切線向量
// 2. 生成控制點（基於切線和距離）
// 3. 創建 C (CubicBezier) 命令
// 4. 輸出: "M x1 y1 C cx1 cy1, cx2 cy2, x2 y2 C ... Z"
```

**完整處理流程**:
```typescript
// 🎯 STEP 1: 按 Cluster 處理
for (let clusterId = 0; clusterId < clusterCount; clusterId++) {
  // 1.1 創建該 cluster 的二值遮罩
  const clusterMask = createClusterMask(labels, width, height, clusterId);
  
  // 1.2 獲取 Morandi 色彩
  const color = morandiPalette[clusterToMorandiMap[clusterId]];
  
  // 🎯 STEP 2: Generator 批處理 Regions（記憶體優化）
  for (const batch of generateRegionBatches(clusterMask, width, height, minArea, 1)) {
    const region = batch[0];
    
    // 🎯 STEP 3: 決策樹 - Potrace vs Fallback
    let svgPath: string | null = null;
    
    // 3.1 檢測是否適合 Potrace
    const complexity = calculateComplexity(region);
    const aspectRatio = region.width / region.height;
    
    if (complexity > 20) {
      // → 複雜紋理，跳過 Potrace
      console.log('⚠️ Complex texture, using fallback');
    } else if (aspectRatio > 20 || aspectRatio < 0.05) {
      // → 極端宽高比，跳過 Potrace
      console.log('⚠️ Extreme aspect ratio, using fallback');
    } else {
      // → 嘗試 Potrace（帶超時保護）
      try {
        svgPath = await Promise.race([
          traceWithPotrace(region.mask, region.width, region.height, config),
          timeout(15000) // 15秒超時
        ]);
        
        if (svgPath) {
          console.log('✅ Potrace success');
        }
      } catch (error) {
        console.log('⚠️ Potrace failed, using fallback');
      }
    }
    
    // 🎯 STEP 4: Fallback - 自定義輪廓追蹤
    if (!svgPath) {
      // 4.1 Moore Neighbor 輪廓追蹤
      const contours = findBoundaryContours(region.mask, ...);
      
      // 4.2 簡化路徑
      for (const contour of contours) {
        const simplified = simplifyPath(contour.points, tolerance);
        
        // 4.3 生成 SVG path（多邊形）
        const pathData = pointsToPath(simplified, true);
        
        paths.push({
          points: simplified,
          closed: true,
          type: 'fill',
          color: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
          svgPath: pathData,
        });
      }
    } else {
      // Potrace 成功，直接使用
      paths.push({
        points: [],
        closed: true,
        type: 'fill',
        color: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
        svgPath, // Bezier curves from Potrace
      });
    }
  }
}

// 🎯 STEP 5: 返回所有路徑
return paths;
```

### utils/colorMerging.ts

**職責**: 顏色合併工具

```typescript
export function mergeColorGroups(
  paths: VectorPath[],
  selectedColors: string[],
  targetColor: string
): VectorPath[] {
  return paths.map(path => {
    if (selectedColors.includes(path.color || '')) {
      return { ...path, color: targetColor };
    }
    return path;
  });
}
```

### hooks/usePreviewManager.ts

**職責**: 管理 Step 3 和 Step 4 預覽互斥

```typescript
interface PreviewState {
  activePreview: 'step3' | 'step4' | null;
  step4Config: {
    selectedPaths: number[];
    hoveredPath: number | null;
  };
}

export function usePreviewManager() {
  return {
    activateStep3Preview: () => {...},
    activateStep4Preview: (config) => {...},
    clearAllPreviews: () => {...},
    getActivePreview: () => state.activePreview,
  };
}
```

**使用場景**:
```typescript
// Step 3: 參數改變
const handleParamChange = () => {
  previewManager.activateStep3Preview();
  // 生成預覽...
};

// Step 4: 進入向量編輯
const handleGenerateVectors = () => {
  previewManager.activateStep4Preview({
    selectedPaths: [],
    hoveredPath: null,
  });
};

// 編輯步驟時清除
const handleEditStep = (step) => {
  previewManager.clearAllPreviews();
};
```

## 🎨 組件說明

### SVGCanvas.tsx

**特殊設計**: 雙模式渲染

```typescript
interface SVGCanvasProps {
  // Step 3 模式：顯示聚類預覽
  previewImageData?: ImageData | null;
  
  // Step 4 模式：顯示向量路徑
  vectorPaths?: VectorPath[];
  selectedPathIndices?: number[];
  hoveredPathIndex?: number | null;
  hiddenPathIndices?: number[];
  
  // 共用設置
  originalImageData?: ImageData | null;
  showOriginalImage?: boolean;
  imageOpacity?: number;
}
```

**渲染邏輯**:
```typescript
// Step 3: Canvas 渲染
{previewImageData && (
  <canvas ref={canvasRef} />
)}

// Step 4: SVG 渲染
{vectorPaths.map((path, index) => {
  const isHidden = hiddenPathIndices.includes(index);
  const isSelected = selectedPathIndices.includes(index);
  const isHovered = hoveredPathIndex === index;
  
  return (
    <path
      d={pathData}
      fill={path.color}
      opacity={isHidden ? 0 : (isSelected ? 1.0 : 0.3)}
      stroke={isHovered ? 'yellow' : 'none'}
    />
  );
})}
```

### PathLayerPanel.tsx

**功能**: 圖層管理面板

**關鍵特性**:
- 按顏色分組
- 展開/收起群組
- 個別顯示/隱藏
- **群組全部顯示/隱藏** ⭐
- Ctrl+點擊多選
- Mini 預覽

**群組全部顯示/隱藏邏輯**:
```typescript
const allGroupPathsHidden = group.paths.every(
  p => hiddenPathIndices.includes(p.originalIndex)
);

<Button
  onClick={() => onGroupToggleVisibility(groupPathIndices)}
  title={allGroupPathsHidden ? t('showAllInGroup') : t('hideAllInGroup')}
>
  {allGroupPathsHidden ? <EyeOff /> : <Eye />}
</Button>
```

**重要：圖標表示當前狀態**
```typescript
// ✅ 正確
Eye 👁️ = 當前可見
EyeOff 👁️‍🗨️ = 當前隱藏

// ❌ 錯誤（不要表示「點擊後的動作」）
```

## 🔧 維護指南

### 添加新功能

1. **新增常量**: 在 `constants.ts` 中添加
2. **新增類型**: 在 `utils/vectorization.ts` 或 `utils/cvProcessing.ts` 中定義
3. **新增工具函數**: 在對應的 `utils/` 文件中實現
4. **新增組件**: 創建新文件

### 修改現有功能

1. 檢查 `constants.ts` 是否需要更新
2. 檢查類型定義是否需要更新
3. 更新相關組件
4. 確保異步處理正確

### 代碼審查檢查清單

- [ ] 沒有 magic numbers（使用 constants）
- [ ] 所有函數和變量都有正確的類型註解
- [ ] 密集運算已異步化（防抖 + setTimeout）
- [ ] 添加了取消機制（isCancelledRef）
- [ ] 導入順序正確
- [ ] 添加了必要的註釋
- [ ] 錯誤處理完善
- [ ] 無 console.log（除非必要）

## 📖 最佳實踐

### ✅ 推薦

```typescript
// 使用常量
import { DEFAULT_VALUES } from './vectorizer/constants';
const blurRadius = DEFAULT_VALUES.BLUR_RADIUS;

// 使用類型
import { VectorPath } from './vectorizer/utils/vectorization';
const paths: VectorPath[] = [];

// 異步處理
const handleUpdate = useCallback(() => {
  if (timerRef.current) clearTimeout(timerRef.current);
  
  timerRef.current = setTimeout(async () => {
    setIsProcessing(true);
    setTimeout(() => {
      const result = processImage(...);
      setResult(result);
      setIsProcessing(false);
    }, 0);
  }, TIMING.PREVIEW_DEBOUNCE_MS);
}, [dependencies]);

// 清晰的函數命名
const handlePreprocessParamsChange = () => {...};
const handleVectorizeImage = () => {...};
```

### ❌ 避免

```typescript
// 避免 magic numbers
const threshold = 128; // 這是什麼？
setTimeout(() => {...}, 100); // 為什麼是 100？

// 避免 any 類型
const paths: any[] = [];

// 避免同步密集運算
const handleChange = (value) => {
  const result = heavyComputation(value); // 🔥 UI 凍結！
  setState(result);
};

// 避免模糊的命名
const handleClick = () => {...}; // 點擊什麼？
```

## 🎨 代碼風格

### 註釋格式

```typescript
/**
 * 函數描述
 * 
 * @param param1 - 參數描述
 * @param param2 - 參數描述
 * @returns 返回值描述
 */
export function myFunction(param1: string, param2: number): string {
  // 實現...
}
```

### 常量組織

```typescript
// 使用 as const 確保類型安全
export const DEFAULT_VALUES = {
  BLUR_RADIUS: 2,
  THRESHOLD: 128,
} as const;

// 分組相關常量
export const TIMING = {
  PREVIEW_DEBOUNCE_MS: 10,
  VECTORIZATION_DELAY_MS: 100,
} as const;
```

### 類型定義

```typescript
// 使用描述性名稱
export interface VectorPath {
  points: Point[];
  closed: boolean;
  type: 'stroke' | 'fill';
  color?: string;
}

// 使用 type 定義聯合類型
export type VectorizationMode = 'line' | 'fill' | 'mixed';
```

## 🚀 性能考慮

### 1. 防抖機制
```typescript
// 參數改變後 10ms 才重算
PREVIEW_DEBOUNCE_MS: 10
```

### 2. 異步處理
```typescript
// 使用 setTimeout(0) 讓瀏覽器更新 UI
setTimeout(() => {
  const result = heavyComputation();
  setState(result);
}, 0);
```

### 3. 取消機制
```typescript
// 參數改變時取消舊的計算
isCancelledRef.current = true;

// 在運算中檢查
if (config.isCancelledRef?.current) {
  return []; // 提前退出
}
```

### 4. 條件渲染
```typescript
{isGeneratingPreview && <LoadingSpinner />}
{!isGeneratingPreview && <PreviewCanvas />}
```

## 📝 關鍵設計決策與技術細節

### 🎯 為什麼用 255 作為透明標記？

```typescript
// colorCount 最大值為 10
// cluster ID: 0, 1, 2, ..., 9
// 255 遠大於 10，安全不衝突
CLUSTER_LABELS.TRANSPARENT = 255
```

### 🎯 為什麼 Mask 需要顏色反轉？

**關鍵發現**: Potrace 追蹤**黑色區域**，不是白色！

```typescript
// ❌ 錯誤：直接傳入 mask（白色 = 形狀）
mask: 255 (white) = shape → Potrace 追蹤背景 → 挖空！

// ✅ 正確：反轉顏色（黑色 = 形狀）
inverted = 255 - mask
inverted: 0 (black) = shape → Potrace 追蹤形狀 → 正確！
```

**修復代碼**:
```typescript
function maskToImageData(mask: Uint8Array, width: number, height: number): ImageData {
  const imageData = new ImageData(width, height);
  for (let i = 0; i < mask.length; i++) {
    const inverted = 255 - mask[i]; // 🔧 關鍵修復
    imageData.data[i * 4] = inverted;
    imageData.data[i * 4 + 1] = inverted;
    imageData.data[i * 4 + 2] = inverted;
    imageData.data[i * 4 + 3] = 255;
  }
  return imageData;
}
```

### 🎯 為什麼需要複雜度檢測？

**問題**: Potrace 對複雜紋理處理時間呈指數級增長

```typescript
// 複雜度 = 周長 / √面積
// - 簡單形狀（圓形、矩形）: complexity ≈ 3-5
// - 複雜紋理（碎片、噪點）: complexity > 20

if (complexity > 20) {
  // Potrace 可能需要 60+ 秒 → 跳過
  return useFallback();
}
```

### 🎯 為什麼需要極端宽高比檢測？

**問題**: 1×22 這類細線條導致 Potrace 卡死

```typescript
const aspectRatio = width / height;

// ❌ 危險形狀
1×22 → ratio = 0.045  // 超高細線
69×1 → ratio = 69.0   // 超寬細線

// ✅ 保護機制
if (aspectRatio > 20 || aspectRatio < 0.05) {
  return useFallback(); // 避免卡死
}
```

**測試案例**:
```
Region: 1×22 (0.0K px), aspect: 0.05
⚠️ Extreme aspect ratio (0.05), skipping Potrace
🔄 Using fallback algorithm ✅
```

### 🎯 為什麼使用 Generator 批處理？

**記憶體優化核心技術**

```typescript
// ❌ 舊方式：一次找出所有 regions（記憶體峰值 500MB）
const regions = findAllRegions(mask); // 500 regions × 1MB = 500MB
for (const region of regions) {
  await processRegion(region);
}

// ✅ 新方式：Generator 逐個生成（記憶體峰值 100MB）
function* generateRegionBatches(mask, ..., batchSize) {
  // 只在需要時才找下一個 region
  while (hasMoreRegions) {
    yield findNextRegion(); // 只占用 1MB
  }
}

for (const batch of generateRegionBatches(mask, ..., 1)) {
  await processRegion(batch[0]);
  // 上一個 region 的記憶體已被 GC 回收
}
```

**效果對比**:
| 方式 | 記憶體峰值 | 處理速度 |
|------|-----------|---------|
| 舊方式（一次全部） | 400-500 MB | 慢（記憶體壓力大） |
| 新方式（Generator） | 100-200 MB | 快（記憶體壓力小） |

### 🎯 為什麼移除 GC 呼吸延迟？

**問題**: 之前每 3 個 region 延遲 2.5 秒（30 regions → 25 秒延遲）

**解決**: 多層保護機制已足夠，不需要人為延遲
```typescript
// ❌ 移除前
await processRegion(region);
if (count % 3 === 0) {
  await sleep(2500); // 💤 太慢！
}

// ✅ 移除後
await processRegion(region);
// 保護機制已足夠：
// 1. 複雜度檢測
// 2. 宽高比檢測
// 3. 智能降採樣
// 4. 超時保護
```

### 🎯 為什麼 Step 3/4 預覽互斥？

```typescript
// 避免同時渲染兩種預覽
// Step 3: Canvas 渲染聚類結果
// Step 4: SVG 渲染向量路徑
// → 互斥確保性能和邏輯清晰
```

### 🎯 為什麼使用 Lab 色彩空間？

```typescript
// Lab 色彩空間更符合人眼感知
// 聚類效果比 RGB 更好
// 例如：兩個視覺上相似的綠色，在 RGB 空間距離可能很大
//      但在 Lab 空間距離較小
```

### 🎯 為什麼莫蘭迪色票按面積排序？

```typescript
// 按面積排序 → 主要區域用主色
// 次要區域用次色
// → 視覺效果更協調
```

### 🎯 ColorMap Index Mapping 系統

**問題**: 調整參數後顏色會跑位
```typescript
// 初始狀態: 6 個顏色
Cluster 0 (背景, 60%) → 咖啡色
Cluster 1 (樹, 20%) → 粉色
...

// 用戶減少到 4 個顏色 → K-means 重新聚類
❌ Cluster 0 現在可能是樹，不是背景！
```

**解決**: ColorMap Index Mapping
```typescript
// 1. 首次聚類時建立映射
clusterToMorandiMap[0] = 0; // Cluster 0 → Morandi palette index 0
clusterToMorandiMap[1] = 1; // Cluster 1 → Morandi palette index 1

// 2. 參數改變後，保持映射
// 即使 cluster 重新編號，仍使用原來的 Morandi index
const color = morandiPalette[clusterToMorandiMap[clusterId]];
```

## 🧪 測試建議

### 單元測試
- 測試 `utils/` 中的純函數
- 測試邊界情況（空圖片、單色圖片）
- 測試取消機制

### 組件測試
- 測試 UI 組件的渲染
- 測試用戶交互（點擊、懸停）
- 測試多選邏輯

### 集成測試
- 測試完整的 5 步驟流程
- 測試編輯步驟功能
- 測試顏色合併功能

---

**維護者**: 確保任何修改都遵循以上原則，保持代碼庫的一致性和可維護性。

**參考文檔**:
- [VECTORIZER_DEVELOPMENT_LOG.md](/VECTORIZER_DEVELOPMENT_LOG.md) - 問題記錄和解決方案（詳細記錄Potrace集成、Mask顏色反轉等關鍵問題）

**最後更新**: 2026-01-13