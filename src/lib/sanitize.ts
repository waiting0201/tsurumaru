// 車輛描述欄位存的是含 HTML 的長文本，輸出時會走 set:html。
// 後台輸入端應限制允許的標籤，但輸出端也必須淨化 —— 舊資料是既有的，
// 且「輸入端已驗證」不能當成輸出端不淨化的理由。
// 見 docs/08-security.md#輸入處理

const BLOCK_TAGS = /<\/?(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi;
const SCRIPT_BODY = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const STYLE_BODY = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
/** on* 事件屬性，含有引號與無引號兩種寫法 */
const EVENT_ATTRS = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
/** javascript:／data:text/html 之類的協定 */
const BAD_PROTOCOL = /\s(href|src|xlink:href)\s*=\s*(?:"|')?\s*(?:javascript|vbscript|data:text\/html)[^"'\s>]*(?:"|')?/gi;

/**
 * 移除可執行內容，保留一般排版標籤。
 * 這是防禦性的白名單外過濾，不是完整的 HTML 解析器 —— 對於後台自產的
 * 內容足夠，若日後開放外部投稿必須換成真正的 sanitizer。
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(SCRIPT_BODY, '')
    .replace(STYLE_BODY, '')
    .replace(BLOCK_TAGS, '')
    .replace(EVENT_ATTRS, '')
    .replace(BAD_PROTOCOL, '');
}
