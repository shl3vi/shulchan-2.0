export function playerName(raw: unknown): string | null {
  const name = String(raw ?? "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
  if (name.length < 1 || name.length > 24) return null;
  return name;
}
