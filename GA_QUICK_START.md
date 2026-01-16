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

## 🔍 看不到數據？

### 快速診斷（2 分鐘）

1. **按 F12 打開控制台**，應該看到：
   ```
   ✅ Google Analytics initialized successfully
   📊 Measurement ID: G-GWJH5XZQ1R
   ✅ gtag function is available
   ```

2. **檢查 Network 標籤**，搜索 `google-analytics`：
   - ✅ 狀態碼 200 = 正常
   - ❌ blocked = 被廣告攔截器阻擋

3. **等待 5-10 分鐘**，然後查看 GA 即時報表

### 📖 詳細診斷指南
查看 `GA_TROUBLESHOOTING.md` 了解完整的排查步驟和解決方案。

### 常見問題：
- **廣告攔截器**: 暫時關閉 AdBlock/uBlock
- **瀏覽器隱私保護**: 關閉追蹤保護或使用無痕模式
- **測量 ID 錯誤**: 確認是 GA4 的 `G-` 開頭（不是 `UA-`）
- **數據延遲**: 即時報表需要 5-10 分鐘

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

## 📖 完整文檔
- `GA_TROUBLESHOOTING.md` - 診斷和排查指南
- `GOOGLE_ANALYTICS_SETUP.md` - 完整設置指南和進階功能