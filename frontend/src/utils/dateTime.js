export const NEPAL_TIME_ZONE = "Asia/Kathmandu";

function parseDateInput(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatNepalDateTime(value, options = {}) {
  const date = parseDateInput(value);
  if (!date) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: NEPAL_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatNepalDate(value, options = {}) {
  const date = parseDateInput(value);
  if (!date) return "N/A";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: NEPAL_TIME_ZONE,
    ...options,
  }).format(date);
}
