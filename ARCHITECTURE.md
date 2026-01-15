# 馬賽克生成器 2.0 - 架構文檔

> **v2.2 更新**: 引入統一 Design System 和模塊化翻譯系統

## 📋 概述

本文檔說明手作工具網站的整體架構、代碼組織和維護指南。

## 🎨 設計系統 (Design System)

### UI 組件使用優先級

**開發新功能時，按以下順序選擇組件**:

1. **首先** - 檢查 `/src/app/components/ui/` Design System
   - `ToolPageLayout` - 工具頁面統一佈局 ⭐
   - `Button`, `Card`, `Input`, `Slider` 等基礎組件
   
2. **其次** - 檢查工具特定組件
   - 例如 `/src/app/components/mosaic/` - 馬賽克專用組件
   - 只使用業務邏輯相關的組件
   
3. **最後** - 不符合需求時才創建新組件
   - 評估是否應該加入 Design System
   - 還是僅限特定工具使用

### ToolPageLayout 組件 ⭐

**位置**: `/src/app/components/ui/ToolPageLayout.tsx`

**用途**: 所有工具頁面的標準佈局（v2.2 新增）

**功能**:
- 統一的返回按鈕和導航
- 標準化的標題和描述區域
- 可選的操作按鈕組（Undo, Redo, Reset 等）
- 響應式設計（手機/電腦自適應）

**使用範例**:
```tsx
import { ToolPageLayout } from './ui/ToolPageLayout';
import { Undo, Redo, RotateCcw } from 'lucide-react';

export const MyTool = ({ onBack }) => {
  return (
    <ToolPageLayout
      title="myToolName"           // 翻譯鍵
      description="myToolDesc"     // 翻譯鍵
      onBack={onBack}
      actions={[
        {
          icon: Undo,
          label: 'undo',
          onClick: handleUndo,
          disabled: !canUndo,
        },
        {
          icon: Redo,
          label: 'redo',
          onClick: handleRedo,
          disabled: !canRedo,
        },
      ]}
    >
      {/* 工具內容 */}
    </ToolPageLayout>
  );
};
```

**優勢**:
- ✅ DRY 原則 - 避免重複代碼
- ✅ 一致性 - 所有工具風格統一
- ✅ 易維護 - 修改一處全站同步

**已應用**:
- ✅ VectorizerTool (向量化工具)
- ✅ MosaicGeneratorV2 (馬賽克生成器)

---

## 🌍 國際化系統 (i18n)

### 模塊化翻譯結構 (v2.2)

**目錄**: `/src/app/contexts/translations/`

**文件結構**:
```
translations/
├── index.ts          # 統一導出
├── common.ts         # 通用翻譯（upload, download, save 等）20-30 行
├── home.ts           # 首頁翻譯 15-20 行
├── mosaic.ts         # 馬賽克工具翻譯 40-50 行
└── vectorizer.ts     # 向量化工具翻譯 30-40 行
```

**優勢**:
- ✅ 小文件易維護（20-50 行 vs 原來的 150+ 行）
- ✅ 快速定位相關翻譯
- ✅ 減少合併衝突
- ✅ 新工具只需新建翻譯文件

### 翻譯文件命名規範

**規則**:
- `common.ts` - 所有工具共用的翻譯
  - 按鈕: upload, download, save, reset, undo, redo
  - 狀態: loading, error, success
  - 操作: confirm, cancel, delete
  
- `{toolName}.ts` - 工具特定翻譯
  - 只包含該工具獨有的術語和文字
  
- **避免重複鍵名** - 優先使用 `common.ts` 的翻譯

**使用範例**:
```typescript
// ✅ 正確 - 只定義工具特定翻譯
// translations/vectorizer.ts
export const vectorizerTranslations = {
  vectorizerTool: { zh: '圖片向量化', en: 'Image Vectorizer' },
  vectorizeMode: { zh: '向量化模式', en: 'Vectorize Mode' },
  traceOutline: { zh: '描線', en: 'Trace Outline' },
  // upload, download 等使用 common.ts 的翻譯
};

// ❌ 錯誤 - 重複定義通用翻譯
// translations/vectorizer.ts
export const vectorizerTranslations = {
  upload: { zh: '上傳', en: 'Upload' },  // ← 應該在 common.ts
  download: { zh: '下載', en: 'Download' },  // ← 應該在 common.ts
};
```

### 新工具開發流程

1. **創建工具組件**，使用 `ToolPageLayout`
2. **創建翻譯文件** `translations/{toolName}.ts`
3. **在 `translations/index.ts` 導入並導出**
4. 完成！自動獲得統一 UI 和多語言支持

```typescript
// Step 1: 創建組件
// /src/app/components/NewTool.tsx
import { ToolPageLayout } from './ui/ToolPageLayout';

export const NewTool = ({ onBack }) => {
  return (
    <ToolPageLayout
      title="newToolName"
      description="newToolDesc"
      onBack={onBack}
    >
      {/* 工具內容 */}
    </ToolPageLayout>
  );
};

// Step 2: 創建翻譯
// /src/app/contexts/translations/newTool.ts
export const newToolTranslations = {
  newToolName: { zh: '新工具', en: 'New Tool' },
  newToolDesc: { zh: '工具描述', en: 'Tool Description' },
};

// Step 3: 導出翻譯
// /src/app/contexts/translations/index.ts
import { newToolTranslations } from './newTool';

export const translations = {
  ...commonTranslations,
  ...newToolTranslations,  // ← 加這行
};
```

---

## 🏗️ 整體架構

```
馬賽克生成器 V2
├── 核心組件層 (Components)
│   ├── MosaicGeneratorV2.tsx (主控制器)
│   └── mosaic/ (UI 子組件)
├── 工具函數層 (Utils)
│   ├── colorUtils.ts (顏色處理)
│   ├── mosaicUtils.ts (馬賽克計算)
│   ├── segmentMemory.ts (空間記憶)
│   └── colorDistribution.ts (顏色分佈)
├── 狀態管理層 (Hooks)
│   └── useMosaicHistory.ts (Undo/Redo)
└── 類型定義層 (Types)
    ├── mosaic/types.ts (組件類型)
    └── mosaic/constants.ts (常量配置)
```

## 📦 模塊說明

### 1. 核心組件層

#### `MosaicGeneratorV2.tsx`
**職責**: 主控制器，協調所有子組件和邏輯

**關鍵功能**:
- 圖片上傳和處理
- 馬賽克生成邏輯
- 狀態管理（顏色、尺寸、設定）
- 歷史記錄管理（Undo/Redo）
- 顏色修改記憶系統

**依賴**:
```typescript
// UI 組件
import { ColorPalettePanel, ColorSettingsPanel, ... } from './mosaic';

// 工具函數
import { quantizeColors, findClosestColor, ... } from '@/utils/colorUtils';
import { calculateOffsets, calculateCanvasSize } from '@/utils/mosaicUtils';

// 記憶系統
import { SegmentMemory } from '@/utils/segmentMemory';

// 狀態管理
import { useMosaicHistory } from '@/hooks/useMosaicHistory';
```

#### `mosaic/` 子組件
**職責**: 可重用的 UI 組件，專注於渲染和交互

**組件列表**:
- `MosaicCanvas.tsx` - 畫布渲染和下載
- `ColorPalettePanel.tsx` - 調色盤顯示和編輯
- `ColorSettingsPanel.tsx` - 顏色數量設定
- `CanvasSizePanel.tsx` - 畫布尺寸控制
- `TileSettingsPanel.tsx` - 磁磚和間隙設定
- `BorderEffectsPanel.tsx` - 邊框和 3D 效果

**共享資源**:
- `types.ts` - TypeScript 類型定義
- `constants.ts` - 常量和配置
- `helpers.ts` - 輔助函數
- `README.md` - 組件文檔

### 2. 工具函數層

#### `colorUtils.ts`
**職責**: 顏色處理和轉換

**核心函數**:
- 顏色格式轉換（RGB ↔ HEX）
- 顏色距離計算
- 顏色量化（Median Cut）
- 調色盤處理

#### `mosaicUtils.ts`
**職責**: 馬賽克幾何計算

**核心函數**:
- 畫布尺寸計算
- 座標轉換
- 邊框偏移計算

#### `segmentMemory.ts`
**職責**: 空間記憶系統

**核心功能**:
- 記錄用戶對特定區域的顏色修改
- 使用 IoU 匹配空間相似度
- 在重新生成時智能應用修改

**技術亮點**:
- Intersection over Union (IoU) 算法
- 空間掩碼（Spatial Mask）
- 自動縮放和匹配

#### `colorDistribution.ts`
**職責**: 顏色分佈分析

**核心功能**:
- 計算顏色距離統計
- 推薦 Delta E 閾值
- 分析調色盤特性

### 3. 狀態管理層

#### `useMosaicHistory.ts`
**職責**: 實現 Undo/Redo 功能

**核心功能**:
- 狀態快照管理
- 歷史棧維護
- Undo/Redo 操作

**實現細節**:
```typescript
interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}
```

### 4. 類型定義層

#### `mosaic/types.ts`
**職責**: 集中管理所有類型定義

**主要類型**:
- 基礎類型（顏色、尺寸、位置）
- 狀態類型（MosaicState）
- 組件 Props 類型
- 事件處理器類型

#### `mosaic/constants.ts`
**職責**: 集中管理所有常量

**常量類別**:
- 默認值（DEFAULTS）
- 顏色配置（DEFAULT_COLORS）
- 閾值（THRESHOLDS）
- 驗證函數（VALIDATION）

## 🔄 數據流

### 1. 圖片上傳流程

```
用戶選擇圖片
    ↓
FileReader 讀取文件
    ↓
創建 HTMLImageElement
    ↓
計算初始畫布尺寸
    ↓
生成馬賽克
```

### 2. 馬賽克生成流程

```
讀取圖片數據 (ImageData)
    ↓
顏色量化 (quantizeColors)
    ↓
提取調色盤 (deduplicatePalette, reducePalette)
    ↓
創建顏色映射 (findClosestColor for each pixel)
    ↓
應用記憶修改 (segmentMemory.applyModifications)
    ↓
更新狀態 (palette, tileColorMap)
    ↓
觸發畫布重繪
```

### 3. 顏色修改流程

```
用戶點擊顏色 → 打開顏色選擇器
    ↓
用戶選擇新顏色
    ↓
記錄修改 (segmentMemory.recordModification)
    ↓
更新調色盤
    ↓
標記已修改 (modifiedColorIndices)
    ↓
添加到歷史 (addToHistory)
    ↓
重繪畫布
```

### 4. 畫布尺寸調整流程

```
用戶修改寬度/高度
    ↓
計算新尺寸 (考慮長寬比)
    ↓
從原圖重新採樣
    ↓
應用記憶修改 (保留用戶修改)
    ↓
更新狀態
    ↓
添加到歷史
    ↓
重繪畫布
```

## 🎯 核心設計原則

### 1. 關注點分離 (Separation of Concerns)

- **UI 組件**: 只負責渲染和用戶交互
- **工具函數**: 純函數，無副作用
- **狀態管理**: 集中在主組件和 hooks
- **記憶系統**: 獨立的類，封裝複雜邏輯

### 2. 單一職責原則 (Single Responsibility)

每個模塊、函數只做一件事：
- `colorUtils.ts` → 顏色處理
- `mosaicUtils.ts` → 幾何計算
- `ColorPalettePanel` → 顯示調色盤

### 3. 依賴倒置 (Dependency Inversion)

高層模塊不依賴低層模塊：
```typescript
// ✅ 好的做法 - 通過 props 傳遞依賴
<ColorPalettePanel 
  palette={palette}
  onColorChange={handleColorChange}
/>

// ❌ 避免 - 組件內部直接修改外部狀態
```

### 4. 開放封閉原則 (Open-Closed)

對擴展開放，對修改封閉：
```typescript
// 通過配置擴展功能
export const DEFAULTS = {
  TILE_SIZE: 20,
  // 添加新配置不影響現有代碼
} as const;
```

## 🔧 關鍵技術實現

### 1. Segment Memory System (空間記憶系統)

**問題**: 當用戶修改某個區域的顏色後，調整畫布大小或重新生成會丟失修改

**解決方案**: 使用空間掩碼和 IoU 匹配

```typescript
// 記錄修改時保存空間信息
recordModification(colorMap, segmentIndex, originalColor, newColor);

// 匹配時使用 IoU 計算相似度
const iou = calculateSegmentIoU(oldMask, newMask);
if (iou > 0.3) {
  // 應用修改
}
```

**優勢**:
- 智能保留用戶意圖
- 處理畫布縮放
- 支持重新生成

### 2. Color Distribution Analysis (顏色分佈分析)

**問題**: 不同圖片的顏色分佈差異很大，固定閾值不適用

**解決方案**: 動態分析調色盤特性

```typescript
const stats = analyzeColorDistribution(palette);
// 使用推薦的閾值
const threshold = stats.recommendedThreshold;
```

**優勢**:
- 自適應不同圖片
- 提供精確和寬鬆兩種閾值
- 基於統計學原理

### 3. Undo/Redo System (歷史記錄系統)

**問題**: 需要支持多步驟撤銷和重做

**解決方案**: 使用雙棧結構

```typescript
interface HistoryState<T> {
  past: T[];      // 過去的狀態
  present: T;     // 當前狀態
  future: T[];    // 未來的狀態（已撤銷）
}
```

**優勢**:
- 無限制的歷史記錄
- 支持任意狀態類型
- 簡單直觀的 API

### 4. Debounced Generation (防抖生成)

**問題**: 用戶快速調整顏色數量時觸發大量計算

**解決方案**: 使用防抖延遲生成

```typescript
useEffect(() => {
  colorChangeTimerRef.current = setTimeout(() => {
    generateMosaic();
  }, THRESHOLDS.COLOR_CHANGE_DEBOUNCE);
}, [numColors]);
```

**優勢**:
- 減少不必要的計算
- 提升性能
- 改善用戶體驗

## 📝 維護檢查清單

### 添加新功能

- [ ] 確定功能屬於哪個模塊
- [ ] 檢查是否可以使用現有工具函數
- [ ] 在 `constants.ts` 中添加相關配置
- [ ] 在 `types.ts` 中定義類型
- [ ] 實現功能
- [ ] 添加到歷史記錄系統（如果需要）
- [ ] 更新相關文檔
- [ ] 編寫測試（如果可能）

### 代碼審查

- [ ] 無 magic numbers（使用常量）
- [ ] 完整的類型註解
- [ ] 無 console.log（調試用）
- [ ] 函數職責單一
- [ ] 清晰的命名
- [ ] 適當的註釋
- [ ] 錯誤處理完善

### 性能優化

- [ ] 使用 `useCallback` 包裝回調函數
- [ ] 使用 `useMemo` 緩存計算結果
- [ ] 避免不必要的重渲染
- [ ] 大量數據使用高效算法
- [ ] 防抖/節流頻繁操作

## 🚀 未來改進方向

### 短期目標

1. **單元測試**: 為工具函數添加完整測試
2. **性能優化**: 優化大尺寸馬賽克生成
3. **錯誤處理**: 改善錯誤提示和恢復
4. **可訪問性**: 添加 ARIA 標籤和鍵盤支持

### 中期目標

1. **導出功能**: 支持更多格式（PDF, JSON）
2. **批處理**: 支持批量生成馬賽克
3. **預設模板**: 提供預設配置模板
4. **雲端保存**: 支持保存和加載項目

### 長期目標

1. **AI 輔助**: 智能顏色建議
2. **協作功能**: 多人協作編輯
3. **插件系統**: 支持第三方擴展
4. **移動端優化**: 改善移動設備體驗

## 📚 相關文檔

- [組件文檔](/src/app/components/mosaic/README.md)
- [工具函數文檔](/src/utils/README.md)
- [Hooks 文檔](/src/hooks/README.md)

## 💡 貢獻指南

1. Fork 項目
2. 創建功能分支
3. 遵循代碼規範
4. 編寫清晰的提交信息
5. 提交 Pull Request

---

**維護者**: 定期回顧和更新本文檔，確保與代碼實現保持一致。