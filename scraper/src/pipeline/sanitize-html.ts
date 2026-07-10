const REMOVE_TAGS = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<noscript[\s\S]*?<\/noscript>|<iframe[\s\S]*?<\/iframe>|<link[^>]*>|<meta[^>]*>)/gi;
const HTML_COMMENTS = /<!--[\s\S]*?-->/g;
const NAV_SECTIONS = /<(nav|header|footer)[\s\S]*?<\/\1>/gi;
const ALL_ATTRS_EXCEPT_HREF = /(<a\s)(?:[^>]*?)(href="[^"]*")(?:[^>]*?)(>)/gi;
const NON_ANCHOR_ATTRS = /(<(?!a[\s>])(\w+))\s[^>]*?(\/?>)/gi;
const CONSECUTIVE_WHITESPACE = /[ \t]+/g;
const CONSECUTIVE_NEWLINES = /\n{3,}/g;
const HTML_TAGS_NOISE = /<\/?(?:div|span|section|article|main|aside|figure|figcaption|picture|source|br|hr|img|input|button|form|label|select|option|textarea|fieldset|legend|details|summary|dialog|template|slot|canvas|video|audio|embed|object|param|map|area)[^>]*>/gi;

const MAX_CHARS = 80_000;

export function sanitizeHtml(raw: string): string {
  let html = raw;

  html = html.replace(REMOVE_TAGS, "");
  html = html.replace(HTML_COMMENTS, "");
  html = html.replace(NAV_SECTIONS, "");

  html = html.replace(ALL_ATTRS_EXCEPT_HREF, "$1$2$3");
  html = html.replace(NON_ANCHOR_ATTRS, "$1$3");

  html = html.replace(HTML_TAGS_NOISE, " ");

  html = html.replace(/<[^>]+>/g, (tag) => {
    if (/^<\/?(?:a|h[1-6]|p|ul|ol|li|table|tr|td|th|thead|tbody|strong|em|b|i|dl|dt|dd)\b/i.test(tag)) {
      return tag;
    }
    return " ";
  });

  html = html.replace(/&nbsp;/gi, " ");
  html = html.replace(/&amp;/gi, "&");
  html = html.replace(/&lt;/gi, "<");
  html = html.replace(/&gt;/gi, ">");
  html = html.replace(CONSECUTIVE_WHITESPACE, " ");
  html = html.replace(CONSECUTIVE_NEWLINES, "\n\n");
  html = html.trim();

  if (html.length > MAX_CHARS) {
    html = html.slice(0, MAX_CHARS);
  }

  return html;
}
