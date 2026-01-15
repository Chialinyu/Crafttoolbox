# Mosaic Generator Utilities

這個目錄包含馬賽克生成器的核心工具函數，用於提升代碼可維護性和可測試性。

## 📁 文件結構

### `colorUtils.ts`
顏色處理相關的工具函數

**主要函數：**
- `parseRgbString(rgb)` - 解析 RGB 字符串為 [r, g, b] 陣列
- `rgbToHex(rgb)` - RGB 轉 HEX
- `hexToRgb(hex)` - HEX 轉 RGB
- `colorDistance(rgb1, rgb2)` - 計算兩個顏色的歐幾里得距離
- `findClosestColor(r, g, b, palette)` - 在調色盤中找到最接近的顏色
- `quantizeColors(imageData, targetNumColors)` - 使用中值切割算法進行顏色量化
- `deduplicatePalette(colors)` - 移除調色盤中的重複顏色
- `reducePalette(colors, targetSize)` - 通過合併相似顏色來縮小調色盤

**使用範例：**
```typescript
import { rgbToHex, findClosestColor, quantizeColors } from '@/utils/colorUtils';

// RGB 轉 HEX
const hex = rgbToHex('rgb(255, 128, 0)'); // "#ff8000"

// 在調色盤中找最接近的顏色
const palette = ['rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'rgb(0, 0, 255)'];
const index = findClosestColor(200, 50, 50, palette); // 0 (紅色最接近)

// 顏色量化
const imageData = ctx.getImageData(0, 0, width, height);
const colors = quantizeColors(imageData, 8); // 提取 8 種主要顏色
```

### `mosaicUtils.ts`
馬賽克計算相關的工具函數

**主要函數：**
- `calculateOffsets(borderEnabled, borderWidth)` - 計算邊框偏移量
- `calculateCanvasSize(tilesX, tilesY, tileSize, tileSpacing, borderEnabled, borderWidth)` - 計算畫布尺寸
- `calculateTilePosition(canvasX, canvasY, offsetX, offsetY, tileSize, tileSpacing)` - 從畫布座標計算磁磚位置
- `calculatePixelPosition(tileX, tileY, offsetX, offsetY, tileSize, tileSpacing)` - 計算磁磚的像素位置
- `isTileInBounds(tileX, tileY, maxWidth, maxHeight)` - 檢查磁磚是否在範圍內
- `calculateTotalTiles(width, height)` - 計算總磁磚數
- `calculatePhysicalSize(tilesX, tilesY, tileSize, tileSpacing, borderWidth, borderEnabled)` - 計算實際物理尺寸

**使用範例：**
```typescript
import { calculateCanvasSize, calculateOffsets, calculateTilePosition } from '@/utils/mosaicUtils';

// 計算畫布尺寸
const { width, height } = calculateCanvasSize(40, 30, 20, 2, true, 10);
// width = 40*(20+2) - 2 + 20 = 898
// height = 30*(20+2) - 2 + 20 = 678

// 計算邊框偏移
const { offsetX, offsetY } = calculateOffsets(true, 10);
// offsetX = 10, offsetY = 10

// 從點擊位置計算磁磚位置
const { tileX, tileY } = calculateTilePosition(120, 80, 10, 10, 20, 2);
// tileX = Math.floor((120-10)/(20+2)) = 5
// tileY = Math.floor((80-10)/(20+2)) = 3
```

### `segmentMemory.ts`
基於空間相似度的顏色修改記憶系統

**主要類：**
- `SegmentMemory` - 追蹤用戶修改過的空間區域並在重新分割時保持修改

**核心概念：**
- 使用 IoU (Intersection over Union) 計算空間相似度
- 記憶用戶對特定區域的顏色修改
- 在畫布調整大小或重新生成時智能應用修改

**使用範例：**
```typescript
import { SegmentMemory } from '@/utils/segmentMemory';

const memory = new SegmentMemory();

// 記錄用戶修改
memory.recordModification(colorMap, segmentIndex, originalColor, newColor);

// 應用到新調色盤
const modifiedPalette = memory.applyModificationsToPalette(newColorMap, newPalette);

// 清除記憶
memory.clear();
```

### `colorDistribution.ts`
顏色分佈分析和閾值計算

**主要函數：**
- `analyzeColorDistribution(palette)` - 分析調色盤的顏色分佈特性

**返回的統計數據：**
- `averageColorDistance` - 平均顏色距離
- `colorDistanceStdDev` - 顏色距離標準差
- `minColorDistance` - 最小顏色距離
- `maxColorDistance` - 最大顏色距離
- `colorDensity` - 顏色密度
- `recommendedThreshold` - 建議的 Delta E 閾值
- `strictThreshold` - 嚴格的 Delta E 閾值

**使用範例：**
```typescript
import { analyzeColorDistribution } from '@/utils/colorDistribution';

const stats = analyzeColorDistribution(palette);
// 使用 stats.recommendedThreshold 進行顏色匹配
```

## 🎯 優勢

### 1. **消除重複代碼**
原本在多處重複出現的計算邏輯現在統一管理：
- offsetX/offsetY 計算重複 8+ 次 → 現在只有 1 個函數
- Canvas 尺寸計算重複 3 次 → 現在只有 1 個函數
- RGB 解析重複多次 → 現在只有 1 個函數

### 2. **提升可測試性**
每個函數都是純函數（除了記憶系統類），容易編寫單元測試：
```typescript
// 測試範例
describe('colorUtils', () => {
  it('should convert RGB to HEX correctly', () => {
    expect(rgbToHex('rgb(255, 128, 0)')).toBe('#ff8000');
  });
});
```

### 3. **提升可維護性**
- 清晰的函數命名和文檔
- 集中管理相關邏輯
- 修改時只需改一個地方

### 4. **提升可重用性**
這些函數可以在未來的其他工具中重複使用

## 📚 代碼組織原則

### 純函數優先
- 無副作用
- 相同輸入總是產生相同輸出
- 易於測試和推理

### 單一職責
- 每個函數只做一件事
- 函數名清晰表達其功能

### 類型安全
- 所有函數都有完整的 TypeScript 類型註解
- 使用明確的參數和返回值類型

### 文檔完整
- JSDoc 註釋說明函數用途
- 參數和返回值都有描述
- 提供使用範例

## 🔧 維護指南

### 添加新工具函數

1. **確定函數類別**：顏色、馬賽克、記憶系統等
2. **選擇合適的文件**：放在最相關的文件中
3. **編寫類型定義**：完整的 TypeScript 類型
4. **添加 JSDoc 註釋**：說明用途、參數、返回值
5. **編寫測試**：確保函數正確性
6. **更新 README**：添加到文檔中

### 重構現有函數

1. **保持向後兼容**：除非是 breaking change
2. **更新所有調用處**：使用 IDE 的重構功能
3. **更新測試**：確保測試仍然通過
4. **更新文檔**：反映新的行為

### 代碼審查檢查清單

- [ ] 函數是純函數（如果可能）
- [ ] 有完整的 TypeScript 類型註解
- [ ] 有 JSDoc 註釋
- [ ] 函數名清晰表達意圖
- [ ] 參數數量合理（建議 ≤ 4 個）
- [ ] 有錯誤處理（如果需要）
- [ ] 有使用範例
- [ ] 已添加到文檔

## 🧪 測試建議

### 顏色工具測試
```typescript
describe('colorUtils', () => {
  describe('rgbToHex', () => {
    it('should convert RGB to HEX', () => {
      expect(rgbToHex('rgb(255, 0, 0)')).toBe('#ff0000');
    });
    
    it('should handle RGB without spaces', () => {
      expect(rgbToHex('rgb(255,0,0)')).toBe('#ff0000');
    });
  });
});
```

### 馬賽克工具測試
```typescript
describe('mosaicUtils', () => {
  describe('calculateOffsets', () => {
    it('should return offsets when border is enabled', () => {
      const { offsetX, offsetY } = calculateOffsets(true, 10);
      expect(offsetX).toBe(10);
      expect(offsetY).toBe(10);
    });
    
    it('should return zero offsets when border is disabled', () => {
      const { offsetX, offsetY } = calculateOffsets(false, 10);
      expect(offsetX).toBe(0);
      expect(offsetY).toBe(0);
    });
  });
});
```

## 🚀 性能優化

### 緩存策略
- 對於重複計算，考慮使用 memoization
- 大數組操作使用高效算法

### 避免不必要的計算
- 提前返回（early return）
- 使用合適的數據結構

### 示例
```typescript
// ✅ 好的做法 - 提前返回
function findClosestColor(r: number, g: number, b: number, palette: string[]): number {
  if (palette.length === 0) return -1;
  if (palette.length === 1) return 0;
  
  // 繼續處理...
}

// ❌ 避免 - 不必要的計算
function findClosestColor(r: number, g: number, b: number, palette: string[]): number {
  let minDistance = Infinity;
  let closestIndex = -1;
  
  for (let i = 0; i < palette.length; i++) {
    // 即使 palette 為空也會執行
  }
  
  return closestIndex;
}
```

## 📖 相關資源

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Jest Testing Framework](https://jestjs.io/)
- [Clean Code Principles](https://github.com/ryanmcdermott/clean-code-javascript)

---

**下一步**: 這些工具函數在 MosaicGeneratorV2 中使用，替代原版中的重複代碼。持續改進和優化這些工具以提升整體代碼質量。