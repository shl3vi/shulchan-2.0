import { useEffect } from "react";

/** Backgammon has nothing to choose before the table opens. */
const SETTINGS = {};

export function OpenBackgammonTable({ onChange }: { onChange: (settings: object | null) => void }) {
  useEffect(() => {
    onChange(SETTINGS);
  }, [onChange]);
  return null;
}
