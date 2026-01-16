# Google Analytics 診斷指南 🔍

## 🚨 看不到數據？按順序檢查這些！

### 第 1 步：檢查瀏覽器控制台

1. **打開您的網站**
2. **按 F12 打開開發者工具**
3. **切換到 Console 標籤**
4. **刷新頁面**

#### ✅ 應該看到的訊息：
```
✅ Google Analytics initialized successfully
📊 Measurement ID: G-GWJH5XZQ1R
✅ gtag function is available
📊 GA Page View sent: /
```

#### ❌ 如果看到這些錯誤：

**錯誤 1: `gtag function is NOT available`**
```
⚠️ gtag function is NOT available - GA may be blocked
```
**原因**: GA 腳本被阻擋
**解決方案**: 
- 關閉廣告攔截器（AdBlock, uBlock Origin 等）
- 關閉瀏覽器的隱私保護模式
- 嘗試無痕模式

**錯誤 2: 網絡錯誤**
```
Failed to load resource: net::ERR_BLOCKED_BY_CLIENT
```
**原因**: 瀏覽器擴展阻擋了 GA
**解決方案**: 暫時停用所有擴展

---

### 第 2 步：檢查 Network 標籤

1. **開發者工具 → Network 標籤**
2. **刷新頁面**
3. **搜索 `google-analytics` 或 `gtag`**

#### ✅ 應該看到：
- 狀態碼：`200 OK`
- 請求到 `www.googletagmanager.com`
- 請求到 `www.google-analytics.com`

#### ❌ 如果看到：
- `(blocked:client)` - 被擴展阻擋
- `net::ERR_BLOCKED_BY_CLIENT` - 被廣告攔截器阻擋
- 狀態碼 `404` 或 `403` - 測量 ID 錯誤

---

### 第 3 步：驗證測量 ID

確認您的測量 ID：`G-GWJH5XZQ1R`

#### 檢查列表：
- [ ] 格式正確（以 `G-` 開頭）
- [ ] 沒有額外的空格
- [ ] 在 Google Analytics 中可以找到此屬性

#### 如何驗證：
1. 前往 https://analytics.google.com/
2. 點擊左下角「管理」⚙️
3. 在「屬性」欄中查看您的屬性
4. 點擊「數據流」
5. 確認測量 ID 是否與代碼中的相同

---

### 第 4 步：檢查 GA4 即時報表

1. 前往 https://analytics.google.com/
2. 選擇您的屬性
3. 點擊左側「報表」→「即時」
4. **等待 5-10 分鐘**（首次數據可能有延遲）

#### 📊 在即時報表中查看：
- **目前活躍使用者**: 應該顯示 1+
- **依事件名稱** - 事件計數: 應該看到 `page_view` 等事件

---

### 第 5 步：使用 GA Debug 模式

#### 方法 1：瀏覽器擴展（推薦）

安裝 **Google Analytics Debugger** 擴展：
- Chrome: https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna
- 啟用後重新載入頁面
- 檢查控制台中的詳細 GA 日誌

#### 方法 2：手動檢查

在控制台中輸入：
```javascript
// 檢查 GA 是否載入
typeof window.gtag
// 應該返回 'function'

// 檢查 dataLayer
window.dataLayer
// 應該返回一個包含事件的數組
```

---

## 🔧 常見問題排查

### 問題 1: 廣告攔截器

**症狀**: 控制台顯示 `gtag function is NOT available`

**解決方案**:
1. 暫時關閉廣告攔截器（AdBlock, uBlock Origin）
2. 將您的網站加入白名單
3. 使用無痕模式測試

### 問題 2: 瀏覽器隱私設置

**症狀**: Network 標籤中看到 GA 請求被阻擋

**解決方案**:
1. Firefox: 關閉「增強型追蹤保護」
2. Safari: 關閉「防止跨網站追蹤」
3. Brave: 暫時關閉 Shields

### 問題 3: CORS 或 CSP 政策

**症狀**: 控制台顯示 CORS 錯誤

**解決方案**:
確保您的網站允許載入 Google Analytics 腳本。如果使用 CSP，添加：
```
script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com;
```

### 問題 4: 測量 ID 錯誤

**症狀**: Network 請求返回 404

**解決方案**:
1. 再次確認 GA 中的測量 ID
2. 確保是 GA4 屬性（不是 Universal Analytics 的 UA-XXXXXXX）
3. 檢查代碼中是否有拼寫錯誤

### 問題 5: 數據延遲

**症狀**: 控制台顯示正常，但 GA 中看不到數據

**解決方案**:
- **即時報表**: 通常 5-10 分鐘內顯示
- **標準報表**: 可能需要 24-48 小時
- 首先檢查「即時」報表！

---

## ✅ 快速測試清單

按順序執行：

1. [ ] 打開您的網站
2. [ ] 按 F12 打開控制台
3. [ ] 刷新頁面
4. [ ] 看到 `✅ Google Analytics initialized successfully`
5. [ ] 看到 `✅ gtag function is available`
6. [ ] 看到 `📊 GA Page View sent: /`
7. [ ] Network 標籤中看到 GA 請求（狀態 200）
8. [ ] 等待 5 分鐘
9. [ ] 檢查 GA 即時報表
10. [ ] 看到活躍使用者數量 > 0

---

## 🆘 仍然無法運作？

### 終極診斷：測試事件

在瀏覽器控制台中執行：

```javascript
// 手動發送測試事件
window.gtag('event', 'test_event', {
  'event_category': 'Test',
  'event_label': 'Manual Test',
  'value': 1
});
```

然後檢查：
1. 控制台是否有錯誤
2. Network 標籤是否有新請求
3. GA 即時報表中是否出現 `test_event`

---

## 📞 需要更多幫助？

### 檢查清單報告

當您尋求幫助時，請提供：

```
環境：
[ ] 瀏覽器類型和版本：_______
[ ] 是否開啟廣告攔截器：是/否
[ ] 是否在無痕模式測試：是/否

控制台訊息：
[ ] ✅ GA initialized: 是/否
[ ] ✅ gtag available: 是/否
[ ] 📊 Page View sent: 是/否
[ ] 錯誤訊息：_______

Network 檢查：
[ ] GA 請求狀態碼：_______
[ ] 是否被阻擋：是/否

GA 後台：
[ ] 測量 ID 正確：是/否
[ ] 資料流狀態：_______
[ ] 即時報表等待時間：___ 分鐘
```

---

## 🎯 成功指標

當一切正常運作時，您應該看到：

### 瀏覽器控制台
```
✅ Google Analytics initialized successfully
📊 Measurement ID: G-GWJH5XZQ1R
✅ gtag function is available
📊 GA Page View sent: /
📊 GA Event sent: { category: 'User Interaction', action: 'Language Change', label: 'zh' }
```

### Google Analytics 即時報表
- 👥 目前活躍使用者: 1+
- 📄 頁面瀏覽: /
- 🎯 事件: page_view, 其他自定義事件

### Network 標籤
- ✅ 請求到 www.googletagmanager.com (200 OK)
- ✅ 請求到 www.google-analytics.com/g/collect (200 OK)

---

**提示**: GA4 的即時報表通常在 5-10 分鐘內顯示數據。標準報表可能需要 24-48 小時。首次設置時，專注於即時報表！
