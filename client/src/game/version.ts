/** Negative when `left` is older than `right`. Compares the first three numeric parts. */
export function compareVersions(left: string, right: string) {
  const a = left.split(".");
  const b = right.split(".");
  for (let index = 0; index < 3; index += 1) {
    const av = Number(a[index] ?? 0);
    const bv = Number(b[index] ?? 0);
    const an = Number.isInteger(av) ? av : 0;
    const bn = Number.isInteger(bv) ? bv : 0;
    if (an !== bn) return an < bn ? -1 : 1;
  }
  return 0;
}
