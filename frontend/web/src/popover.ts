import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/** Close a popover on outside click, Escape (returning focus) and navigation. */
export function usePopover() {
  const location = useLocation();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === location.pathname;
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenOn(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return {
    open,
    setOpen: (value: boolean) => setOpenOn(value ? location.pathname : null),
    root,
    button,
  };
}
