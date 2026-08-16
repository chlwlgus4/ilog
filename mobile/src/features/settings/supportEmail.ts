export const SUPPORT_EMAIL = "ilog-support@ilog.io.kr";

export function buildSupportEmailUrl(subject: string, body = "") {
  const query = [`subject=${encodeURIComponent(subject)}`];

  if (body) {
    query.push(`body=${encodeURIComponent(body)}`);
  }

  return `mailto:${SUPPORT_EMAIL}?${query.join("&")}`;
}
