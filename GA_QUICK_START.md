# Google Analytics 快速上手 🚀

## ⚡ 3 步驟快速設置

### 步驟 1：取得測量 ID
1. 訪問 https://analytics.google.com/
2. 創建新的 GA4 屬性
3. 複製測量 ID (格式: `G-XXXXXXXXXX`)

### 步驟 2：更新配置
打開 `/src/utils/analytics.ts`，替換：
```typescript
const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // ← 改為您的 ID
```

### 步驟 3：完成！
部署網站並訪問，在 GA4 即時報表中查看數據。

---

## 📊 自動追蹤的內容

✅ **頁面瀏覽**
- 首頁訪問
- 工具頁面切換

✅ **用戶互動**
- 工具開啟/關閉
- 語言切換 (中文/英文)

✅ **隱私保護**
- IP 自動匿名化
- 無個人資料追蹤

---

## 📖 詳細文檔
查看 `GOOGLE_ANALYTICS_SETUP.md` 了解完整設置指南和進階功能。
