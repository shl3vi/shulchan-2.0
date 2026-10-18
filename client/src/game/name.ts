export function playerName(raw: string): string | null {
  const name = raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  if (name.length < 1 || name.length > 24) return null;
  return name;
}
