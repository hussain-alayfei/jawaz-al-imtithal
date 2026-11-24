import { useEffect } from "react";
import { Faq } from "./landing/Faq";
import { Hero } from "./landing/Hero";
import { HowRows } from "./landing/HowRows";
import { ModelStory } from "./landing/ModelStory";
import { Rules } from "./landing/Rules";
import { Twin } from "./landing/Twin";
import type { LandingProps } from "./types";
import "./landing.css";

/* Home page (v5): a full-bleed opening photograph, then white space, big type and big pictures. Hero, the
   three stages of a check, how the check works (the model story, the one interactive moment), the
   reference clauses, the digital twin, common questions. The shell renders the header and footer. The hero
   starts a check or opens the digital twin studio. */
/** Blocks that fade in once as they come into view (landing.css: .hm-reveal / .is-in). */
const REVEAL = ".hm-head, .hm-row, .hm-clauses, .hm-faq__list";

export default function Landing({ onStart, onTwin }: LandingProps) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = [...document.querySelectorAll<HTMLElement>(`.hm ${REVEAL.split(", ").join(", .hm ")}`)];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const item of items) {
      item.classList.add("hm-reveal");
      observer.observe(item);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <main className="hm">
      <Hero onStart={onStart} onTwin={onTwin} />
      <HowRows />
      <ModelStory onStart={onStart} />
      <Rules />
      <Twin onTwin={onTwin} />
      <Faq />
    </main>
  );
}
