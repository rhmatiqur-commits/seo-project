"use client";

import { useEffect } from "react";

/**
 * The workspace switcher and account menu are native <details> elements
 * (deliberately — no client state needed to open/close them). Native
 * <details> has no "light dismiss" behaviour though: clicking anywhere
 * else on the page, or pressing Escape, does nothing by default, which
 * reads as a bug the moment you actually click around. This adds exactly
 * those two expected behaviours globally, once, without turning either
 * component itself into a stateful client component.
 */
export function DismissibleDetails() {
  useEffect(() => {
    function closeOutside(target: Node) {
      document.querySelectorAll<HTMLDetailsElement>("details.dash-account-menu[open], details.dash-workspace-switcher[open]").forEach((el) => {
        if (!el.contains(target)) el.open = false;
      });
    }
    function onClick(e: MouseEvent) {
      if (e.target instanceof Node) closeOutside(e.target);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        document.querySelectorAll<HTMLDetailsElement>("details.dash-account-menu[open], details.dash-workspace-switcher[open]").forEach((el) => {
          el.open = false;
        });
      }
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return null;
}
