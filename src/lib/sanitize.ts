// 車輛描述欄位存的是含 HTML 的長文本，輸出時會走 set:html。
// 後台輸入端應限制允許的標籤，但輸出端也必須淨化 —— 舊資料是既有的，
// 且「輸入端已驗證」不能當成輸出端不淨化的理由。
// 見 docs/08-security.md#輸入處理

/** 可執行內容的容器。標籤本身移除，內文保留 */
const BLOCK_TAGS = /<\/?(script|style|iframe|object|embed|link|meta|base|form|svg|math|template)\b[^>]*>/gi;
const SCRIPT_BODY = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const STYLE_BODY = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
/** on* 事件屬性，含有引號與無引號兩種寫法 */
const EVENT_ATTRS = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * 整條移除的屬性。
 *   style   —— 內含 url()／expression() 之外，也足以做 position:fixed 蓋版劫持點擊。
 *              排版樣式一律由前台 theme.css 決定，描述欄位不需要行內樣式。
 *   srcdoc  —— <iframe srcdoc> 等同一份新文件
 *   其餘    —— 會發出請求或帶出資源的舊式屬性
 */
const DROP_ATTRS =
  /\s(style|srcdoc|formaction|action|background|dynsrc|lowsrc|ping|srcset)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** 會載入或執行遠端內容的網址屬性 */
const URL_ATTRS = /\s(href|src|xlink:href|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

const NAMED_ENTITIES: Record<string, string> = {
  '&colon;': ':', '&tab;': '\t', '&newline;': '\n', '&NewLine;': '\n', '&lpar;': '(', '&rpar;': ')',
};

/**
 * 把屬性值正規化成「瀏覽器實際會看到的樣子」，只用來判斷協定，不用於輸出。
 *
 * ⚠️ 這一步是必要的，不能只比對字面上的 javascript:。瀏覽器在解析 href 之前
 *    會先解 HTML 實體、並丟掉 URL 裡的定位／換行／NUL 等字元，所以
 *    java&#115;cript: 與 java<TAB>script: 都會變成可執行的 javascript:。
 *    2026-08-07 的 debug 就是在這裡找到繞過。
 */
function normalizeUrl(value: string): string {
  let v = value;
  for (const [ent, ch] of Object.entries(NAMED_ENTITIES)) v = v.split(ent).join(ch);
  v = v
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  // 控制字元與所有空白在 scheme 判定時都不算存在
  return v.replace(/[\s\u0000-\u0020\u007f-\u00a0\u200b-\u200f\ufeff]/g, '').toLowerCase();
}

const DANGEROUS_SCHEME = /^(javascript|vbscript|livescript|mocha):/i;
/** data: 只放行圖片 —— data:text/html 等同夾帶一份可執行的新文件 */
const BAD_DATA_URI = /^data:(?!image\/(png|jpe?g|gif|webp)[;,])/i;

const isDangerousUrl = (raw: string): boolean => {
  const v = normalizeUrl(raw);
  return DANGEROUS_SCHEME.test(v) || BAD_DATA_URI.test(v);
};

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
    .replace(DROP_ATTRS, '')
    // 網址屬性逐個判斷：協定危險就整條屬性丟掉，安全就原樣留下
    .replace(URL_ATTRS, (whole, _name, dq, sq, bare) => {
      const raw = dq ?? sq ?? bare ?? '';
      return isDangerousUrl(raw) ? '' : whole;
    });
}
