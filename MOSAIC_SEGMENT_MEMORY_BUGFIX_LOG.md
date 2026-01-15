# 馬賽克生成器 - SegmentMemory 色彩映射系統問題日誌

## 📋 系統概述

馬賽克生成器採用 **SegmentMemory 空間記憶系統** 和 **ColorMap Index Mapping 系統**來確保用戶修改的顏色在調整畫布大小或顏色數量後仍然保持。

### 核心機制
1. **ColorMap Index Mapping**: 每個 tile 存儲一個顏色索引，而非具體顏色值
2. **SegmentMemory**: 記錄用戶修改的空間區域（segment mask）和顏色變化
3. **originalPaletteSnapshot**: 保存原始 palette，確保重新採樣時的索引一致性

---

## 🐛 已修復的問題

### 問題 #1: 非等比例縮放導致 Segment 形狀扭曲
**發現日期**: 2025-01-14  
**嚴重程度**: 🔴 Critical

#### 問題描述
在 `segmentMemory.ts` 的 `calculateSegmentIoU()` 函數中，使用了非等比例的縮放邏輯：

```javascript
// ❌ 錯誤代碼
const targetWidth = Math.max(mask1.width, mask2.width);   // 例如: 60
const targetHeight = Math.max(mask1.height, mask2.height); // 例如: 40

const srcX = Math.floor((x / targetWidth) * origWidth);   // X縮放比: origWidth/60
const srcY = Math.floor((y / targetHeight) * origHeight); // Y縮放比: origHeight/40
```

**問題影響**:
- X 和 Y 方向使用不同的縮放比例
- 當畫布從 40x40 調整到 60x30 時，原本的圓形 segment 會被拉伸成橢圓
- IoU 計算不準確，導致顏色修改無法正確映射

**實際案例**:
```
原始畫布: 40x40 (正方形)
用戶改了顏色 #2 和 #5
調整畫布: 60x30
結果: 只有顏色 #2 被保留，顏色 #5 丟失
原因: 非等比例縮放導致 segment 形狀不匹配，IoU < 0.3
```

#### 解決方案
實現等比例縮放並標準化到統一空間 (100x100):

```javascript
// ✅ 修復後
function resizeMaskPreserveAspect(mask: SegmentMask, maxSize: number): boolean[][] {
  // 計算統一的縮放比例（取較小值確保不超出邊界）
  const scale = Math.min(maxSize / origWidth, maxSize / origHeight);
  
  // X 和 Y 使用相同的縮放比例
  const scaledWidth = Math.round(origWidth * scale);
  const scaledHeight = Math.round(origHeight * scale);
  
  // 將縮放後的 mask 居中，周圍填充 false
  const offsetX = Math.floor((maxSize - scaledWidth) / 2);
  const offsetY = Math.floor((maxSize - scaledHeight) / 2);
  
  // 使用相同的 scale 進行映射
  const srcX = Math.floor(x / scale);
  const srcY = Math.floor(y / scale);
}
```

**修復效果**:
- ✅ 所有 segments 都等比例縮放
- ✅ 形狀保持一致，IoU 計算準確
- ✅ 調整畫布大小後所有修改的顏色都能正確映射

---

### 問題 #2: recordModification 覆蓋不同的 Segment
**發現日期**: 2025-01-14  
**嚴重程度**: 🔴 Critical

#### 問題描述
在 `recordModification()` 中，只檢查空間相似度 (IoU > 0.9)，沒有檢查原始顏色：

```javascript
// ❌ 錯誤代碼
const existingIndex = this.modifications.findIndex(mod => {
  const iou = calculateSegmentIoU(mod.segmentMask, segmentMask);
  return iou > 0.9; // 只檢查空間相似度
});
```

**問題影響**:
- 如果兩個不同的 segment 空間位置相似（例如相鄰區域），第二個修改會覆蓋第一個
- 用戶改了顏色 #2 和 #5，但只有第二個修改被保存

**實際案例**:
```
1. 用戶改顏色 #2 (紅色 → 藍色) → 記錄修改 A
2. 用戶改顏色 #5 (綠色 → 黃色)
   - Segment #5 和 #2 空間上有 90% 重疊
   - 修改 B 覆蓋了修改 A
3. 調整畫布大小
   結果: 只有黃色被應用，藍色丟失
```

#### 解決方案
同時檢查空間相似度和原始顏色：

```javascript
// ✅ 修復後
const existingIndex = this.modifications.findIndex(mod => {
  const iou = calculateSegmentIoU(mod.segmentMask, segmentMask);
  const sameOriginalColor = mod.originalColor === originalColor;
  
  // 只有當兩個條件都滿足時才認為是"同一個 segment"
  // 1. 高空間重疊 (IoU > 0.9)
  // 2. 相同的原始顏色
  return iou > 0.9 && sameOriginalColor;
});
```

**修復效果**:
- ✅ 不同顏色的 segments 即使空間重疊也會分別記錄
- ✅ 所有顏色修改都能被正確保存
- ✅ 只有真正相同的 segment 才會被更新

---

### 問題 #3: applyModificationsToPalette 遍歷順序錯誤
**發現日期**: 2025-01-14  
**嚴重程度**: 🔴 Critical

#### 問題描述
遍歷新 palette 而不是遍歷修改記錄：

```javascript
// ❌ 錯誤代碼
for (let segmentIndex = 0; segmentIndex < newPalette.length; segmentIndex++) {
  const matchedColor = this.findMatchingModification(newColorMap, segmentIndex);
  // 為每個新 segment 找一個修改
}
```

**問題影響**:
- 如果有 5 個修改但新 palette 只有 3 個顏色，最多只能應用 3 個修改
- 多個修改可能都匹配同一個 segment，但只有最後一個會被應用

**實際案例**:
```
原始: 8 個顏色，用戶改了 #2, #5, #7
調整畫布: 重新採樣後只生成 5 個新 segments
舊邏輯: 遍歷這 5 個 segments，每個找一個最佳匹配
結果: 可能只應用了 3 個修改，或者某些修改被忽略
```

#### 解決方案
遍歷修改記錄，為每個修改找最佳匹配：

```javascript
// ✅ 修復後
const usedSegments = new Set<number>();

// 遍歷所有修改（而不是 palette）
for (let i = 0; i < this.modifications.length; i++) {
  const mod = this.modifications[i];
  
  // 為每個修改找到最佳匹配的新 segment
  let bestSegmentIndex = -1;
  let bestIoU = 0;
  
  for (let segmentIndex = 0; segmentIndex < newPalette.length; segmentIndex++) {
    if (usedSegments.has(segmentIndex)) continue; // 避免重複修改
    
    const iou = calculateSegmentIoU(mod.segmentMask, newSegmentMask);
    if (iou > bestIoU) {
      bestIoU = iou;
      bestSegmentIndex = segmentIndex;
    }
  }
  
  // 應用修改
  if (bestIoU > 0.3 && bestSegmentIndex !== -1) {
    modifiedPalette[bestSegmentIndex] = mod.modifiedColor;
    usedSegments.add(bestSegmentIndex);
  }
}
```

**修復效果**:
- ✅ 所有修改都有機會被考慮
- ✅ 使用 `usedSegments` 防止一個 segment 被多次修改
- ✅ 按照 IoU 最高的優先級應用修改

---

### 問題 #4: handleCanvasSizeChange 不重建 Palette
**發現日期**: 2025-01-14  
**嚴重程度**: 🔴 Critical

#### 問題描述
調整畫布大小時，直接使用完整的 `originalPaletteSnapshot`：

```javascript
// ❌ 錯誤代碼
const resamplePalette = originalPaletteSnapshot.length > 0 
  ? originalPaletteSnapshot 
  : palette;

// 重新採樣後，newColorMap 可能只使用了部分顏色索引
// 但我們直接把整個 resamplePalette 傳給 applyModificationsToPalette
finalPalette = segmentMemoryRef.current.applyModificationsToPalette(
  newColorMap,
  resamplePalette  // 🚨 問題：包含未使用的顏色
);
```

**問題影響**:
- `newColorMap` 可能只使用索引 [0, 1, 3, 6]，但 `resamplePalette` 有 8 個顏色
- `applyModificationsToPalette` 修改了索引 2 和 5，但這些索引在 `newColorMap` 中根本沒用到
- 修改的顏色無法顯示

**實際案例**:
```
原始: 8 色 palette，用戶改了索引 2 和 5
調整畫布: 40x40 → 60x30
重新採樣: newColorMap 只用到索引 [0, 1, 3, 6, 7] (5個顏色)
SegmentMemory: 修改了索引 2 和 5
問題: 索引 2 和 5 在新 colorMap 中不存在！
結果: 修改的顏色消失
```

#### 解決方案
從 `newColorMap` 中提取實際使用的顏色，重建 palette：

```javascript
// ✅ 修復後
// 1. 提取實際使用的顏色索引
const usedIndices = new Set<number>();
for (let y = 0; y < tilesY; y++) {
  for (let x = 0; x < tilesX; x++) {
    usedIndices.add(newColorMap[y][x]);
  }
}

// 2. 創建新 palette（只包含使用的顏色）
const oldToNewIndex = new Map<number, number>();
const newPalette: string[] = [];
const sortedIndices = Array.from(usedIndices).sort((a, b) => a - b);

sortedIndices.forEach((oldIndex, newIndex) => {
  oldToNewIndex.set(oldIndex, newIndex);
  newPalette.push(resamplePalette[oldIndex]);
});

// 3. 重新映射 colorMap 索引
const remappedColorMap = newColorMap.map(row =>
  row.map(oldIndex => oldToNewIndex.get(oldIndex) ?? 0)
);

// 4. 應用 SegmentMemory 修改
finalPalette = segmentMemoryRef.current.applyModificationsToPalette(
  remappedColorMap,  // 使用重映射後的 colorMap
  newPalette         // 使用緊湊的 palette
);
```

**修復效果**:
- ✅ Palette 只包含實際使用的顏色
- ✅ ColorMap 索引正確映射到新 palette
- ✅ SegmentMemory 修改能正確應用到顯示的顏色
- ✅ 調整畫布大小後所有修改都能保留

---

### 問題 #5: 顏色合併時 SegmentMemory 未清理
**發現日期**: 2025-01-14  
**嚴重程度**: 🟡 Medium  
**修復狀態**: ✅ 已修復

#### 問題描述
當用戶修改顏色導致顏色合併時（例如改顏色 #2 使其等於顏色 #5），SegmentMemory 中仍然保留了被刪除顏色的修改記錄：

```javascript
// ❌ 舊代碼
if (existingIndex !== -1) {
  // 合併重複顏色
  const newPalette = palette.filter((_, i) => i !== colorIndex);
  
  // 問題：沒有清理 SegmentMemory 中對應的修改記錄
  setPalette(newPalette);
  setTileColorMap(newColorMap);
}
```

**問題影響**:
- SegmentMemory 保留了已刪除顏色的修改記錄
- 後續調整畫布大小時，可能會應用不存在的顏色修改
- 內存浪費（保留無用的修改記錄）

**實際案例**:
```
1. 生成 8 色 palette
2. 改顏色 #2 → 紅色變藍色 (SegmentMemory 記錄: 原始=紅色, 修改=藍色)
3. 改顏色 #5 → 綠色變藍色 (與 #2 相同，觸發合併)
4. 系統合併顏色，刪除 #2 或 #5
5. SegmentMemory 仍然保留被刪除顏色的修改記錄
6. 調整畫布大小時可能出現意外行為
```

#### 解決方案
添加 `removeModificationsForColor()` 方法並在合併時調用：

**segmentMemory.ts**:
```typescript
// ✅ 新增方法
/**
 * Remove modifications for a specific color that was merged/deleted
 * @param deletedColorRgb - The RGB string of the color that was removed (e.g., "255,0,0")
 */
removeModificationsForColor(deletedColorRgb: string): void {
  this.modifications = this.modifications.filter(
    mod => mod.originalColor !== deletedColorRgb && mod.modifiedColor !== deletedColorRgb
  );
}
```

**MosaicGeneratorV2.tsx**:
```typescript
// ✅ 修復後
if (existingIndex !== -1) {
  // 合併重複顏色
  const newPalette = palette.filter((_, i) => i !== colorIndex);
  
  const newColorMap = tileColorMap.map(row => 
    row.map(idx => {
      if (idx === colorIndex) {
        return existingIndex > colorIndex ? existingIndex - 1 : existingIndex;
      } else if (idx > colorIndex) {
        return idx - 1;
      } else {
        return idx;
      }
    })
  );
  
  // 🔥 FIX: Clean up SegmentMemory when merging colors
  const deletedColorRgbArray = hexToRgbArray(
    oldColorHex.startsWith('#') ? oldColorHex : rgbToHex(oldColorHex)
  );
  const deletedColorRgbString = deletedColorRgbArray.join(',');
  segmentMemoryRef.current.removeModificationsForColor(deletedColorRgbString);
  
  setPalette(newPalette);
  setTileColorMap(newColorMap);
}
```

**修復效果**:
- ✅ 顏色合併時自動清理相關的 SegmentMemory 記錄
- ✅ 避免內存洩漏
- ✅ 防止後續應用不存在的顏色修改
- ✅ 系統邏輯更加一致

---

## ✅ 已驗證正確的邏輯

### 1. originalPaletteSnapshot 機制
**位置**: `MosaicGeneratorV2.tsx` - `handleColorChange()`

```javascript
// ✅ 正確
const oldColorHex = originalPaletteSnapshot[colorIndex] || palette[colorIndex];
```

**用途**:
- 確保在記錄 SegmentMemory 時使用的是原始顏色
- 即使 palette 被修改多次，仍然能追溯到初始顏色
- 重新採樣時使用原始 palette 確保索引一致性

**驗證**: ✅ 邏輯正確

---

### 2. numColors 和 palette.length 同步
**位置**: `MosaicGeneratorV2.tsx` - 多處

```javascript
// ✅ 正確 - 顏色合併時更新 numColors
setNumColors(newPalette.length);
setPrevNumColors(newPalette.length);

// ✅ 正確 - History 記錄實際長度
addToHistory({
  numColors: finalPalette.length,  // 使用實際長度，不是 state
});
```

**驗證**: ✅ 邏輯正確，避免了 mismatch

---

### 3. History 系統的閉包問題
**位置**: `MosaicGeneratorV2.tsx` - `handleColorChange()`

```javascript
// ✅ 正確 - 在 setTimeout 外部捕獲當前值
const colorMapCopy = tileColorMap.map(row => [...row]);

colorChangeTimerRef.current = setTimeout(() => {
  addToHistory({
    colorMap: colorMapCopy,  // 使用捕獲的副本，避免閉包問題
    palette: newPalette,
    numColors: newPalette.length,
  });
}, 300);
```

**驗證**: ✅ 正確處理了閉包問題

---

## 🔍 潛在風險點

### 風險 #1: 顏色合併時 SegmentMemory 未更新
**位置**: `MosaicGeneratorV2.tsx:623-653`

**當前行為**:
```javascript
if (existingIndex !== -1) {
  // 合併重複顏色
  const newPalette = palette.filter((_, i) => i !== colorIndex);
  
  // ⚠️ 問題：SegmentMemory 中的修改記錄沒有更新
  // 舊的修改記錄仍然指向已刪除的 colorIndex
}
```

**潛在問題**:
- 當顏色合併時，palette 索引會改變
- SegmentMemory 中的修改記錄仍然使用舊的 segmentIndex
- 可能導致後續應用修改時找不到正確的 segment

**建議解決方案**:
```javascript
// 當合併顏色時，更新 SegmentMemory 中的修改記錄
if (existingIndex !== -1) {
  // ... 現有的合併邏輯 ...
  
  // TODO: 更新或刪除 SegmentMemory 中受影響的修改
  segmentMemoryRef.current.updateIndicesAfterMerge(colorIndex, existingIndex);
}
```

**當前狀態**: ⚠️ 潛在問題，建議添加處理邏輯

---

### 風險 #2: resampleMosaicWithPalette 未使用 SegmentMemory
**位置**: `MosaicGeneratorV2.tsx:452-514`

**當前行為**:
```javascript
const resampleMosaicWithPalette = useCallback(() => {
  // 重新採樣
  const newColorMap = resample(image, palette);
  
  // ⚠️ 沒有應用 SegmentMemory 修改
  setTileColorMap(newColorMap);
  updateColorStats(newColorMap, palette);
});
```

**潛在問題**:
- 如果用戶調用 `resampleMosaicWithPalette`，修改會丟失
- 目前這個函數的用途不明確

**建議**:
1. 確認這個函數是否還在使用
2. 如果使用，添加 SegmentMemory 應用邏輯
3. 如果不使用，考慮刪除

**當前狀態**: ⚠️ 需要確認用途

---

### 風險 #3: generateMosaic 中的 SegmentMemory 應用時機
**位置**: `MosaicGeneratorV2.tsx:392-406`

**當前行為**:
```javascript
// Generate palette
const finalPalette = quantizeColors(...);

// Apply SegmentMemory
if (hasModifications) {
  finalPaletteWithModifications = segmentMemoryRef.current.applyModificationsToPalette(
    newColorMap,
    finalPalette
  );
}

// ⚠️ 問題：修改後的 palette 和原始 palette 可能顏色數量不同
// 但都保存到 originalPaletteSnapshot
setOriginalPaletteSnapshot(finalPalette);  // 保存原始 palette
```

**潛在問題**:
- 如果 `applyModificationsToPalette` 改變了某些顏色
- `originalPaletteSnapshot` 保存的是應用修改前的 palette
- 這可能是正確的，但需要確認邏輯一致性

**當前狀態**: ⚠️ 需要驗證邏輯一致性

---

## 📊 系統流程圖

### 顏色修改流程
```
用戶改顏色 #2
    ↓
handleColorChange(colorIndex=2, newColor)
    ↓
獲取原始顏色: oldColor = originalPaletteSnapshot[2]
    ↓
記錄到 SegmentMemory:
  - segmentMask = createSegmentMask(tileColorMap, 2)
  - originalColor = oldColor
  - modifiedColor = newColor
    ↓
更新 palette[2] = newColor
    ↓
(如果是重複顏色) 合併 palette
    ↓
更新 History
```

### 畫布大小調整流程
```
用戶調整畫布: 40x40 → 60x30
    ↓
handleCanvasSizeChange(60, 30)
    ↓
使用 originalPaletteSnapshot 重新採樣
    ↓
newColorMap = resample(image, originalPaletteSnapshot)
    ↓
提取實際使用的顏色索引: usedIndices = [0, 1, 3, 5, 7]
    ↓
重建 palette: newPalette = [palette[0], palette[1], ...]
    ↓
重新映射索引: remappedColorMap (0,1,3,5,7 → 0,1,2,3,4)
    ↓
應用 SegmentMemory 修改:
  - 遍歷所有修改記錄
  - 為每個修改找到最佳匹配的新 segment
  - 計算 IoU (使用等比例縮放)
  - 應用顏色修改
    ↓
finalPalette = 應用修改後的 palette
    ↓
更新 state 和 History
```

---

## 🧪 測試用例

### 測試案例 #1: 基本顏色修改保留
```
1. 上傳圖片，生成 8 色馬賽克 (40x40)
2. 改顏色 #2: 紅色 → 藍色
3. 改顏色 #5: 綠色 → 黃色
4. 調整畫布大小: 60x30
預期結果: 藍色和黃色都保留在對應的空間區域
實際結果: ✅ 通過
```

### 測試案例 #2: 顏色數量改變
```
1. 上傳圖片，生成 8 色馬賽克
2. 改顏色 #2 和 #5
3. 調整顏色數量: 8 → 5
預期結果: 盡可能保留修改，如果 segment 被合併則使用修改後的顏色
實際結果: ✅ 通過
```

### 測試案例 #3: 畫布形狀改變
```
1. 上傳圖片，生成馬賽克 (40x40, 正方形)
2. 改顏色 #3
3. 調整畫布: 80x20 (長條形)
預期結果: 修改的顏色仍然出現在對應的空間位置
實際結果: ✅ 通過（修復等比例縮放後）
```

### 測試案例 #4: 顏色合併
```
1. 生成馬賽克
2. 改顏色 #2 → 使其等於顏色 #5
3. 系統自動合併顏色
4. 調整畫布大小
預期結果: 合併後的顏色保留
實際結果: ⚠️ 需要驗證（可能存在 SegmentMemory 不同步問題）
```

---

## 🛠️ 維護建議

### 1. 添加調試工具
建議在 SegmentMemory 中添加調試方法：

```typescript
/**
 * 獲取所有修改的詳細信息（用於調試）
 */
getDebugInfo(): {
  totalModifications: number;
  modifications: Array<{
    index: number;
    originalColor: string;
    modifiedColor: string;
    area: number;
    centroid: { x: number; y: number };
  }>;
} {
  return {
    totalModifications: this.modifications.length,
    modifications: this.modifications.map((mod, i) => ({
      index: i,
      originalColor: mod.originalColor,
      modifiedColor: mod.modifiedColor,
      area: calculateArea(mod.segmentMask),
      centroid: calculateCentroid(mod.segmentMask),
    })),
  };
}
```

### 2. 添加性能監控
對於大型圖片，SegmentMemory 的 IoU 計算可能較慢：

```typescript
console.time('SegmentMemory.applyModificationsToPalette');
finalPalette = segmentMemoryRef.current.applyModificationsToPalette(
  remappedColorMap,
  newPalette
);
console.timeEnd('SegmentMemory.applyModificationsToPalette');
```

### 3. 考慮優化 IoU 計算
如果修改記錄很多，可以使用空間索引（如 R-tree）加速查找：

```typescript
// 未來優化方向
class SegmentMemoryOptimized {
  private spatialIndex: RTree;  // 空間索引
  
  findMatchingModification(newSegmentMask) {
    // 使用空間索引快速篩選候選修改
    const candidates = this.spatialIndex.search(getBoundingBox(newSegmentMask));
    
    // 只對候選修改計算 IoU
    // ...
  }
}
```

---

## 📝 總結

### 已修復的關鍵問題
1. ✅ 非等比例縮放導致 segment 形狀扭曲
2. ✅ recordModification 覆蓋不同的 segment
3. ✅ applyModificationsToPalette 遍歷順序錯誤
4. ✅ handleCanvasSizeChange 不重建 palette
5. ✅ 顏色合併時 SegmentMemory 未清理

### 當前系統狀態
- ✅ 顏色修改記錄機制正常
- ✅ 畫布大小調整保留修改
- ✅ 顏色數量調整保留修改
- ⚠️ 顏色合併時 SegmentMemory 同步需要驗證
- ⚠️ resampleMosaicWithPalette 用途需要確認

### 下一步行動
1. 驗證顏色合併場景
2. 確認 resampleMosaicWithPalette 的用途
3. 添加調試工具方便未來排查
4. 考慮性能優化（如果需要）

---

**最後更新**: 2025-01-14  
**維護者**: AI Assistant  
**版本**: 2.1.0