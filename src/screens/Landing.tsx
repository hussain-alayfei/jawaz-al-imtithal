import { Hero } from "./landing/Hero";
import { HowRows } from "./landing/HowRows";
import { ModelStory } from "./landing/ModelStory";
import { Rules } from "./landing/Rules";
import { Twin } from "./landing/Twin";
import type { LandingProps } from "./types";
import "./landing.css";

/* Home page (v5): a full-bleed opening photograph, then white space, big type and big pictures. Hero, the
   three stages of a check, how the check works (the model story, the one interactive moment), the
   reference clauses, the digital twin. The shell renders the header and footer. Both calls to action start
   a new check; the hero's second link scrolls to the model story. */
export default function Landing({ onStart, onTwin }: LandingProps) {
  return (
    <main className="hm">
      <Hero onStart={onStart} />
      <HowRows />
      <ModelStory onStart={onStart} />
      <Rules />
      <Twin onTwin={onTwin} />
    </main>
  );
}
