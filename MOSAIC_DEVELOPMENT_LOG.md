# Mosaic Generator - 開發日誌

> 記錄馬賽克生成器開發過程中遇到的重大問題、多次失敗的解法及最終解決邏輯

---

## 📋 目錄

- [核心架構：ColorMap Index Mapping 系統](#核心架構colormap-index-mapping-系統)
- [問題 #1: 調色後改變畫布大小導致顏色混亂](#問題-1-調色後改變畫布大小導致顏色混亂)
- [問題 #2: 合併顏色後Undo/Redo導致numColors不同步](#問題-2-合併顏色後undoredo導致numcolors不同步)
- [問題 #3: History閉包陷阱 - 記錄舊的colorMap](#問題-3-history閉包陷阱---記錄舊的colormap)
- [問題 #4: 改變畫布尺寸後上傳新圖顯示舊尺寸](#問題-4-改變畫布尺寸後上傳新圖顯示舊尺寸)
- [問題 #5: SegmentMemory設計 - 空間記憶vs顏色映射](#問題-5-segmentmemory設計---空間記憶vs顏色映射)
- [問題 #6: selectedColorGroup越界導致崩潰](#問題-6-selectedcolorgroup越界導致崩潰)
- [問題 #7: useEffect依賴循環導致無限重繪](#問題-7-useeffect依賴循環導致無限重繪)
- [問題 #8: 減少顏色數量時用戶修改的顏色被移除](#問題-8-減少顏色數量時用戶修改的顏色被移除)
- [問題 #9: 上傳新圖時舊圖的SegmentMemory污染新圖](#問題-9-上傳新圖時舊圖的segmentmemory污染新圖)
- [問題 #10: 畫布尺寸改變後Undo導致尺寸錯亂](#問題-10-畫布尺寸改變後undo導致尺寸錯亂)
- [問題 #11: 合併顏色時使用錯誤的調色盤導致重新分離](#問題-11-合併顏色時使用錯誤的調色盤導致重新分離)
- [問題 #12: numColors與palette.length不同步](#問題-12-numcolors與palettelength不同步)
- [問題 #13: PNG透明度支援 - 畫布調整與色票選擇](#問題-13-png透明度支援---畫布調整與色票選擇)
- [問題 #14: 顏色合併 + 畫布調整後顏色跑回原色](#問題-14-顏色合併--畫布調整後顏色跑回原色)
- [問題 #15: 合併顏色後調整顏色數量出現重複顏色](#問題-15-合併顏色後調整顏色數量出現重複顏色)
- [改革 #1: V1 到 V2 模塊化重構](#改革-1-v1-到-v2-模塊化重構)

---

## 核心架構：ColorMap Index Mapping 系統

### 🎯 設計原理

**時間**: 2026-01-10

**核心概念**:

```typescript
// colorMap 存儲的是「調色盤索引」，而不是「顏色值」
tileColorMap: number[][]  // 每個元素是 palette 的索引 (0, 1, 2, 3...)
palette: string[]         // 實際的顏色值 ["#E8B4B8", "#E8D5C4", ...]

// 例如：
colorMap[10][15] = 2     // 第(15,10)個磁磚使用調色盤中的第2號顏色
palette[2] = "#E8B4B8"   // 第2號顏色是塵粉玫瑰色
```

### 為什麼這樣設計？

**錯誤方案（直接存顏色值）**:

```typescript
// ❌ 方案 A: 直接存顏色字符串
colorMap: string[][]  // [["#E8B4B8", "#E8D5C4", ...], ...]

// 問題：
// 1. 用戶改變調色盤中的顏色 → 需要遍歷整個 colorMap 替換所有顏色值 → O(width * height)
// 2. 改變畫布大小時重新取樣 → 找不到最近的顏色（因為調色盤已變）
// 3. 合併顏色時 → 需要替換所有使用該顏色的磁磚
// 4. 記憶體浪費 → 每個磁磚存7字節（#E8B4B8）vs 1字節（索引）
```

**正確方案（索引映射）**:

```typescript
// ✅ 方案 B: 存調色盤索引
colorMap: number[][]  // [[2, 0, 1, ...], ...]
palette: string[]     // ["#E8B4B8", "#E8D5C4", "#A89F91", "#B4C7B4"]

// 優勢：
// 1. 改變調色盤顏色 → 只需修改 palette[index] → O(1)
// 2. 改變畫布大小 → 重新取樣時使用相同的 palette → 顏色不會跑掉
// 3. 合併顏色 → 只需修改 palette 和重映射 colorMap 索引
// 4. 節省記憶體 → 100x100 = 10,000 tiles * 1 byte vs 70,000 bytes
```

### 關鍵操作邏輯

#### 1. 改變調色盤顏色

```typescript
// 用戶改變第2號顏色
const handleColorChange = (
  colorIndex: number,
  newColor: string,
) => {
  const newPalette = [...palette];
  newPalette[colorIndex] = newColor; // ✅ O(1) 操作
  setPalette(newPalette);
  // colorMap 不需要改變！所有使用索引2的磁磚自動使用新顏色
};
```

#### 2. 改變畫布大小（關鍵！）

```typescript
const handleSizeChange = (
  newWidth: number,
  newHeight: number,
) => {
  // 重新取樣圖片
  const newColorMap = resampleImage(image, newWidth, newHeight);

  // 🔥 關鍵：使用「當前」的 palette（包含用戶的修改）
  // 而不是重新生成新的 palette
  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const pixel = getPixel(image, x, y);
      // 找到當前調色盤中最接近的顏色
      const closestIndex = findClosestColor(pixel, palette); // ✅ 使用現有 palette
      newColorMap[y][x] = closestIndex;
    }
  }

  setTileColorMap(newColorMap);
  // palette 保持不變 → 用戶調整的顏色不會丟失！
};
```

#### 3. 合併顏色

```typescript
const handleMergeColors = (
  colorIndices: number[],
  targetColor: string,
) => {
  // 創建新調色盤（移除被合併的顏色）
  const newPalette = palette.filter(
    (_, i) => !colorIndices.slice(1).includes(i),
  );
  newPalette[colorIndices[0]] = targetColor; // 保留第一個，設為目標顏色

  // 重映射 colorMap 索引
  const indexMapping = createIndexMapping(
    colorIndices,
    palette.length,
    newPalette.length,
  );
  const newColorMap = tileColorMap.map((row) =>
    row.map((oldIndex) => indexMapping[oldIndex]),
  );

  setPalette(newPalette);
  setTileColorMap(newColorMap);
  setNumColors(newPalette.length); // 🔥 關鍵：同步 numColors
};
```

### 🎓 設計哲學

1. **間接尋址**: Index Mapping 是間接尋址的典型應用
2. **數據分離**: 數據（colorMap）和樣式（palette）分離
3. **單一真相來源**: palette 是顏色的唯一來源
4. **高效更新**: 只需更新 palette，不需遍歷 colorMap

---

## 問題 #1: 調色後改變畫布大小導致顏色混亂

### 🔴 問題描述

**時間**: 2026-01-10

**現象**:

```
1. 用戶上傳圖片 → 生成 40x40 馬賽克
2. 用戶調整調色盤：將第2號顏色從 #E8D5C4 改為 #FF0000（紅色）
3. 用戶改變畫布大小：40x40 → 60x60
4. 🔥 問題：紅色消失，變回原來的 #E8D5C4
```

**用戶反饋**: "我辛苦調整的顏色全部消失了！"

### 🔍 錯誤嘗試記錄

#### ❌ 嘗試 1: 儲存「顏色→顏色」映射

```typescript
// 想法：記錄用戶改了哪些顏色
const colorMapping = {
  "#E8D5C4": "#FF0000", // 原色 → 新色
};

// 改變畫布大小時應用映射
const handleSizeChange = () => {
  const newPalette = generatePaletteFromImage(image, numColors);
  const mappedPalette = newPalette.map(
    (color) => colorMapping[color] || color,
  );
  setPalette(mappedPalette);
};

// ❌ 失敗原因：
// 1. 新圖片重新取樣後，顏色值會略有不同（#E8D5C4 → #E8D4C3）
// 2. 映射無法匹配 → 顏色修改丟失
// 3. 如果用戶合併顏色，原色不再存在 → 映射失效
```

#### ❌ 嘗試 2: 儲存「索引→顏色」映射

```typescript
// 想法：記錄每個索引位置的顏色
const indexColorMap = {
  0: "#E8B4B8",
  1: "#E8D5C4",
  2: "#FF0000", // 用戶修改
  3: "#B4C7B4",
};

// 改變畫布大小時
const handleSizeChange = () => {
  const newPalette = generatePaletteFromImage(image, numColors);
  const restoredPalette = newPalette.map(
    (_, i) => indexColorMap[i] || newPalette[i],
  );
  setPalette(restoredPalette);
};

// ❌ 失敗原因：
// 1. 改變顏色數量時索引會改變（4色 → 6色，索引2可能變成索引3）
// 2. 合併顏色後索引映射完全錯亂
// 3. 無法處理顏色數量增加的情況
```

#### ❌ 嘗試 3: 深拷貝整個狀態

```typescript
// 想法：儲存用戶修改前的完整狀態
const originalState = {
  palette: [...palette],
  colorMap: colorMap.map((row) => [...row]),
};

// 改變畫布大小時
const handleSizeChange = () => {
  // 回復到原始狀態，然後重新取樣
  const newColorMap = resampleWithOriginalPalette(
    originalState.palette,
  );
  // ...
};

// ❌ 失敗原因：
// 1. 如果用戶合併了顏色，originalState 已經過時
// 2. 無法區分哪些是用戶的主動修改，哪些是自動生成
// 3. 記憶體浪費巨大
```

### ✅ 最終解決方案

**核心洞察**:

> 不要儲存「哪些顏色被修改」，而是確保「改變畫布大小時使用現有的palette」

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 1113

const handleSizeChange = useCallback(
  (newWidth: number, newHeight: number) => {
    // ... 其他邏輯 ...

    // 🔥 FIX: Use current palette (reflects merged colors) instead of originalPaletteSnapshot
    // This prevents merged colors from being re-separated during resize
    // Segment memory still works because it matches based on spatial position, not color index
    const resamplePalette = palette; // ✅ 使用當前的 palette，包含所有用戶修改

    const newColorMap: number[][] = [];
    for (let y = 0; y < newHeight; y++) {
      newColorMap[y] = [];
      for (let x = 0; x < newWidth; x++) {
        const srcX = Math.floor((x / newWidth) * image.width);
        const srcY = Math.floor((y / newHeight) * image.height);

        const pixel = getPixel(imageData, srcX, srcY);
        const [r, g, b] = pixel;

        // 找到當前調色盤中最接近的顏色
        const colorIndex = findClosestColor(
          r,
          g,
          b,
          resamplePalette,
        ); // ✅ 使用現有 palette
        newColorMap[y][x] = colorIndex;
      }
    }

    setTileColorMap(newColorMap);
    setPalette(resamplePalette); // ✅ palette 保持不變

    // ...
  },
  [palette, image],
); // ✅ 依賴 palette，確保使用最新值
```

**為什麼這樣有效**:

```
1. colorMap 存的是索引，不是顏色值
2. 改變畫布大小 → 重新生成 colorMap
3. 但使用「當前」的 palette（包含用戶修改）
4. 重新找最接近的顏色 → 索引可能不同，但顏色相同
5. 用戶看到的顏色不變！✅
```

### 📊 驗證結果

**測試場景**:

| 操作                 | 錯誤方案     | 正確方案    |
| -------------------- | ------------ | ----------- |
| 調色 → 改尺寸        | ❌ 顏色重置  | ✅ 顏色保持 |
| 合併 → 改尺寸        | ❌ 分離回4色 | ✅ 保持合併 |
| 增色 → 調色 → 改尺寸 | ❌ 混亂      | ✅ 正確     |
| 減色 → 改尺寸        | ❌ 索引錯誤  | ✅ 正確     |

### 🎓 經驗教訓

1. **不要儲存變更歷史，保持當前狀態**: 儲存當前完整狀態比記錄變更容易得多
2. **Index Mapping 的威力**: 間接尋址解決了顏色和位置的解耦
3. **失敗嘗試很寶貴**: 3次失敗嘗試幫助理解問題本質
4. **用戶視角思考**: 用戶在意的是「我看到的顏色」，不是「索引幾號」

---

## 問題 #2: 合併顏色後Undo/Redo導致numColors不同步

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```
1. 初始狀態：4 色調色盤，numColors = 4
2. 用戶合併顏色 2 和 3 → 變成 3 色
3. palette.length = 3，但 numColors 仍然是 4 ❌
4. Undo/Redo → 狀態混亂，selectedColorGroup 越界
```

**錯誤日誌**:

```
ERROR: Cannot read property 'color' of undefined
→ 因為 selectedColorGroup = 3，但 palette.length = 3（索引只到 2）
```

### 🔍 錯誤嘗試記錄

#### ❌ 嘗試 1: 手動同步 numColors

```typescript
const handleMergeColors = () => {
  // 合併邏輯...
  const newPalette = mergeColors(palette, selectedIndices);
  setPalette(newPalette);

  // ❌ 忘記更新 numColors
  // setNumColors(newPalette.length);  // 漏掉這行！
};

// ❌ 失敗原因：太容易忘記，代碼中有10+處需要同步
```

#### ❌ 嘗試 2: 只在History中記錄 palette.length

```typescript
addToHistory({
  palette: newPalette,
  colorMap: newColorMap,
  numColors: newPalette.length, // ✅ 這裡記錄了
  // ...
});

// 但在其他地方忘記同步
const handleColorChange = () => {
  setPalette(newPalette);
  // ❌ 忘記：setNumColors(newPalette.length);
};

// ❌ 失敗原因：部分同步，部分遺漏
```

### ✅ 最終解決方案

**方案 A: 全局搜索並修復所有 addToHistory**

```typescript
// 🔥 CRITICAL: Use actual palette.length instead of numColors state
// This ensures history records the correct color count after merges

// 位置 1: 合併顏色 (Line 642)
setNumColors(newPalette.length);
setPrevNumColors(newPalette.length);

addToHistory({
  colorMap: newColorMap,
  palette: newPalette,
  numColors: newPalette.length, // ✅ 使用 palette.length
  // ...
});

// 位置 2: 改變調色盤 (Line 668)
addToHistory({
  colorMap: newColorMap,
  palette: newPalette,
  numColors: newPalette.length, // ✅ 使用 palette.length
  // ...
});

// 位置 3: 改變畫布尺寸 (Line 1148)
addToHistory({
  colorMap: newColorMap,
  palette: finalPalette,
  numColors: finalPalette.length, // ✅ 使用實際長度
  // ...
});

// ... 共修復 10+ 處
```

**方案 B: Undo 時重置 selectedColorGroup**

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 161

const applyStateFromHistory = (state: any) => {
  setTileColorMap(state.colorMap);
  setPalette(state.palette);
  setNumColors(state.numColors);
  setPrevNumColors(state.numColors); // ✅ 也更新 prevNumColors

  // CRITICAL: Reset selectedColorGroup if it's out of bounds
  // This can happen when undoing a color merge operation
  setSelectedColorGroup((prev) => {
    if (prev !== null && prev >= state.palette.length) {
      return null; // ✅ 越界則清空選擇
    }
    return prev;
  });

  // ...
};
```

### 📊 驗證結果

**測試場景**:

| 操作          | 修復前                           | 修復後      |
| ------------- | -------------------------------- | ----------- |
| 合併 4→3 色   | numColors=4, palette.length=3 ❌ | 一致 ✅     |
| Undo 合併     | selectedColorGroup=3 越界 ❌     | 自動清空 ✅ |
| Redo 合併     | 狀態混亂 ❌                      | 正確 ✅     |
| 連續合併 2 次 | numColors 錯誤累積 ❌            | 正確 ✅     |

### 🎓 經驗教訓

1. **Single Source of Truth**: palette.length 應該是唯一的顏色數量來源
2. **全局搜索很重要**: 使用 IDE 全局搜索 `addToHistory` 找到所有需要修復的地方
3. **防禦性編程**: selectedColorGroup 越界檢查避免崩潰
4. **同步兩個相關狀態很危險**: numColors 和 palette.length 應該永遠一致

---

## 問題 #3: History閉包陷阱 - 記錄舊的colorMap

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```typescript
const handleColorChange = (index, newColor) => {
  const newPalette = [...palette];
  newPalette[index] = newColor;
  setPalette(newPalette);

  // 防抖，100ms 後記錄歷史
  setTimeout(() => {
    addToHistory({
      colorMap: tileColorMap, // 🔥 問題！這是閉包捕獲的「舊值」
      palette: newPalette,
      // ...
    });
  }, 100);
};

// 場景：
// 1. 用戶快速改變顏色 A → B → C
// 2. 三個 setTimeout 同時觸發
// 3. 都捕獲到最初的 tileColorMap
// 4. History 記錄 3 次相同的 colorMap ❌
```

### 🔍 錯誤嘗試記錄

#### ❌ 嘗試 1: 使用 useRef

```typescript
const colorMapRef = useRef(tileColorMap);

useEffect(() => {
  colorMapRef.current = tileColorMap;
}, [tileColorMap]);

const handleColorChange = () => {
  setTimeout(() => {
    addToHistory({
      colorMap: colorMapRef.current, // ❌ 仍然是閉包問題
      // ...
    });
  }, 100);
};

// ❌ 失敗原因：ref 在 setTimeout 觸發時可能已經更新為更新的值
```

#### ❌ 嘗試 2: 使用函數形式的 setState

```typescript
const handleColorChange = () => {
  setTimeout(() => {
    setHistory((prev) => {
      // 這裡可以訪問最新的 history
      // 但無法訪問最新的 tileColorMap ❌
    });
  }, 100);
};

// ❌ 失敗原因：只能訪問 history 狀態，無法訪問其他狀態
```

### ✅ 最終解決方案

**立即捕獲副本，延遲記錄**:

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 692

const handleColorChange = (
  colorIndex: number,
  newColor: string,
) => {
  // 更新調色盤
  const newPalette = [...palette];
  newPalette[colorIndex] = newColor;
  setPalette(newPalette);

  // 防抖
  if (colorChangeTimerRef.current) {
    clearTimeout(colorChangeTimerRef.current);
  }

  // 🔥 CRITICAL: Capture colorMap NOW (outside setTimeout) to avoid closure issues
  const colorMapCopy = tileColorMap.map((row) => [...row]); // ✅ 立即深拷貝

  colorChangeTimerRef.current = setTimeout(() => {
    addToHistory({
      colorMap: colorMapCopy, // ✅ 使用捕獲的副本，不是閉包變量
      palette: newPalette,
      numColors: newPalette.length,
      // ...
    });
  }, 100);
};
```

**為什麼有效**:

```
1. 立即深拷貝 colorMap（在 setTimeout 外）
2. setTimeout 捕獲的是「拷貝」，不是「引用」
3. 即使後續 tileColorMap 改變，拷貝不受影響
4. 每次調用都捕獲當時的狀態 ✅
```

### 📊 驗證結果

**測試場景**:

| 場景               | 修復前                    | 修復後                   |
| ------------------ | ------------------------- | ------------------------ |
| 快速改變顏色 A→B→C | 記錄 3 次相同 colorMap ❌ | 正確記錄 3 個不同狀態 ✅ |
| 改色後立即 Undo    | Undo 到錯誤狀態 ❌        | 正確 Undo ✅             |
| 連續合併顏色       | History 混亂 ❌           | 正確 ✅                  |

### 🎓 經驗教訓

1. **閉包陷阱**: setTimeout/setInterval 中使用狀態變量時要特別小心
2. **立即捕獲**: 需要記錄的狀態應該在函數開始時立即深拷貝
3. **引用 vs 值**: 數組/對象要深拷貝，不能直接使用引用
4. **useRef 不是萬能的**: useRef 無法解決所有閉包問題

---

## 問題 #4: 改變畫布尺寸後上傳新圖顯示舊尺寸

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```
1. 用戶上傳圖片 A → 自動 40x40
2. 用戶手動改為 14x7
3. 用戶上傳新圖片 B
4. 🔥 問題：新圖仍然顯示 14x7，不是預期的 40x40
```

**用戶反饋**: "為什麼新圖片還是用舊的尺寸？"

### 🔍 錯誤嘗試記錄

#### ❌ 嘗試 1: 直接重置尺寸狀態

```typescript
const handleImageUpload = (newImage) => {
  setImage(newImage);
  setMosaicWidth(40); // ❌ 直接設置
  setMosaicHeight(40);

  // 觸發 useEffect 重新生成馬賽克
};

// ❌ 失敗原因：
// useEffect 依賴 [image, numColors]
// 尺寸改變不會觸發重新生成
```

#### ❌ 嘗試 2: 添加尺寸到 useEffect 依賴

```typescript
useEffect(() => {
  if (!image) return;

  // 生成馬賽克...
}, [image, numColors, mosaicWidth, mosaicHeight]); // ❌ 添加尺寸依賴

// ❌ 失敗原因：
// 1. 用戶手動改變尺寸 → 觸發重新生成（錯誤！）
// 2. 應該只在「上傳新圖」時重置，不是「改變尺寸」時
// 3. 導致無限循環重繪
```

### ✅ 最終解決方案

**使用標誌位區分「新圖」和「改尺寸」**:

```typescript
// src/app/components/MosaicGeneratorV2.tsx

// 標誌：圖片是否改變
const [imageChanged, setImageChanged] = useState(false);

// 上傳新圖時
const handleImageUpload = (file) => {
  const img = loadImage(file);
  setImage(img);
  setImageChanged(true); // ✅ 標記為新圖

  // 計算新圖的目標尺寸
  const targetWidth = Math.max(
    20,
    Math.min(40, Math.floor(img.width / 10)),
  );
  const targetHeight = Math.max(
    20,
    Math.min(40, Math.floor(img.height / 10)),
  );

  // 存儲到 ref，供 useEffect 使用
  pendingDimensionsRef.current = {
    width: targetWidth,
    height: targetHeight,
  };
};

// useEffect 生成馬賽克
useEffect(() => {
  if (!image || isGenerating) return;

  setIsGenerating(true);

  setTimeout(() => {
    if (imageChanged) {
      // ✅ 新圖：使用 ref 中的目標尺寸
      const { width, height } =
        pendingDimensionsRef.current || {
          width: 40,
          height: 40,
        };

      setMosaicWidth(width);
      setMosaicHeight(height);

      // 生成馬賽克...

      setImageChanged(false); // ✅ 重置標誌
    } else {
      // ✅ 非新圖（改顏色數量）：使用當前尺寸
      // 生成馬賽克...
    }

    setIsGenerating(false);
  }, 0);
}, [image, numColors, imageChanged]); // ✅ 依賴 imageChanged 標誌
```

**Canvas 尺寸同步**:

```typescript
// src/app/components/mosaic/MosaicCanvas.tsx - Line 335

useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const width = mosaicWidth * (tileSize + tileSpacing);
  const height = mosaicHeight * (tileSize + tileSpacing);

  canvas.width = width;
  canvas.height = height;

  // 🔥 CRITICAL: Force redraw immediately after canvas size changes
  // This fixes the bug where new images show old dimensions (e.g., 14x7 instead of 40x40)
  drawMosaic(); // ✅ 強制重繪
}, [
  mosaicWidth,
  mosaicHeight,
  tileSize,
  tileSpacing,
  borderEnabled,
  borderWidth,
  drawMosaic,
]);
```

### 📊 驗證結果

**測試場景**:

| 操作                                    | 修復前      | 修復後      |
| --------------------------------------- | ----------- | ----------- |
| 上傳圖 A (40x40) → 改為 14x7 → 上傳圖 B | 14x7 ❌     | 40x40 ✅    |
| 上傳圖 A → 改為 60x60 → 上傳圖 B        | 60x60 ❌    | 40x40 ✅    |
| 只改變顏色數量                          | 尺寸重置 ❌ | 尺寸保持 ✅ |

### 🎓 經驗教訓

1. **標誌位模式**: 用布爾標誌區分不同的觸發原因
2. **useRef 存儲臨時值**: ref 不會觸發重渲染，適合存儲臨時數據
3. **useEffect 依賴要精確**: 不要把所有相關狀態都加到依賴中
4. **強制重繪**: Canvas 尺寸改變後需要手動觸發重繪

---

## 問題 #5: SegmentMemory設計 - 空間記憶vs顏色映射

### 🎯 核心挑戰

**時間**: 2026-01-11

**問題場景**:

```
1. 用戶上傳圖片 → 自動分割為 4 色
2. 用戶手動調整：將「天空」區域從藍色改為粉色
3. 用戶增加顏色數量：4 色 → 6 色
4. 系統重新分割圖片（K-means 聚類）
5. 🔥 問題：「天空」區域變回藍色（用戶修改丟失）
```

**核心挑戰**:

> 如何在「重新分割圖片」後，記住用戶對「特定空間區域」的顏色修改？

### 🔍 錯誤嘗試記錄

#### ❌ 嘗試 1: 顏色到顏色的映射

```typescript
// 想法：記錄「原色 → 新色」的映射
interface ColorMapping {
  originalColor: string; // "#0000FF" (藍色)
  newColor: string; // "#FF69B4" (粉色)
}

const colorMappings: ColorMapping[] = [
  { originalColor: "#0000FF", newColor: "#FF69B4" },
];

// 重新分割後應用映射
const applyColorMappings = (newPalette: string[]) => {
  return newPalette.map((color) => {
    const mapping = colorMappings.find(
      (m) => m.originalColor === color,
    );
    return mapping ? mapping.newColor : color;
  });
};

// ❌ 失敗原因：
// 1. 重新分割後，藍色可能分成「深藍」和「淺藍」兩種
// 2. 只有一個映射 "#0000FF" → 粉色
// 3. 新的「深藍」和「淺藍」無法匹配 → 映射失效
// 4. 如果「草地」原本也是類似的藍綠色，也會被誤改成粉色
```

#### ❌ 嘗試 2: 索引到顏色的映射

```typescript
// 想法：記錄「調色盤索引 → 顏色」的映射
interface IndexMapping {
  paletteIndex: number; // 2 (第2號顏色)
  newColor: string; // "#FF69B4" (粉色)
}

const indexMappings: IndexMapping[] = [
  { paletteIndex: 2, newColor: "#FF69B4" },
];

// ❌ 失敗原因：
// 1. 4色 → 6色，索引全部重排
// 2. 原來的索引 2 可能變成索引 3 或 4
// 3. 索引映射完全失效
```

#### ❌ 嘗試 3: 像素位置到顏色的映射

```typescript
// 想法：記錄每個像素的顏色修改
interface PixelModification {
  x: number;
  y: number;
  newColor: string;
}

const pixelMods: PixelModification[] = [
  { x: 10, y: 5, newColor: "#FF69B4" },
  { x: 10, y: 6, newColor: "#FF69B4" },
  // ... 可能有幾千個像素
];

// ❌ 失敗原因：
// 1. 改變畫布尺寸時像素位置改變（40x40 → 60x60）
// 2. 需要記錄成千上萬個像素 → 記憶體爆炸
// 3. 性能極差
```

### ✅ 最終解決方案：SegmentMemory（空間記憶系統）

**核心洞察**:

> 記錄的不是「顏色」或「索引」，而是「空間區域」的形狀和位置

#### 設計原理

```typescript
// src/utils/segmentMemory.ts

export interface SegmentMask {
  // 二進制遮罩 - 記錄區域的「形狀」
  mask: boolean[][]; // mask[y][x] = true 表示該像素屬於此區域
  width: number;
  height: number;
}

export interface SegmentModification {
  // 原始區域的空間遮罩（形狀 + 位置）
  segmentMask: SegmentMask;

  // 原始顏色（用於驗證）
  originalColor: string;

  // 用戶修改後的顏色
  modifiedColor: string;

  // 時間戳
  timestamp: number;
}
```

#### 關鍵算法：IoU (Intersection over Union)

```typescript
/**
 * 計算兩個區域的空間相似度
 * IoU = (交集面積) / (聯集面積)
 *
 * 例如：
 *   區域 A: ███░░    區域 B: ░███░
 *           ███░░            ░███░
 *
 *   交集:   ░█░░░    聯集:   ████░
 *           ░█░░░            ████░
 *
 *   IoU = 2 / 8 = 0.25
 */
function calculateSegmentIoU(
  mask1: SegmentMask,
  mask2: SegmentMask,
): number {
  // 1. 將兩個遮罩放大到相同尺寸（保持比例）
  const targetWidth = Math.max(mask1.width, mask2.width);
  const targetHeight = Math.max(mask1.height, mask2.height);

  const resized1 = resizeMask(mask1, targetWidth, targetHeight);
  const resized2 = resizeMask(mask2, targetWidth, targetHeight);

  // 2. 計算交集和聯集
  let intersection = 0;
  let union = 0;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const a = resized1[y][x];
      const b = resized2[y][x];

      if (a && b) intersection++; // 都是 true → 交集
      if (a || b) union++; // 至少一個 true → 聯集
    }
  }

  return union === 0 ? 0 : intersection / union;
}
```

#### 完整工作流程

```typescript
export class SegmentMemory {
  private modifications: SegmentModification[] = [];

  /**
   * 步驟 1: 記錄用戶的顏色修改
   */
  recordModification(
    colorMap: number[][],
    segmentIndex: number,
    originalColor: string,
    newColor: string,
  ): void {
    // 創建當前區域的空間遮罩
    const segmentMask = createSegmentMask(
      colorMap,
      segmentIndex,
    );

    // 檢查是否已經有相同區域的修改（IoU > 0.9）
    const existingIndex = this.modifications.findIndex(
      (mod) => {
        const iou = calculateSegmentIoU(
          mod.segmentMask,
          segmentMask,
        );
        return iou > 0.9; // 90% 相似 → 認為是同一區域
      },
    );

    if (existingIndex !== -1) {
      // 更新現有修改
      this.modifications[existingIndex] = {
        segmentMask,
        originalColor,
        modifiedColor: newColor,
        timestamp: Date.now(),
      };
    } else {
      // 添加新修改
      this.modifications.push({
        segmentMask,
        originalColor,
        modifiedColor: newColor,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 步驟 2: 重新分割後，找到匹配的區域並應用修改
   */
  applyModificationsToPalette(
    newColorMap: number[][],
    newPalette: string[],
  ): string[] {
    if (this.modifications.length === 0) {
      return newPalette; // 沒有修改，直接返回
    }

    const modifiedPalette = [...newPalette];

    // 對於新調色盤中的每個區域
    for (
      let segmentIndex = 0;
      segmentIndex < newPalette.length;
      segmentIndex++
    ) {
      // 創建新區域的遮罩
      const newSegmentMask = createSegmentMask(
        newColorMap,
        segmentIndex,
      );

      // 在所有記錄的修改中找最匹配的
      let bestMatch: SegmentModification | null = null;
      let bestIoU = 0;

      for (const mod of this.modifications) {
        const iou = calculateSegmentIoU(
          mod.segmentMask,
          newSegmentMask,
        );
        if (iou > bestIoU) {
          bestIoU = iou;
          bestMatch = mod;
        }
      }

      // 如果 IoU > 0.3（至少 30% 重疊），應用修改
      if (bestIoU > 0.3 && bestMatch) {
        modifiedPalette[segmentIndex] = bestMatch.modifiedColor;
      }
    }

    return modifiedPalette;
  }
}
```

### 📊 為什麼 SegmentMemory 有效

**案例分析**:

```
原始圖片（4 色）:
┌─────────────────┐
│ 天空 (藍色)      │ ← 用戶改為粉色
│                 │
├─────────────────┤
│ 草地 (綠色)      │
├─────────────────┤
│ 樹  (深綠)       │
└─────────────────┘

SegmentMemory 記錄：
- segmentMask: 天空區域的形狀（上半部分）
- modifiedColor: 粉色

增加到 6 色後重新分割：
┌─────────────────┐
│ 天空淺藍         │ ← IoU 與「天空」高 → 應用粉色 ✅
├─────────────────┤
│ 天空深藍         │ ← IoU 與「天空」高 → 應用粉色 ✅
├─────────────────┤
│ 草地淺綠         │ ← IoU 與「天空」低 → 不變
├─────────────────┤
│ 草地深綠         │
├─────────────────┤
│ 樹幹            │
└─────────────────┘

結果：天空仍然是粉色，即使分成了 2 個新區域！✅
```

### 📊 驗證結果

**測試場景**:

| 場景             | 顏色映射方案 | SegmentMemory |
| ---------------- | ------------ | ------------- |
| 改色後增加顏色數 | ❌ 修改丟失  | ✅ 保持       |
| 改色後改畫布尺寸 | ❌ 位置錯位  | ✅ 自動縮放   |
| 合併顏色後改尺寸 | ❌ 分離      | ✅ 保持合併   |
| 多次修改同一區域 | ❌ 記錄膨脹  | ✅ 自動更新   |

### 🎓 經驗教訓

1. **空間記憶優於顏色映射**: 記錄「哪裡」比記錄「什麼顏色」更可靠
2. **IoU 是關鍵**: 空間相似度計算讓區域匹配變得可能
3. **自適應縮放**: 遮罩可以縮放到任意尺寸，適應畫布大小變化
4. **閾值很重要**: IoU > 0.3 是經過測試的最佳閾值

---

## 問題 #6: selectedColorGroup越界導致崩潰

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```
1. 4 色調色盤，selectedColorGroup = 3
2. 用戶合併兩個顏色 → palette.length = 3
3. 🔥 崩潰：palette[3] is undefined
```

**錯誤堆棧**:

```
TypeError: Cannot read property 'color' of undefined
  at ColorPalette.render
  → 因為訪問 palette[selectedColorGroup]，但索引越界
```

### ✅ 解決方案

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 161

const applyStateFromHistory = (state: any) => {
  // ... 其他狀態更新 ...

  // CRITICAL: Reset selectedColorGroup if it's out of bounds
  // This can happen when undoing a color merge operation
  setSelectedColorGroup((prev) => {
    if (prev !== null && prev >= state.palette.length) {
      return null; // ✅ 越界則清空選擇
    }
    return prev;
  });
};

// 同樣在合併顏色時
const handleMergeColors = () => {
  // ... 合併邏輯 ...

  setNumColors(newPalette.length);

  // ✅ 如果當前選擇的顏色被合併了，清空選擇
  setSelectedColorGroup((prev) => {
    if (prev !== null && prev >= newPalette.length) {
      return null;
    }
    return prev;
  });
};
```

### 🎓 經驗教訓

1. **邊界檢查**: 數組索引訪問前必須檢查邊界
2. **級聯效應**: 一個狀態改變可能影響多個其他狀態
3. **函數式 setState**: 使用 `prev => ...` 確保基於最新值更新

---

## 問題 #7: useEffect依賴循環導致無限重繪

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```typescript
// ❌ 錯誤的依賴設置
useEffect(() => {
  // 生成馬賽克...
  const newColorMap = generateMosaic(
    image,
    mosaicWidth,
    mosaicHeight,
  );
  setTileColorMap(newColorMap); // 🔥 更新狀態
}, [image, numColors, mosaicWidth, mosaicHeight, tileColorMap]); // ❌ 依賴 tileColorMap

// 循環：
// tileColorMap 改變 → 觸發 useEffect → setTileColorMap → tileColorMap 改變 → ...
```

### ✅ 解決方案

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 1053

useEffect(() => {
  if (!image || isGenerating) return;

  setIsGenerating(true);

  setTimeout(() => {
    // 生成馬賽克...
    setIsGenerating(false);
  }, 0);
}, [image, numColors, imageChanged]);
// ✅ 移除 mosaicWidth 和 mosaicHeight
// 尺寸改變通過 onSizeChange 回調處理，不觸發此 useEffect
```

### 🎓 經驗教訓

1. **依賴最小化**: 只包含真正需要觸發重算的依賴
2. **分離關注點**: 不同的觸發條件用不同的 useEffect
3. **防抖標誌**: 使用 `isGenerating` 防止重複觸發

---

## 問題 #8: 減少顏色數量時用戶修改的顏色被移除

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```
1. 6 色調色盤
2. 用戶精心調整第 5 號顏色為特殊的粉色
3. 用戶減少顏色：6 色 → 4 色
4. 🔥 問題：第 5 號顏色被刪除（因為使用次數最少）
```

**用戶反饋**: "我調整的顏色不見了！"

### ✅ 解決方案

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 253

const reducePaletteByUsage = useCallback(
  (
    currentPalette: string[],
    currentColorMap: number[][],
    targetCount: number,
    userModifiedIndices: Set<number>, // ✅ 傳入用戶修改的索引
  ) => {
    // 計算每個顏色的使用次數
    const colorUsage = currentPalette.map((color, index) => ({
      index,
      color,
      count: 0,
      isModified: userModifiedIndices.has(index), // ✅ 標記用戶修改
    }));

    // 統計使用次數...

    // ✅ 分開處理：用戶修改的 vs 自動生成的
    const modifiedColors = colorUsage.filter(
      (c) => c.isModified,
    );
    const autoColors = colorUsage.filter((c) => !c.isModified);

    // 按使用次數排序（只排序自動生成的）
    autoColors.sort((a, b) => b.count - a.count);

    // 取前 N 個自動顏色 + 所有用戶修改的顏色
    const numAutoColors = Math.max(
      0,
      targetCount - modifiedColors.length,
    );
    const keepColors = [
      ...modifiedColors, // ✅ 保留所有用戶修改
      ...autoColors.slice(0, numAutoColors), // 取使用最多的自動顏色
    ];

    // ...
  },
  [],
);
```

### 🎓 經驗教訓

1. **區分用戶意圖**: 用戶修改的數據應該優先保留
2. **modifiedColorIndices**: 使用 Set 記錄用戶修改過的索引
3. **優先級排序**: 用戶修改 > 使用次數

---

## 問題 #9: 上傳新圖時舊圖的SegmentMemory污染新圖

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```
1. 圖片 A：用戶修改「天空」為粉色
2. SegmentMemory 記錄：天空區域 → 粉色
3. 上傳新圖片 B（完全不同的內容）
4. 🔥 問題：新圖的��些區域莫名其妙變成粉色
5. 原因：SegmentMemory 仍然記錄著圖片 A 的修改
```

### ✅ 解決方案

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 536

const handleImageUpload = async (file: File) => {
  // ... 加載圖片 ...

  // CRITICAL: Clear ALL state when uploading new image
  // This prevents memory leaks and ensures clean slate for new image
  setTileColorMap([]);

  // Clear segment memory - each image should have its own memory
  // Don't carry over modifications from previous images!
  segmentMemoryRef.current.clear(); // ✅ 清空 SegmentMemory

  // Clear modified color indices
  setModifiedColorIndices(new Set()); // ✅ 清空用戶修改記錄

  // Reset history
  resetHistory(); // ✅ 清空 Undo/Redo 歷史

  setImage(newImage);
  setImageChanged(true);
};
```

### 🎓 經驗教訓

1. **清理狀態**: 上傳新圖時必須清空所有舊狀態
2. **避免污染**: 不同圖片的修改不應相互影響
3. **完整重置**: colorMap, SegmentMemory, History 都要清空

---

## 問題 #10: 畫布尺寸改變後Undo導致尺寸錯亂

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```
1. 40x40 → 改為 60x60
2. 用戶調整顏色
3. Undo → 🔥 畫布變回 40x40（錯誤！應該保持 60x60）
```

### ✅ 解決方案

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 158

const applyStateFromHistory = (state: any) => {
  // ... 應用狀態 ...

  setMosaicWidth(state.mosaicWidth);
  setMosaicHeight(state.mosaicHeight);

  // CRITICAL: Update prevMosaicDimensionsRef to prevent useEffect from thinking dimensions changed
  prevMosaicDimensionsRef.current = {
    width: state.mosaicWidth,
    height: state.mosaicHeight,
  }; // ✅ 同步 ref

  // 這樣 useEffect 不會誤以為尺寸改變，避免重新生成馬賽克
};
```

### 🎓 經驗教訓

1. **History 包含完整狀態**: 尺寸也要記錄在 History 中
2. **同步 ref**: ref 和 state 都要更新，避免 useEffect 誤判
3. **區分觸發源**: Undo 觸發的尺寸改變 ≠ 用戶手動改變尺寸

---

## 問題 #11: 合併顏色時使用錯誤的調色盤導致重新分離

### 🔴 問題描述

**時間**: 2026-01-11

**現象**:

```
1. 用戶合併顏色 2 和 3
2. palette.length: 4 → 3
3. 用戶改變畫布尺寸 40x40 → 60x60
4. 🔥 問題：合併的顏色重新分離成 2 個顏色
```

### 🔍 錯誤原因

```typescript
// ❌ 錯誤代碼 (已修復)
const handleSizeChange = () => {
  // 使用「原始調色盤快照」重新取樣
  const resamplePalette = originalPaletteSnapshot; // ❌ 這是合併前的 4 色

  // 重新匹配最接近的顏色 → 分離成原來的 2 個顏色
};
```

### ✅ 解決方案

```typescript
// src/app/components/MosaicGeneratorV2.tsx - Line 1113

const handleSizeChange = () => {
  // 🔥 FIX: Use current palette (reflects merged colors) instead of originalPaletteSnapshot
  const resamplePalette = palette; // ✅ 使用當前調色盤（包含合併）

  // 重新取樣時使用合併後的調色盤 → 顏色保持合併狀態
};
```

### 🎓 經驗教訓

1. **當前狀態優先**: 使用當前狀態，不是快照
2. **originalPaletteSnapshot 已廢棄**: 不應該使用原始快照
3. **SegmentMemory 處理記憶**: 空間記憶系統已經處理用戶修改

---

## 問題 #12: numColors與palette.length不同步

> 見 [問題 #2](#問題-2-合併顏色後undoredo導致numcolors不同步)

這是所有問題中最普遍的，在 10+ 處代碼中都需要修復：

```typescript
// 🔥 全局搜索：addToHistory
// 🔥 修復所有位置：使用 palette.length 而不是 numColors

addToHistory({
  colorMap: newColorMap,
  palette: newPalette,
  numColors: newPalette.length, // ✅ 使用實際長度
  // ...
});
```

### 修復位置清單

1. Line 436: 圖片上傳後
2. Line 574: 磁磚點擊後
3. Line 642: 合併顏色後
4. Line 668: 改變調色盤後
5. Line 701: 改變單個顏色後
6. Line 1148: 改變畫布尺寸後
7. Line 1185: 改變磁磚設定後
8. Line 1238: 改變邊框設定後
9. Line 1281: 改變 3D 效果後
10. ... 共 10+ 處

---

## 問題 #13: PNG透明度支援 - 畫布調整與色票選擇

### 🎯 核心挑戰

**時間**: 2026-01-15

**功能需求**:

```
1. 用戶上傳帶透明度的 PNG 圖片
2. 系統需要正確處理透明像素（alpha = 0）
3. 透明格子在畫布上正確顯示和編輯
4. 色票面板顯示透明色票，支持選擇和繪製
5. 調整畫布大小時透明區域不能變成黑色
```

### 🐛 Bug #1: 調整畫布大小時透明格變黑格

**問題描述**:

```
1. 上傳帶透明區域的 PNG 圖片 → 透明格子正確顯示
2. 調整畫布寬度或高度
3. 🔥 問題：原本透明的格子變成黑色格子
4. 但調整顏色數量後又恢復正常（變回透明）
```

**根本原因**:

```typescript
// ❌ handleCanvasSizeChange 重映射邏輯錯誤
const remappedColorMap = newColorMap.map((row) =>
  row.map((oldIndex) => oldToNewIndex.get(oldIndex) ?? 0),
);

// 問題：
// - 透明格子索引為 -1
// - oldToNewIndex.get(-1) 返回 undefined
// - ?? 0 將其變成 0（黑色索引）
```

**解決方案**:

```typescript
// ✅ MosaicGeneratorV2.tsx:1195-1200
const remappedColorMap = newColorMap.map((row) =>
  row.map((oldIndex) => {
    if (oldIndex === -1) return -1; // ✅ 保留透明索引
    return oldToNewIndex.get(oldIndex) ?? 0;
  }),
);
```

---

### 🐛 Bug #2: 點擊透明色票無法選中並繪製透明

**問題描述**:

```
1. 上傳帶透明區域的 PNG → 色票面板顯示透明色票
2. 點擊透明色票
3. 🔥 問題：沒有反應，無法選中
4. 🔥 問題：畫布上透明格子沒有高光顯示
5. 🔥 問題：無法用透明色票繪製新的透明格子
```

**根本原因 1 - 選擇邏輯**:

```typescript
// ❌ 錯誤邏輯
onColorSelect={(index) => {
  if (index === -1) {
    setSelectedColorGroup(null);  // ❌ 直接取消選擇
    return;
  }
  // ...
}}

// 問題：點擊透明色票時直接清空選擇，無法選中
```

**解決方案 1**:

```typescript
// ✅ MosaicGeneratorV2.tsx:1472-1485
onColorSelect={(index) => {
  // Allow selecting transparent swatch (-1) to paint transparency
  const newIndex = selectedColorGroup === index ? null : index;
  setSelectedColorGroup(newIndex);  // ✅ 允許選中 -1

  // Don't show color picker for transparent swatch
  if (index === -1) {
    setShowColorPicker(null);
  } else if (showColorPicker !== null) {
    setShowColorPicker(newIndex);
  }
}}
```

**根本原因 2 - 透明格子高光**:

```typescript
// ❌ MosaicCanvas.tsx 錯誤邏輯
if (colorIndex === -1) {
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(px, py, tileSize, tileSize);
  continue; // ❌ 直接跳過，沒有檢查是否需要高光
}
```

**解決方案 2**:

```typescript
// ✅ MosaicCanvas.tsx:117-129
if (colorIndex === -1) {
  // Draw transparent tile
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(px, py, tileSize, tileSize);

  // If transparent color group is active, draw highlight border
  if (activeColorGroup === -1) {
    ctx.strokeStyle = "rgba(255, 200, 0, 0.8)"; // ✅ 金黃色高光
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
  }

  continue;
}
```

### 📊 驗證結果

**測試場景**:

| 操作         | 修復前       | 修復後        |
| ------------ | ------------ | ------------- |
| 調整畫布大小 | 透明→黑色 ❌ | 保持透明 ✅   |
| 點擊透明色票 | 無法選中 ❌  | 正確選中 ✅   |
| 透明格子高光 | 無高光 ❌    | 金黃色高光 ✅ |
| 繪製透明格子 | 無法繪製 ❌  | 正常繪製 ✅   |

### 🎓 經驗教訓

1. **特殊索引處理**: -1 作為透明索引，在所有重映射邏輯中都要特殊處理
2. **完整交互邏輯**: 選中、高光、繪製都要支援透明色票
3. **視覺反饋重要**: 金黃色高光幫助用戶識別選中的透明格子
4. **防禦性編程**: 處理索引時要檢查特殊值（-1, null, undefined）

---

## 問題 #14: 顏色合併 + 畫布調整後顏色跑回原色

### 🔴 問題描述

**時間**: 2026-01-16

**現象**:

```
1. 上傳圖片 → 自動生成 7 色調色盤
2. 用戶將索引 4 和 5 兩個淺色改為白色（觸發自動合併）
3. 調整畫布大小（例如 40x40 → 50x50）
4. 🔥 問題：原本白色的區域變回原來的淺色！
```

**用戶反饋**: "我把兩個顏色都改成白色了，為什麼改畫布大小後又變回去？"

### 🔍 根本原因鏈

這個 bug 有四個相互關聯的根本原因：

#### 原因 1: Color Picker 雙重觸發

瀏覽器 Color Picker 點擊確認會觸發兩次 onChange 事件

#### 原因 2: 防抖機制失效

時間戳防抖無法防止第二次呼叫（間隔可能 > 50ms）

#### 原因 3: SegmentMemory 被刪除

合併顏色時錯誤地調用 removeModificationsForColor()，導致空間記憶丟失

#### 原因 4: originalPaletteSnapshot 被更新

合併時錯誤更新了原始基準，導致畫布調整時使用錯誤的基準

### ✅ 最終解決方案

#### 解決方案 1: 使用狀態比較代替時間戳防抖

```typescript
if (palette[colorIndex] === newColorRgb) {
  return; // ✅ 顏色已匹配，直接返回
}
```

#### 解決方案 2: 永不刪除 SegmentMemory

移除所有 removeModificationsForColor() 調用，保留所有空間修改記錄

#### 解決方案 3: 永不更新 originalPaletteSnapshot

確保原始快照永遠是初始生成的調色盤，合併操作不影響基準

### 📊 驗證結果

| 操作                               | 修復前            | 修復後        |
| ---------------------------------- | ----------------- | ------------- |
| 改色 index=4,5→白(合併) → 調整畫布 | 只有4白，5跑色 ❌ | 都是白色 ✅   |
| 快速點擊顏色選擇器                 | 觸發多次合併 ❌   | 只執行一次 ✅ |
| 改3個顏色為白 → 調整畫布           | 部分跑色 ❌       | 全部保留 ✅   |

### 🎓 經驗教訓

1. **State Comparison > Timestamp**: 狀態比較比時間戳更可靠
2. **Preserve All Memory**: 空間記憶系統不應刪除任何記錄
3. **Immutable Baseline**: 基準狀態應該永不改變
4. **Two-Phase System**: 基準(snapshot) + 修改(memory) 分層設計

---

## 問題 #15: 合併顏色後調整顏色數量出現重複顏色

### 🔴 問題描述

**時間**: 2026-01-16

**現象**:

```
1. 上傳圖片 → 自動生成調色盤（例如 7 色）
2. 用戶合併兩個白色 → 調色盤減少為 6 色
3. 用戶合併兩個膚色 → 調色盤減少為 5 色
4. 用戶調整顏色數量（例如從 7→8）
5. 🔥 問題：調色盤中出現兩個完全相同的白色 #ffffff！
```

**用戶反饋**: "同個顏色不該出現兩次，我剛合併了兩個白色，調整顏色數量後為什麼又出現兩個白色？"

### 🔍 根本原因

**SegmentMemory 記錄了兩條白色修改**：

```typescript
// 用戶操作
1. 將 segment 4 改為白色 → SegmentMemory: [(4, 原色A→white)]
2. 將 segment 5 改為白色 → SegmentMemory: [(4, 原色A→white), (5, 原色B→white)]

// 調整顏色數量時
3. generateMosaic() 重新生成調色盤
4. applyModificationsToPalette() 遍歷所有修改記錄：
   - 第一條：找到最佳匹配 segment=2 → 改為 white
   - 第二條：找到另一個最佳匹配 segment=5 → 也改為 white

結果：調色盤中出現兩個 rgb(255, 255, 255) ❌
```

**核心問題**：

- SegmentMemory 記錄的是「空間區域的顏色修改」
- 兩個不同的空間區域可以改成同一個顏色
- 但調色盤中不應該有重複的顏色項目
- `applyModificationsToPalette` 沒有檢查是否已經應用過相同顏色

### ✅ 最終解決方案

**在 segmentMemory.ts 中添加顏色去重邏輯**：

```typescript
// ✅ segmentMemory.ts:L286-L337
applyModificationsToPalette(
  newColorMap: number[][],
  newPalette: string[]
): string[] {
  if (this.modifications.length === 0) {
    return newPalette;
  }

  const modifiedPalette = [...newPalette];
  const usedSegments = new Set<number>();
  const appliedColors = new Map<string, number>(); // 🔥 NEW: 追蹤已應用的顏色

  for (let i = 0; i < this.modifications.length; i++) {
    const mod = this.modifications[i];

    // 🔥 FIX: 檢查這個顏色是否已經應用過
    const [r, g, b] = mod.modifiedColor.split(',').map(Number);
    const colorKey = `rgb(${r}, ${g}, ${b})`;

    if (appliedColors.has(colorKey)) {
      continue;  // ✅ 跳過重複顏色，避免創建副本
    }

    // 找到最佳匹配的 segment
    let bestSegmentIndex = -1;
    let bestIoU = 0;

    for (let segmentIndex = 0; segmentIndex < newPalette.length; segmentIndex++) {
      if (usedSegments.has(segmentIndex)) continue;

      const newSegmentMask = createSegmentMask(newColorMap, segmentIndex);
      const iou = calculateSegmentIoU(mod.segmentMask, newSegmentMask);

      if (iou > bestIoU) {
        bestIoU = iou;
        bestSegmentIndex = segmentIndex;
      }
    }

    // 應用修改
    if (bestIoU > 0.3 && bestSegmentIndex !== -1) {
      modifiedPalette[bestSegmentIndex] = colorKey;
      usedSegments.add(bestSegmentIndex);
      appliedColors.set(colorKey, bestSegmentIndex); // 🔥 NEW: 記錄已應用
    }
  }

  return modifiedPalette;
}
```

### 🔧 修改邏輯

**Before**:

```typescript
// ❌ 舊邏輯：無檢查，直接應用所有修改
for (modification in modifications) {
  找最佳匹配 → 應用顏色  // 可能創建重複顏色
}
```

**After**:

```typescript
// ✅ 新邏輯：檢查重複，跳過已應用的顏色
appliedColors = Map<colorKey, segmentIndex>

for (modification in modifications) {
  if (appliedColors.has(modification.color)) {
    continue;  // 跳過重複
  }
  找最佳匹配 → 應用顏色
  appliedColors.set(modification.color, segmentIndex)
}
```

### 📊 驗證結果

| 操作流程                               | 修復前              | 修復後          |
| -------------------------------------- | ------------------- | --------------- |
| 合併兩個白色 → 調整顏色數量            | 出現兩個 #ffffff ❌ | 只有一個白色 ✅ |
| 合併兩個膚色 + 兩個白色 → 調整顏色數量 | 重複顏色 ❌         | 無重複 ✅       |
| 合併後調整顏色數量多次                 | 重複累積 ❌         | 始終無重複 ✅   |

### 🎓 經驗教訓

1. **修改記錄 ≠ 最終狀態**: SegmentMemory 記錄修改歷史，但最終調色盤應該是去重的
2. **空間映射 vs 顏色唯一性**:
   - 空間記憶系統追蹤「哪些區域改了什麼顏色」（可能有重複）
   - 調色盤要求「每個顏色只出現一次」（必須去重）
3. **先到先得策略**: 第一個匹配到的修改佔用顏色位，後續相同顏色的修改跳過
4. **Map 追蹤**: 使用 `Map<colorKey, segmentIndex>` 高效檢查顏色是否已應用

---

## 改革 #1: V1 到 V2 模塊化重構

### 🎯 改革動機

**時間**: 2026-01-10

**V1 的問題**:

- 單一文件超過 1500 行
- Magic numbers 散落各處
- 沒有類型定義
- 重複邏輯多

**V2 改革**:

- 拆分為 10+ 模塊化文件
- 創建 `types.ts`, `constants.ts`, `helpers.ts`
- 完整類型系統
- 消除代碼重複

詳見 [MOSAIC_CHANGELOG.md](/MOSAIC_CHANGELOG.md)

---

## 🎯 總結

### 15 個重大問題分類

#### 核心設計問題

1. ✅ 問題 #1: ColorMap Index Mapping - 調色後改尺寸不跑色
2. ✅ 問題 #5: SegmentMemory - 空間記憶系統設計

#### 狀態同步問題

3. ✅ 問題 #2, #12: numColors 與 palette.length 不同步
4. ✅ 問題 #6: selectedColorGroup 越界
5. ✅ 問題 #10: Undo 後尺寸錯亂

#### 閉包和時序問題

6. ✅ 問題 #3: History 閉包陷阱
7. ✅ 問題 #4: 新圖使用舊尺寸
8. ✅ 問題 #7: useEffect 依賴循環

#### 用戶體驗問題

9. ✅ 問題 #8: 用戶修改的顏色被移除
10. ✅ 問題 #9: 舊圖 SegmentMemory 污染新圖
11. ✅ 問題 #11: 合併顏色後改尺寸重新分離
12. ✅ 問題 #13: PNG透明度支援 - 畫布調整與色票選擇
13. ✅ 問題 #14: 顏色合併 + 畫布調整後顏色跑回原色
14. ✅ 問題 #15: 合併顏色後調整顏色數量出現重複顏色

### 核心設計哲學

1. **Index Mapping**: 數據和樣式分離
2. **Spatial Memory**: 空間記憶優於顏色映射
3. **Single Source of Truth**: palette.length 是唯一真相
4. **Closure Awareness**: 立即捕獲，延遲執行
5. **Immutable Baseline**: 基準狀態永不改變（originalPaletteSnapshot）
6. **Two-Phase System**: 基準 + 修改分層設計（Snapshot + SegmentMemory）
7. **Deduplication**: 調色盤必須去重，即使修改記錄可能重複

---

**最後更新**: 2026-01-16  
**維護者**: 這些問題和解法是寶貴的經驗，應該永久保留