export function maskSensitive(value: string | undefined | null, visibleStart = 4, visibleEnd = 4) {
  if (!value) return "—";
  if (value.length <= visibleStart + visibleEnd) return "•".repeat(Math.max(4, value.length));
  return `${value.slice(0, visibleStart)}${"•".repeat(Math.max(4, value.length - visibleStart - visibleEnd))}${value.slice(-visibleEnd)}`;
}
