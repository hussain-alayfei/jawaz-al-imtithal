import type { MouseEvent } from "react";

/** Click handler for an in-app link: a plain click runs the shell's action, while a modified click
    (new tab, new window) is left to the browser and the link's real hash route. */
export function follow(action: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    action();
  };
}

/** Scrolls to a home-page section the way the header links do: the address shows the section's shareable
    hash (#/model), the section takes focus, and the scroll is smooth unless the visitor asked for reduced
    motion (tokens.css sets scroll-behavior on the root). */
export function goToSection(id: string, hash: string) {
  const target = document.getElementById(id);
  if (!target) return;
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
}
