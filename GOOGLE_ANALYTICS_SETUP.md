# Google Analytics 4 設置指南

本專案已整合 Google Analytics 4 (GA4)，用於追蹤用戶行為和網站使用情況。

## 📋 設置步驟

### 1. 創建 Google Analytics 4 屬性

1. 前往 [Google Analytics](https://analytics.google.com/)
2. 登入您的 Google 帳戶
3. 點擊左下角的「管理」(齒輪圖標)
4. 在「屬性」欄中，點擊「建立屬性」
5. 輸入屬性名稱（例如：「手作工具網站」）
6. 選擇時區和貨幣
7. 點擊「下一步」並完成設置

### 2. 取得測量 ID

1. 在屬性設置完成後，GA4 會自動創建一個數據流
2. 點擊數據流名稱
3. 您會看到「測量 ID」，格式為 `G-XXXXXXXXXX`
4. 複製這個測量 ID

### 3. 更新應用配置

打開 `/src/utils/analytics.ts` 文件，找到以下這行：

```typescript
const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX'; // 替換為您的實際測量 ID
```

將 `'G-XXXXXXXXXX'` 替換為您複製的測量 ID，例如：

```typescript
const GA_MEASUREMENT_ID = 'G-ABC1234XYZ';
```

### 4. 驗證設置

1. 部署您的網站
2. 在 Google Analytics 中，點擊「即時」報表
3. 訪問您的網站
4. 確認在「即時」報表中看到訪問活動

## 🎯 追蹤的事件

### 頁面瀏覽
- **首頁**: `/` - Home Page
- **馬賽克生成器**: `/mosaic-generator` - Mosaic Generator
- **圖片向量化工具**: `/vectorizer-tool` - Vectorizer Tool

### 工具使用事件
- **工具開啟**: 
  - Category: `Tool Usage`
  - Action: `open`
  - Label: `Mosaic Generator` 或 `Vectorizer Tool`

### 語言切換
- **語言變更**:
  - Category: `User Interaction`
  - Action: `Language Change`
  - Label: `zh` 或 `en`

## 📊 可用的追蹤函數

### 基本追蹤
```typescript
import { logPageView, logEvent, logToolUsage, logLanguageChange, logError } from '@/utils/analytics';

// 追蹤頁面瀏覽
logPageView('/custom-page', 'Custom Page Title');

// 追蹤自定義事件
logEvent('Category', 'Action', 'Label', 123);

// 追蹤工具使用
logToolUsage('Tool Name', 'action', 'details');

// 追蹤語言切換
logLanguageChange('zh');

// 追蹤錯誤
logError('Error description', false);
```

## 🔒 隱私考量

本實作已包含以下隱私保護措施：

1. **IP 匿名化**: 自動匿名化用戶 IP 地址
2. **手動頁面追蹤**: 禁用自動頁面瀏覽追蹤，完全控制發送的數據
3. **無個人資料**: 不追蹤任何個人身份信息 (PII)

## 📝 注意事項

### 開發環境
- 在本地開發時，GA 會照常工作
- 建議創建一個獨立的 GA4 屬性用於開發/測試環境

### 生產環境
- 確保在正式發布前更新測量 ID
- 可以考慮使用環境變數來管理不同環境的 ID

### GDPR / 隱私法規遵守
- 如果您的用戶來自歐盟，請添加 Cookie 同意橫幅
- 考慮提供用戶選擇退出追蹤的選項
- 查看您當地的隱私法規要求

## 🚀 進階設置（可選）

### 使用環境變數

您可以使用環境變數來管理 GA 測量 ID：

1. 創建 `.env` 文件：
```env
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

2. 更新 `analytics.ts`：
```typescript
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-XXXXXXXXXX';
```

### 添加更多自定義事件

在您的工具組件中添加更詳細的追蹤：

```typescript
// 馬賽克工具導出
logToolUsage('Mosaic Generator', 'export', 'PNG format');

// 向量化工具參數調整
logEvent('Tool Settings', 'Parameter Change', 'Color Count', 10);
```

## 📈 查看報表

訪問 [Google Analytics](https://analytics.google.com/) 查看：

1. **即時報表**: 查看當前活躍用戶
2. **事件報表**: 查看所有追蹤的事件
3. **使用者報表**: 了解用戶人口統計和技術細節
4. **參與度報表**: 分析用戶互動和留存率

## ❓ 疑難排解

### GA 沒有接收到數據
1. 確認測量 ID 正確
2. 檢查瀏覽器控制台是否有錯誤
3. 確認瀏覽器沒有阻擋 GA 腳本（檢查廣告攔截器）
4. 在 GA 即時報表中驗證

### 本地開發看不到數據
- 這是正常的，本地主機可能被 GA 過濾
- 可以在 GA4 中調整過濾設置

## 🔗 相關資源

- [Google Analytics 4 官方文檔](https://support.google.com/analytics/answer/10089681)
- [react-ga4 文檔](https://github.com/codler/react-ga4)
- [GA4 事件參考](https://developers.google.com/analytics/devguides/collection/ga4/events)
