import { useRef } from "react";
import { Faq } from "./landing/Faq";
import { Files } from "./landing/Files";
import { Hero } from "./landing/Hero";
import { HowRows } from "./landing/HowRows";
import { Intro } from "./landing/Intro";
import { ModelStory } from "./landing/ModelStory";
import { Rules } from "./landing/Rules";
import { Twin } from "./landing/Twin";
import { useReveals } from "./landing/motion";
import type { LandingProps } from "./types";
import "./landing.css";

/* Home page (v6, quiet luxury): a full-screen opening photograph, a statement whose words brighten as it
   is read, then numbered sections in light type between thin rules: the three stages of a check, how the
   check works (the pinned model story), the reference clauses, the sample files to download or check,
   the digital twin (deep green), common questions. The shell renders the header and footer. Headings,
   words and pictures reveal slowly, once, as they arrive (landing/motion.ts); with reduced motion or
   without script everything is simply there. */
export default function Landing({ onStart, onSample, onTwin }: LandingProps) {
  const root = useRef<HTMLElement>(null);
  useReveals(root);

  return (
    <main ref={root} className="hm">
      <Hero onStart={onStart} onTwin={onTwin} />
      <Intro />
      <HowRows />
      <ModelStory onStart={onStart} />
      <Rules />
      <Files onSample={onSample} />
      <Twin onTwin={onTwin} />
      <Faq />
    </main>
  );
}
