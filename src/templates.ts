export function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 템플릿 본문의 {{date}}, {{month}} 를 오늘 날짜로 바꾼다 */
export function applyTemplate(body: string) {
  const d = today();
  return body.replace(/\{\{\s*date\s*\}\}/g, d).replace(/\{\{\s*month\s*\}\}/g, d.slice(0, 7));
}
