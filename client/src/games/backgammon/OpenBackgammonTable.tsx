import { useEffect } from "react";

/** The server still seats backgammon players in a poker hand, so it needs blinds and a buy-in. Nothing to choose. */
const SETTINGS = { smallBlind: 1, buyIn: 100 };

export function OpenBackgammonTable({ onChange }: { onChange: (settings: object | null) => void }) {
  useEffect(() => {
    onChange(SETTINGS);
  }, [onChange]);
  return null;
}
