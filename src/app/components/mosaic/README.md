# Mosaic Generator V2 - Code Organization

## 📁 文件結構

```
src/app/components/mosaic/
├── index.ts                    # 統一導出點
├── types.ts                    # TypeScript 類型定義
├── constants.ts                # 常量定義
├── helpers.ts                  # 輔助函數
├── MosaicCanvas.tsx           # 畫布渲染組件
├── ColorPalettePanel.tsx      # 調色盤面板
├── ColorSettingsPanel.tsx     # 顏色設定面板
├── CanvasSizePanel.tsx        # 畫布尺寸面板
├── TileSettingsPanel.tsx      # 磁磚設定面板
└── BorderEffectsPanel.tsx     # 邊框效果面板
```

## 🎯 代碼組織原則

### 1. **關注點分離 (Separation of Concerns)**

- **types.ts**: 所有 TypeScript 類型定義集中管理
- **constants.ts**: 所有常量和配置集中管理
- **helpers.ts**: 純函數工具集，無副作用
- **components/**: UI 組件，專注於渲染和用戶交互

### 2. **避免 Magic Numbers**

❌ **之前：**
```typescript
if (numColors < 2 || numColors > 32) {
  // ...
}
setMosaicWidth(40);
```

✅ **現在：**
```typescript
import { DEFAULTS, VALIDATION } from './mosaic/constants';

if (!VALIDATION.isValidColorCount(numColors)) {
  // ...
}
setMosaicWidth(DEFAULTS.CANVAS_WIDTH);
```

### 3. **類型安全**

❌ **之前：**
```typescript
const [palette, setPalette] = useState<string[]>([]);
const [colorStats, setColorStats] = useState([]);
```

✅ **現在：**
```typescript
import { HexColor, ColorStats } from './mosaic/types';

const [palette, setPalette] = useState<HexColor[]>([]);
const [colorStats, setColorStats] = useState<ColorStats[]>([]);
```

### 4. **可重用函數**

❌ **之前：** 重複的邏輯散落在組件中
```typescript
// 計算顏色統計 - 重複多次
const colorCounts: { [key: string]: number } = {};
colorMap.forEach(row => {
  row.forEach(colorIndex => {
    const color = palette[colorIndex];
    if (color) {
      colorCounts[color] = (colorCounts[color] || 0) + 1;
    }
  });
});
```

✅ **現在：** 提取為可重用函數
```typescript
import { calculateColorStats } from './mosaic/helpers';

const stats = calculateColorStats(colorMap, palette);
```

## 📚 導入規範

### 優先順序

1. **React 相關**
```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
```

2. **第三方庫**
```typescript
import { motion } from 'motion/react';
import { Upload, Download } from 'lucide-react';
```

3. **本地 UI 組件**
```typescript
import { Button } from './ui/button';
import { Card } from './ui/card';
```

4. **類型和常量**
```typescript
import { DEFAULTS, DEFAULT_COLORS } from './mosaic/constants';
import { ColorStats, MosaicState } from './mosaic/types';
```

5. **工具函數**
```typescript
import { calculateColorStats, loadImageFromFile } from './mosaic/helpers';
import { rgbToHex, findClosestColor } from '../../utils/colorUtils';
```

## 🛠️ 常用模式

### 1. 狀態驗證

```typescript
import { validateMosaicState } from './mosaic/helpers';

const { valid, errors } = validateMosaicState({
  mosaicWidth: newWidth,
  numColors: newColorCount,
});

if (!valid) {
  console.error('Invalid state:', errors);
  return;
}
```

### 2. 常量使用

```typescript
import { DEFAULTS, DEFAULT_COLORS } from './mosaic/constants';

// 初始化狀態
const [tileSize, setTileSize] = useState(DEFAULTS.TILE_SIZE);
const [spacingColor, setSpacingColor] = useState(DEFAULT_COLORS.SPACING);

// 驗證範圍
if (value < DEFAULTS.MIN_TILE_SIZE || value > DEFAULTS.MAX_TILE_SIZE) {
  return;
}
```

### 3. 類型註解

```typescript
import { ColorChangeHandler, TileClickHandler } from './mosaic/types';

const handleColorChange: ColorChangeHandler = useCallback(
  (colorIndex, newColor) => {
    // 實現...
  },
  [dependencies]
);
```

## 🔧 維護指南

### 添加新功能

1. **新增常量**: 在 `constants.ts` 中添加
2. **新增類型**: 在 `types.ts` 中定義
3. **新增工具函數**: 在 `helpers.ts` 中實現
4. **新增組件**: 創建新文件並在 `index.ts` 中導出

### 修改現有功能

1. 檢查 `constants.ts` 是否需要更新
2. 檢查 `types.ts` 是否需要更新類型定義
3. 更新相關組件
4. 確保類型安全

### 代碼審查檢查清單

- [ ] 沒有 magic numbers（使用 constants）
- [ ] 所有函數和變量都有正確的類型註解
- [ ] 可重用邏輯已提取到 helpers
- [ ] 導入順序正確
- [ ] 添加了必要的註釋
- [ ] 錯誤處理完善
- [ ] 無 console.log（除非必要）

## 📖 最佳實踐

### ✅ 推薦

```typescript
// 使用常量
import { DEFAULTS } from './mosaic/constants';
const width = DEFAULTS.CANVAS_WIDTH;

// 使用類型
import { ColorStats } from './mosaic/types';
const stats: ColorStats[] = [];

// 使用輔助函數
import { calculateColorStats } from './mosaic/helpers';
const stats = calculateColorStats(colorMap, palette);

// 清晰的函數命名
const handleColorChange = (index: number, color: string) => {
  // ...
};
```

### ❌ 避免

```typescript
// 避免 magic numbers
const width = 40; // 這是什麼？

// 避免 any 類型
const stats: any[] = [];

// 避免重複邏輯
// 如果同樣的代碼出現 3 次以上，應該提取為函數

// 避免模糊的命名
const handleClick = () => {
  // 點擊什麼？
};
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
function myFunction(param1: string, param2: number): string {
  // 實現...
}
```

### 常量組織

```typescript
// 使用 as const 確保類型安全
export const DEFAULTS = {
  TILE_SIZE: 20,
  TILE_SPACING: 2,
} as const;

// 分組相關常量
export const DEFAULT_COLORS = {
  SPACING: '#F5F1E8',
  BORDER: '#A89F91',
} as const;
```

### 類型定義

```typescript
// 使用描述性名稱
export interface ColorStats {
  color: HexColor;
  count: number;
  percentage?: number; // 可選屬性用 ?
}

// 使用 type 定義聯合類型
export type DownloadFormat = 'png' | 'svg';
```

## 🚀 性能考慮

1. **useCallback**: 包裝傳遞給子組件的函數
2. **useMemo**: 緩存計算結果
3. **React.memo**: 優化組件重渲染
4. **常量提取**: 避免重複創建對象

## 📝 測試建議

1. **單元測試**: 測試 `helpers.ts` 中的純函數
2. **組件測試**: 測試 UI 組件的渲染和交互
3. **集成測試**: 測試完整的用戶流程

---

**維護者**: 確保任何修改都遵循以上原則，保持代碼庫的一致性和可維護性。

**參考文檔**:
- [MOSAIC_DEVELOPMENT_LOG.md](/MOSAIC_DEVELOPMENT_LOG.md) - 問題記錄和解決方案（詳細記錄12個重大問題、失敗嘗試及核心創新）

**最後更新**: 2026-01-13