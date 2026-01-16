/**
 * Google Analytics 4 配置
 * 
 * 使用方式：
 * 1. 在 Google Analytics 中創建新的 GA4 屬性
 * 2. 複製測量 ID (格式: G-XXXXXXXXXX)
 * 3. 將測量 ID 替換下方的 YOUR_GA4_MEASUREMENT_ID
 */

import ReactGA from 'react-ga4';

// ⚠️ 重要：請替換為您的 Google Analytics 4 測量 ID
const GA_MEASUREMENT_ID = 'G-GWJH5XZQ1R'; // 替換為您的實際測量 ID

/**
 * 初始化 Google Analytics
 */
export const initGA = (): void => {
  try {
    ReactGA.initialize(GA_MEASUREMENT_ID, {
      gaOptions: {
        // 可選配置
        anonymizeIp: true, // 匿名化 IP 地址，遵守隱私法規
      },
      gtagOptions: {
        // 可選配置
        send_page_view: false, // 禁用自動頁面瀏覽追蹤，手動控制
      },
    });
    
    console.log('Google Analytics initialized');
  } catch (error) {
    console.error('Failed to initialize Google Analytics:', error);
  }
};

/**
 * 追蹤頁面瀏覽
 * @param path - 頁面路徑
 * @param title - 頁面標題
 */
export const logPageView = (path: string, title?: string): void => {
  try {
    ReactGA.send({
      hitType: 'pageview',
      page: path,
      title: title || document.title,
    });
  } catch (error) {
    console.error('Failed to log page view:', error);
  }
};

/**
 * 追蹤自定義事件
 * @param category - 事件類別
 * @param action - 事件動作
 * @param label - 事件標籤（可選）
 * @param value - 事件值（可選）
 */
export const logEvent = (
  category: string,
  action: string,
  label?: string,
  value?: number
): void => {
  try {
    ReactGA.event({
      category,
      action,
      label,
      value,
    });
  } catch (error) {
    console.error('Failed to log event:', error);
  }
};

/**
 * 追蹤工具使用事件
 * @param toolName - 工具名稱
 * @param action - 動作（如：open, close, export, etc.）
 * @param details - 額外詳情（可選）
 */
export const logToolUsage = (
  toolName: string,
  action: string,
  details?: string
): void => {
  logEvent('Tool Usage', action, `${toolName}${details ? ` - ${details}` : ''}`);
};

/**
 * 追蹤語言切換
 * @param language - 切換後的語言
 */
export const logLanguageChange = (language: string): void => {
  logEvent('User Interaction', 'Language Change', language);
};

/**
 * 追蹤錯誤
 * @param description - 錯誤描述
 * @param fatal - 是否為致命錯誤
 */
export const logError = (description: string, fatal: boolean = false): void => {
  try {
    ReactGA.event({
      category: 'Error',
      action: fatal ? 'Fatal Error' : 'Non-Fatal Error',
      label: description,
    });
  } catch (error) {
    console.error('Failed to log error event:', error);
  }
};
