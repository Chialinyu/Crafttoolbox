/**
 * Google Analytics 4 Integration
 * 
 * 提供輕量級的 GA4 事件追蹤，不影響應用性能
 */

// GA4 測量 ID
const GA_MEASUREMENT_ID = 'G-GWJH5XZQ1R';

// 定義 window.gtag 類型
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * 初始化 Google Analytics
 * 異步加載，不阻塞頁面渲染
 */
export const initGA = (): void => {
  // 避免重複初始化
  if (window.gtag) {
    return;
  }

  try {
    // 創建 dataLayer
    window.dataLayer = window.dataLayer || [];
    
    // 定義 gtag 函數
    window.gtag = function() {
      window.dataLayer?.push(arguments);
    };
    
    // 初始化配置
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: true,
    });

    // 異步加載 GA 腳本
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  } catch (error) {
    // GA initialization failed silently
  }
};

/**
 * 追蹤頁面瀏覽
 */
export const trackPageView = (pagePath: string, pageTitle?: string): void => {
  if (!window.gtag) return;
  
  try {
    window.gtag('event', 'page_view', {
      page_path: pagePath,
      page_title: pageTitle || document.title,
    });
  } catch (error) {
    // Silently fail
  }
};

/**
 * 追蹤工具使用事件
 */
export const trackToolUsage = (toolName: string, action: string, label?: string): void => {
  if (!window.gtag) return;
  
  try {
    window.gtag('event', action, {
      event_category: 'tool_usage',
      event_label: `${toolName}${label ? `: ${label}` : ''}`,
      tool_name: toolName,
    });
  } catch (error) {
    // Silently fail
  }
};

/**
 * 追蹤圖片上傳事件
 */
export const trackImageUpload = (toolName: string, fileSize?: number, fileType?: string): void => {
  if (!window.gtag) return;
  
  try {
    window.gtag('event', 'image_upload', {
      event_category: 'user_interaction',
      event_label: toolName,
      tool_name: toolName,
      file_size: fileSize,
      file_type: fileType,
    });
  } catch (error) {
    // Silently fail
  }
};

/**
 * 追蹤導出事件
 */
export const trackExport = (toolName: string, format: string, fileSize?: number): void => {
  if (!window.gtag) return;
  
  try {
    window.gtag('event', 'export', {
      event_category: 'conversion',
      event_label: `${toolName}: ${format}`,
      tool_name: toolName,
      export_format: format,
      file_size: fileSize,
    });
  } catch (error) {
    // Silently fail
  }
};

/**
 * 追蹤自定義事件
 */
export const trackEvent = (
  eventName: string,
  params?: Record<string, any>
): void => {
  if (!window.gtag) return;
  
  try {
    window.gtag('event', eventName, params);
  } catch (error) {
    // Silently fail
  }
};
