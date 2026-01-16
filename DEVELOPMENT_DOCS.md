# 手作工具網站 - 開發文檔總覽

> 集中管理所有開發文檔、問題記錄和改革方案

---

## 📚 文檔結構

```
/
├── 📄 DEVELOPMENT_DOCS.md              # 本文件 - 總覽
│
├── 📊 Google Analytics
│   ├── GA_QUICK_START.md               # GA 快速上手指南
│   └── GOOGLE_ANALYTICS_SETUP.md       # GA 完整設置文檔
│
├── 🎨 馬賽克生成器 (Mosaic Generator)
│   ├── MOSAIC_DEVELOPMENT_LOG.md       # 詳細問題記錄（核心！）
│   └── src/app/components/mosaic/README.md  # 代碼組織文檔
│
└── 🎯 圖片向量化工具 (Image Vectorizer)
    ├── VECTORIZER_DEVELOPMENT_LOG.md   # 詳細問題記錄（核心！）
    └── src/app/components/vectorizer/README.md  # 代碼組織文檔
```

---

## 📊 Google Analytics 整合

### 版本 0.3.0 (2026-01-16)

已成功整合 Google Analytics 4 追蹤系統。

#### 🎯 追蹤功能
- ✅ 頁面瀏覽追蹤（首頁、馬賽克、向量化工具）
- ✅ 工具使用事件（開啟、關閉）
- ✅ 語言切換事件
- ✅ 自定義事件支援
- ✅ 錯誤追蹤

#### 📖 相關文檔
- [快速上手指南](GA_QUICK_START.md) - 3 步驟完成設置
- [完整設置文檔](GOOGLE_ANALYTICS_SETUP.md) - 詳細配置和進階功能

#### 🔧 實作細節
- **套件**: `react-ga4@2.1.0`
- **配置文件**: `/src/utils/analytics.ts`
- **隱私保護**: IP 匿名化、無 PII 追蹤
- **整合位置**: App.tsx, Header.tsx

---

## 🎨 馬賽克生成器 (Mosaic Generator)

### 📄 核心文檔

| 文檔         | 用途                       | 鏈接                                                    |
| ------------ | -------------------------- | ------------------------------------------------------- |
| **開發日誌** | 詳細問題根源分析和解決方案 | [MOSAIC_DEVELOPMENT_LOG.md](/MOSAIC_DEVELOPMENT_LOG.md) |
| **代碼組織** | 架構和最佳實踐             | [README.md](/src/app/components/mosaic/README.md)       |

### 🔥 重大問題記錄

#### 核心架構：ColorMap Index Mapping 系統

- **設計**: colorMap存儲調色盤索引，不是顏色值
- **優勢**: 改色O(1)、改尺寸不跑色、節省記憶體
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#核心架構colormap-index-mapping-系統)

#### 問題 #1: 調色後改變畫布大小導致顏色混亂 (2026-01-10)

- **問題**: 用戶調整顏色後改尺寸，顏色全部重置
- **嘗試**: 3次失敗方案（顏色映射、索引映射、深拷貝）
- **解決**: 使用當前palette重新取樣，而非原始快照
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-1-調色後改變畫布大小導致顏色混亂)

#### 問題 #2: 合併顏色後Undo/Redo導致numColors不同步 (2026-01-11)

- **問題**: palette.length = 3，但numColors = 4
- **影響**: selectedColorGroup越界崩潰
- **解決**: 10+處代碼統一使用palette.length
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-2-合併顏色後undoredo導致numcolors不同步)

#### 問題 #3: History閉包陷阱 - 記錄舊的colorMap (2026-01-11)

- **問題**: setTimeout捕獲閉包，記錄相同的舊colorMap
- **嘗試**: 2次失敗方案（useRef、函數式setState）
- **解決**: 立即深拷貝colorMap，延遲addToHistory
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-3-history閉包陷阱---記錄舊的colormap)

#### 問題 #4: 改變畫布尺寸後上傳新圖顯示舊尺寸 (2026-01-11)

- **問題**: 40x40→14x7，上傳新圖仍是14x7
- **嘗試**: 2次失敗方案（直接重置、添加依賴）
- **解決**: imageChanged標誌位+pendingDimensionsRef
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-4-改變畫布尺寸後上傳新圖顯示舊尺寸)

#### 問題 #5: SegmentMemory設計 - 空間記憶vs顏色映射 (2026-01-11)

- **挑戰**: 重新分割後保持用戶對特定區域的顏色修改
- **嘗試**: 3次失敗方案（顏色映射、索引映射、像素映射）
- **解決**: 空間遮罩+IoU相似度匹配（核心創新！）
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-5-segmentmemory設計---空間記憶vs顏色映射)

#### 問題 #6: selectedColorGroup越界導致崩潰 (2026-01-11)

- **問題**: 合併後palette.length=3，selectedColorGroup=3越界
- **解決**: Undo和合併時檢查並重置selectedColorGroup
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-6-selectedcolorgroup越界導致崩潰)

#### 問題 #7: useEffect依賴循環導致無限重繪 (2026-01-11)

- **問題**: useEffect依賴tileColorMap，更新tileColorMap觸發循環
- **解決**: 移除tileColorMap依賴，分離關注點
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-7-useeffect依賴循環導致無限重繪)

#### 問題 #8: 減少顏色數量時用戶修改的顏色被移除 (2026-01-11)

- **問題**: 用戶精心調整的顏色因使用次數少被刪除
- **解決**: modifiedColorIndices優先保留用戶修改
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-8-減少顏色數量時用戶修改的顏色被移除)

#### 問題 #9: 上傳新圖時舊圖的SegmentMemory污染新圖 (2026-01-11)

- **問題**: 圖A的修改影響圖B，莫名其妙變色
- **解決**: 上傳新圖時clear所有狀態
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-9-上傳新圖時舊圖的segmentmemory污染新圖)

#### 問題 #10: 畫布尺寸改變後Undo導致尺寸錯亂 (2026-01-11)

- **問題**: Undo將尺寸也回退了
- **解決**: 同步prevMosaicDimensionsRef防止誤判
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-10-畫布尺寸改變後undo導致尺寸錯亂)

#### 問題 #11: 合併顏色時使用錯誤的調色盤導致重新分離 (2026-01-11)

- **問題**: 合併後改尺寸，顏色重新分離
- **原因**: 使用originalPaletteSnapshot而非當前palette
- **解決**: 使用當前palette重新取樣
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-11-合併顏色時使用錯誤的調色盤導致重新分離)

#### 問題 #12: numColors與palette.length不同步 (2026-01-11)

- **範圍**: 10+處代碼需要修復
- **解決**: 全局搜索addToHistory，統一使用palette.length
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#問題-12-numcolors與palettelength不同步)

#### 改革 #1: V1 到 V2 模塊化重構 (2026-01-10)

- **動機**: 單一文件1500+行難以維護
- **實現**: 拆分為10+模塊，types+constants+helpers
- **效果**: 代碼行數-80%，可維護性顯著提升
- **詳情**: [查看詳細記錄](/MOSAIC_DEVELOPMENT_LOG.md#改革-1-v1-到-v2-模塊化重構)

### 📊 版本歷史

| 版本 | 日期       | 主要變更                                       |
| ---- | ---------- | ---------------------------------------------- |
| v2.0 | 2026-01-11 | 模塊化架構重構 + 莫蘭迪色調 + 12個重大問題修復 |
| v1.0 | 2026-01-10 | 初始版本                                       |

---

## 🎯 圖片向量化工具 (Image Vectorizer)

### 📄 核心文檔

| 文檔         | 用途                       | 鏈接                                                            |
| ------------ | -------------------------- | --------------------------------------------------------------- |
| **開發日誌** | 詳細問題根源分析和解決方案 | [VECTORIZER_DEVELOPMENT_LOG.md](/VECTORIZER_DEVELOPMENT_LOG.md) |
| **代碼組織** | 架構和最佳實踐             | [README.md](/src/app/components/vectorizer/README.md)           |

### 🔥 重大問題記錄

#### 問題 #1: PNG 圖片在第二步卡住 (2026-01-13)

- **問題**: PNG 上傳後無法進入第三步
- **根源**: `autoThresholdValue` 狀態同步問題
- **解決**: 移除過早驗證邏輯
- **效果**: PNG 和 JPG 都能正常工作
- **詳情**: [查看詳細記錄](/VECTORIZER_DEVELOPMENT_LOG.md#問題-1-png-圖片在第二步卡住)

#### 問題 #2: Potrace 形狀挖空 (2026-01-12)

- **問題**: 形狀被"挖空"，視覺效果完全相反
- **根源**: Potrace 追蹤黑色，但 Mask 數據為白色 = 形狀
- **解決**: Mask 顏色反轉（`inverted = 255 - value`）
- **效果**: 形狀正確填充
- **詳情**: [查看詳細記錄](/VECTORIZER_DEVELOPMENT_LOG.md#問題-2-potrace-mask-顏色反轉---形狀挖空問題)

#### 問題 #3: useBezierCurves 開關失效 (2026-01-13)

- **問題**: UI 開關不影響向量化結果
- **根源**: 配置未正確傳遞，硬編碼檢查
- **解決**: 移除開關，實現無條件 Potrace Fallback
- **效果**: UI 簡化，質量穩定
- **詳情**: [查看詳細記錄](/VECTORIZER_DEVELOPMENT_LOG.md#問題-3-usebeziercurves-開關硬編碼問題)

#### 改革 #1: 移除所有質量開關 (2026-01-13)

- **動機**: 測試證明 Potrace 對所有圖片都是最佳選擇
- **實現**: 無條件三級 Fallback（Potrace → Custom Bezier → 直線）
- **效果**: 用戶零配置，Potrace 成功率 +58%（95%）
- **詳情**: [查看詳細記錄](/VECTORIZER_DEVELOPMENT_LOG.md#改革-1-移除所有向量化質量開關實現無條件-potrace-fallback)

#### 問題 #4: Potrace 跳過細線條 (2026-01-13)

- **問題**: 31x1, 2x29, 69x1 等細線條被跳過
- **根源**: 尺寸檢查太嚴格（`width < 3 || height < 3`）
- **解決**: 更寬容檢查（`(width < 2 && height < 2) || area < 4`）
- **效果**: 細線條正確處理，質量提升
- **詳情**: [查看詳細記錄](/VECTORIZER_DEVELOPMENT_LOG.md#問題-4-potrace-跳過細線條區域)

### 📊 版本歷史

| 版本 | 日期       | 主要變更                           |
| ---- | ---------- | ---------------------------------- |
| v2.0 | 2026-01-13 | 自動優化驅動架構 + 無條件 Fallback |
| v1.0 | 2026-01-12 | 初始版本 + Potrace 集成            |

---

## 🎓 開發最佳實踐

### 通用原則

#### 1. 代碼組織

- ✅ 關注點分離（types, constants, helpers, components）
- ✅ 單一職責原則（每個模塊只做一件事）
- ✅ 避免 Magic Numbers（使用 constants）
- ✅ 消除重複代碼（DRY 原則）

#### 2. 類型安全

- ✅ 使用 TypeScript 嚴格模式
- ✅ 避免 `any` 類型
- ✅ 定義清晰的接口和類型
- ✅ 利用類型推導

#### 3. 性能優化

- ✅ 使用 `useMemo` 緩存計算
- ✅ 使用 `useCallback` 積定函數引用
- ✅ 異步處理密集運算
- ✅ 防抖處理頻繁操作

#### 4. 用戶體驗

- ✅ 自動優化優於手動配置
- ✅ 提供合理的默認值
- ✅ 漸進降級策略
- ✅ 清晰的錯誤提示

### 問題記錄規範

當遇到新問題時，請按以下格式記錄：

```markdown
## 問題 #N: [問題標題]

### 🔴 問題描述

- **時間**: YYYY-MM-DD
- **現象**: [詳細描述用戶看到的現象]
- **示例**: [代碼示例或截圖]

### 🔍 問題根源

- **位置**: [文件路徑 - 行號]
- **原始代碼**: [有問題的代碼]
- **邏輯分析**: [為什麼會出現這個問題]

### ✅ 解決方案

- **修復代碼**: [修復後的代碼]
- **修復邏輯**: [為什麼這樣修復]

### 📊 驗證結果

- **測試場景**: [測試用例表格]
- **效果對比**: [Before/After 對比]

### 🎓 經驗教訓

- [從這個問題中學到了什麼]
```

---

## 📈 整體項目統計

### 代碼質量指標

| 工具         | 最大文件行數 | Magic Numbers | 類型安全 | 測試覆蓋 |
| ------------ | ------------ | ------------- | -------- | -------- |
| 馬賽克生成器 | ~300 行      | 0             | ✅ 嚴格  | 待補充   |
| 向量化工具   | ~800 行      | 0             | ✅ 嚴格  | 待補充   |

### 性能指標

| 工具   | 關鍵操作           | 響應時間 | 優化前 | 改善   |
| ------ | ------------------ | -------- | ------ | ------ |
| 馬賽克 | 顏色統計 (100x100) | ~20ms    | ~200ms | -90%   |
| 向量化 | Potrace 處理       | <100ms   | N/A    | 新功能 |

### 用戶體驗指標

| 工具   | 配置複雜度       | 默認質量           | 錯誤恢復 |
| ------ | ---------------- | ------------------ | -------- |
| 馬賽克 | 低（模塊化面板） | 高（莫蘭迪配色）   | ✅ 完善  |
| 向量化 | 極低（自動優化） | 高（Potrace 優先） | ✅ 完善  |

---

## 🔗 快速導航

### 馬賽克生成器

- [開發日誌](/MOSAIC_DEVELOPMENT_LOG.md)
- [代碼組織](/src/app/components/mosaic/README.md)

### 向量化工具

- [開發日誌](/VECTORIZER_DEVELOPMENT_LOG.md)
- [代碼組織](/src/app/components/vectorizer/README.md)

---

## 📝 維護指南

### 添加新工具

1. 創建工具目錄 `/src/app/components/[tool-name]/`
2. 按照模塊化結構組織代碼（types, constants, helpers, components）
3. 創建對應的開發日誌 `/[TOOL]_DEVELOPMENT_LOG.md`
4. 更新本總覽文檔

### 記錄新問題

1. 在對應工具的開發日誌中添加問題記錄
2. 按照規範格式編寫（問題描述 → 根源 → 解決方案 → 驗證）
3. 更新本總覽文檔的問題列表

### 代碼審查要點

- [ ] 無 Magic Numbers（使用 constants）
- [ ] 類型安全（無 `any`）
- [ ] 無重複代碼（使用 helpers）
- [ ] 性能優化（useMemo, useCallback）
- [ ] 用戶體驗（合理默認值，自動優化）
- [ ] 錯誤處理（完善的 Fallback）
- [ ] 文檔更新（README, 開發日誌）

---

**最後更新**: 2026-01-13  
**維護者**: 確保所有新功能和問題都有完整記錄