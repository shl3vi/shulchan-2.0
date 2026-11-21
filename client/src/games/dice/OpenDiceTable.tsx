import { useEffect } from "react";

/** The dice game has nothing to choose before the table opens. */
const SETTINGS = {};

export function OpenDiceTable({ onChange }: { onChange: (settings: object | null) => void }) {
  useEffect(() => {
    onChange(SETTINGS);
  }, [onChange]);
  return null;
}
