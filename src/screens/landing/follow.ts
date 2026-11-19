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
