import { useEffect } from "react";

/** The tile game has nothing to choose before the table opens. */
const SETTINGS = {};

export function OpenTilesTable({ onChange }: { onChange: (settings: object | null) => void }) {
  useEffect(() => {
    onChange(SETTINGS);
  }, [onChange]);
  return null;
}
