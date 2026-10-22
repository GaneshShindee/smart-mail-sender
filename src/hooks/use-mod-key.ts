import { useEffect, useState } from "react";

/** "⌘" on Apple platforms, "Ctrl" elsewhere. Resolved after mount to stay SSR-safe. */
export function useModKey() {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) setMod("⌘");
  }, []);
  return mod;
}
