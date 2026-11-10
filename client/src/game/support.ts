export const SUPPORT_EMAIL = "support@shulchan.win";
/** Address shown to players on Support and Legal. */
export const CONTACT_EMAIL = "support@loochka.com";

export function supportMail(tableId?: string, name?: string, reason?: string) {
  const subject = tableId ? `LOOCHKA report ${tableId}` : "LOOCHKA";
  const lines = [
    tableId ? `Table: ${tableId}` : "",
    name ? `Player: ${name}` : "",
    reason ? `Reason: ${reason}` : "",
  ].filter(Boolean);
  const query = new URLSearchParams({ subject, ...(lines.length > 0 ? { body: lines.join("\n") } : {}) });
  return `mailto:${SUPPORT_EMAIL}?${query}`;
}
