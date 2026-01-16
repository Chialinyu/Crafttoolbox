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

// 開發模式下開啟詳細日誌
const isDevelopment = import.meta.env.DEV;

/**
 * 初始化 Google Analytics
 */
export const initGA = (): void => {
  try {
    if (isDevelopment) {
      console.log('🔧 [GA Debug] Initializing Google Analytics...');
      console.log('🔧 [GA Debug] Measurement ID:', GA_MEASUREMENT_ID);
      console.log('🔧 [GA Debug] Environment:', import.meta.env.MODE);
    }

    ReactGA.initialize(GA_MEASUREMENT_ID, {
      gaOptions: {
        // 可選配置
        anonymizeIp: true, // 匿名化 IP 地址，遵守隱私法規
        debug_mode: isDevelopment, // 開發環境下啟用調試模式
      },
      gtagOptions: {
        // 可選配置
        send_page_view: false, // 禁用自動頁面瀏覽追蹤，手動控制
        debug_mode: isDevelopment, // 開發環境下啟用調試模式
      },
    });
    
    console.log('✅ Google Analytics initialized successfully');
    console.log('📊 Measurement ID:', GA_MEASUREMENT_ID);
    
    // 驗證 gtag 是否可用
    if (typeof window !== 'undefined' && typeof (window as any).gtag !== 'undefined') {
      console.log('✅ gtag function is available');
    } else {
      console.warn('⚠️ gtag function is NOT available - GA may be blocked');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Google Analytics:', error);
  }
};

/**
 * 追蹤頁面瀏覽
 * @param path - 頁面路徑
 * @param title - 頁面標題
 */
export const logPageView = (path: string, title?: string): void => {
  try {
    if (isDevelopment) {
      console.log('📄 [GA Debug] Page View:', { path, title: title || document.title });
    }
    
    ReactGA.send({
      hitType: 'pageview',
      page: path,
      title: title || document.title,
    });
    
    console.log('📊 GA Page View sent:', path);
  } catch (error) {
    console.error('❌ Failed to log page view:', error);
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
    if (isDevelopment) {
      console.log('🎯 [GA Debug] Event:', { category, action, label, value });
    }
    
    ReactGA.event({
      category,
      action,
      label,
      value,
    });
    
    console.log('📊 GA Event sent:', { category, action, label });
  } catch (error) {
    console.error('❌ Failed to log event:', error);
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