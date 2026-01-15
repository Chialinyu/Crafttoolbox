# 馬賽克生成器 - 技術債務日誌

## 📋 概述
本文件記錄馬賽克生成器中的技術債務、未使用的代碼和潛在的優化機會。

---

## 🗑️ 死代碼 (Dead Code)

### 1. resampleMosaicWithPalette 函數
**位置**: `MosaicGeneratorV2.tsx:452-514`  
**狀態**: ⚠️ 未使用  
**發現日期**: 2025-01-14

#### 描述
`resampleMosaicWithPalette` 函數已定義但在整個組件中沒有被調用。

```typescript
const resampleMosaicWithPalette = useCallback(() => {
  // ... 重新採樣邏輯 ...
}, [image, palette, mosaicWidth, mosaicHeight, ...]);
```

#### 問題
1. 佔用代碼空間（約 60 行）
2. 可能造成困惑：新開發者不清楚它的用途
3. 沒有應用 SegmentMemory 修改，如果被使用會導致顏色丟失

#### 建議行動
- [ ] 選項 A：刪除這個函數（如果確認不需要）
- [ ] 選項 B：添加 SegmentMemory 支持並在適當的地方使用
- [ ] 選項 C：保留但添加註釋說明為什麼保留

#### 決策記錄
_待定_

---

## 🔧 需要重構的代碼

### 1. handleColorChange 中的重複邏輯
**位置**: `MosaicGeneratorV2.tsx:587-715`  
**狀態**: ⚠️ 可以優化  
**發現日期**: 2025-01-14

#### 描述
`handleColorChange` 函數中有兩個分支（合併顏色 vs 正常更新），兩者都有類似的 debounce 和 history 邏輯。

```typescript
if (existingIndex !== -1) {
  // 合併顏色分支
  // ...
  colorChangeTimerRef.current = setTimeout(() => {
    addToHistory({ ... });
  }, 300);
} else {
  // 正常更新分支
  // ...
  colorChangeTimerRef.current = setTimeout(() => {
    addToHistory({ ... });
  }, 300);
}
```

#### 問題
- 代碼重複
- 維護成本高（修改一處需要修改兩處）

#### 建議重構
```typescript
const handleColorChange = (colorIndex: number, newColor: string) => {
  // ... 共同邏輯 ...
  
  let finalPalette: string[];
  let finalColorMap: number[][];
  
  if (existingIndex !== -1) {
    // 合併邏輯
    finalPalette = newPalette;
    finalColorMap = newColorMap;
  } else {
    // 正常更新
    finalPalette = newPalette;
    finalColorMap = tileColorMap;
  }
  
  // 統一的 debounce 和 history 邏輯
  if (colorChangeTimerRef.current) {
    clearTimeout(colorChangeTimerRef.current);
  }
  
  const colorMapCopy = finalColorMap.map(row => [...row]);
  
  colorChangeTimerRef.current = setTimeout(() => {
    addToHistory({
      colorMap: colorMapCopy,
      palette: finalPalette,
      numColors: finalPalette.length,
      // ...
    });
  }, 300);
};
```

---

### 2. 顏色格式轉換邏輯散落各處
**位置**: 多個文件  
**狀態**: ⚠️ 可以優化  
**發現日期**: 2025-01-14

#### 描述
代碼中有大量的顏色格式轉換：
- `rgb(r, g, b)` ↔ `#RRGGBB`
- `rgb(r, g, b)` ↔ `r,g,b` (SegmentMemory 格式)
- 各種檢查：`startsWith('#')` 等

#### 問題
- 轉換邏輯重複
- 容易出錯
- 不同部分使用不同的格式

#### 建議改進
創建一個統一的顏色類：

```typescript
class Color {
  private r: number;
  private g: number;
  private b: number;
  
  constructor(input: string) {
    // 自動解析各種格式
  }
  
  toHex(): string { ... }
  toRgb(): string { ... }
  toRgbString(): string { ... } // "r,g,b" for SegmentMemory
  toArray(): [number, number, number] { ... }
}
```

---

## ⚡ 性能優化機會

### 1. SegmentMemory IoU 計算
**位置**: `segmentMemory.ts:calculateSegmentIoU()`  
**狀態**: ⚠️ 可能需要優化  
**發現日期**: 2025-01-14

#### 描述
當前 IoU 計算需要遍歷 100x100 = 10,000 個像素：

```typescript
for (let y = 0; y < STANDARD_SIZE; y++) {
  for (let x = 0; x < STANDARD_SIZE; x++) {
    // 計算交集和並集
  }
}
```

對於每個修改和每個新 segment，都要計算一次 IoU。

#### 複雜度分析
```
修改數量: M
新 segments 數量: N
每次 IoU 計算: O(10,000)
總複雜度: O(M × N × 10,000)

實際案例:
M = 5 個修改
N = 8 個新 segments
總計算: 5 × 8 × 10,000 = 400,000 次循環
```

#### 潛在優化方案

**方案 A: 邊界框預篩選**
```typescript
// 先計算邊界框
const bbox1 = getBoundingBox(mask1);
const bbox2 = getBoundingBox(mask2);

// 如果邊界框不重疊，IoU = 0
if (!bboxesOverlap(bbox1, bbox2)) {
  return 0;
}

// 只在重疊區域計算 IoU
```

**方案 B: 降低分辨率**
```typescript
// 從 100x100 降低到 50x50
const STANDARD_SIZE = 50; // 減少 4 倍計算量
```

**方案 C: 使用 R-tree 空間索引**
```typescript
class SegmentMemoryOptimized {
  private spatialIndex: RTree;
  
  findMatchingModification(newSegmentMask) {
    // 使用空間索引快速找到候選修改
    const candidates = this.spatialIndex.search(
      getBoundingBox(newSegmentMask)
    );
    
    // 只對候選修改計算 IoU
  }
}
```

#### 測試需求
- 需要實際測量性能影響
- 只在用戶報告性能問題時才優化

---

## 🧪 測試覆蓋率

### 缺少的測試用例

#### 1. 邊界情況測試
- [ ] 空 palette 時的行為
- [ ] 單色圖片（palette 只有 1 個顏色）
- [ ] 極端畫布尺寸（1x1, 200x200）
- [ ] 修改後立即撤銷

#### 2. SegmentMemory 測試
- [ ] 記錄多個修改
- [ ] 修改後調整畫布大小
- [ ] 修改後改變顏色數量
- [ ] 合併顏色時清理修改記錄

#### 3. 集成測試
- [ ] 完整的用戶工作流程
- [ ] Undo/Redo 與 SegmentMemory 的交互
- [ ] History 系統的一致性

---

## 📝 文檔缺失

### 需要補充的文檔

#### 1. 架構文檔
- [ ] 整體系統架構圖
- [ ] 數據流圖
- [ ] 狀態管理策略

#### 2. API 文檔
- [ ] SegmentMemory 類的完整 API
- [ ] ColorUtils 函數說明
- [ ] MosaicUtils 函數說明

#### 3. 開發指南
- [ ] 如何添加新功能
- [ ] 如何調試 SegmentMemory 問題
- [ ] 性能優化指南

---

## 🔐 安全性考慮

### 潛在問題

#### 1. 大圖片處理
**風險**: 用戶上傳超大圖片可能導致瀏覽器崩潰

**當前狀態**: 沒有圖片大小限制

**建議**:
```typescript
const MAX_IMAGE_SIZE = 4096; // 像素

const handleImageUpload = (file: File) => {
  const img = new Image();
  img.onload = () => {
    if (img.width > MAX_IMAGE_SIZE || img.height > MAX_IMAGE_SIZE) {
      toast.error('圖片太大，最大支持 4096x4096');
      return;
    }
    // 繼續處理
  };
};
```

#### 2. 內存洩漏風險
**風險**: SegmentMemory 無限增長

**當前狀態**: 只在新圖片上傳時清空

**建議**:
- 添加修改數量上限（例如 50 個）
- 或者定期清理舊的修改（基於時間戳）

---

## 📊 監控建議

### 應該監控的指標

#### 1. 性能指標
- [ ] `generateMosaic` 執行時間
- [ ] `applyModificationsToPalette` 執行時間
- [ ] `calculateSegmentIoU` 執行時間
- [ ] 總內存使用量

#### 2. 用戶行為
- [ ] 平均修改的顏色數量
- [ ] 平均畫布大小
- [ ] Undo/Redo 使用頻率

#### 3. 錯誤追蹤
- [ ] SegmentMemory 匹配失敗率（IoU < 0.3）
- [ ] 顏色格式轉換錯誤
- [ ] Canvas 渲染錯誤

---

## ✅ 已完成的改進

### 2025-01-14
- ✅ 修復非等比例縮放問題
- ✅ 修復 recordModification 覆蓋問題
- ✅ 修復 applyModificationsToPalette 遍歷順序
- ✅ 修復 handleCanvasSizeChange 不重建 palette
- ✅ 添加 removeModificationsForColor 方法
- ✅ 在顏色合併時清理 SegmentMemory

---

## 🎯 優先級排序

### 高優先級 (P0)
1. ✅ 修復核心的 SegmentMemory 問題（已完成）
2. ⚠️ 確認 resampleMosaicWithPalette 的去留

### 中優先級 (P1)
3. 重構 handleColorChange 減少代碼重複
4. 添加圖片大小限制
5. 添加基本的單元測試

### 低優先級 (P2)
6. 性能優化（只在需要時）
7. 創建顏色類統一格式
8. 補充文檔

### 未來考慮 (P3)
9. 使用 R-tree 優化空間查詢
10. 添加監控和分析

---

**最後更新**: 2025-01-14  
**維護者**: AI Assistant  
**版本**: 1.0.0
