import { useEffect } from "react";

/**
 * One simple fade for the whole site: elements with the class `fade-in` fade up once when they
 * enter the viewport. Without IntersectionObserver, or with reduced motion, nothing is hidden.
 */
export function useFadeIn() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.classList.add("js-fade");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const watch = (scope: ParentNode) => {
      scope.querySelectorAll?.(".fade-in:not(.is-visible)").forEach((element) => io.observe(element));
    };
    watch(document);
    const mo = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.classList.contains("fade-in") && !node.classList.contains("is-visible")) io.observe(node);
          watch(node);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      root.classList.remove("js-fade");
    };
  }, []);
}
