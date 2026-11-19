import { Hero } from "./landing/Hero";
import { HowRows } from "./landing/HowRows";
import { ModelStory } from "./landing/ModelStory";
import { Rules } from "./landing/Rules";
import { Twin } from "./landing/Twin";
import type { LandingProps } from "./types";
import "./landing.css";

/* Home page (v4): white, big type, big pictures, few words. Hero, how it works, the model story (the one
   interactive moment), the clauses, the digital twin. The shell renders the header and footer. */
export default function Landing({ onStart, onSample, onTwin }: LandingProps) {
  const openSample = () => onSample("tiles");
  return (
    <main className="hm">
      <Hero onStart={onStart} onSample={openSample} />
      <HowRows />
      <ModelStory onSample={openSample} />
      <Rules />
      <Twin onTwin={onTwin} />
    </main>
  );
}
