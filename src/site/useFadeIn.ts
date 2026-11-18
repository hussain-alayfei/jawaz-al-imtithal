import { useEffect } from "react";

/**
 * One simple fade for the whole site: elements with the class `fade-in` fade up once when they
 * enter the viewport. Without IntersectionObserver, or with reduced motion, nothing is hidden.
 * Visibility is stored in a `data-shown` attribute, not a class: React rewrites `className` on
 * re-render but leaves attributes it does not manage alone, so a shown element never hides again.
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
          entry.target.setAttribute("data-shown", "");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const watch = (scope: ParentNode) => {
      scope.querySelectorAll?.(".fade-in:not([data-shown])").forEach((element) => io.observe(element));
    };
    watch(document);
    const mo = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.classList.contains("fade-in") && !node.hasAttribute("data-shown")) io.observe(node);
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
