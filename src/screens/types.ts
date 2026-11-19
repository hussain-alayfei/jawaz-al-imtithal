import type { ActivityId, FacilityDetails } from "../data";
import type { ComplianceRun } from "../ifc/types";
import type { SampleId } from "../content/samples";

/* Contract between the app shell (src/App.tsx) and each screen. Screens must not change it. */

export interface LandingProps {
  /** Go to the new-check page. */
  onStart: () => void;
  /** Go to the new-check page with this sample chosen, on the review step (nothing runs until «ابدأ الفحص»). */
  onSample: (id: SampleId) => void;
  /** Open the digital twin studio (illustrative scenes, not a compliance result). */
  onTwin: () => void;
}

export interface CheckProps {
  activityId: ActivityId;
  facility: FacilityDetails;
  onActivityChange: (activityId: ActivityId) => void;
  onFacilityChange: (facility: FacilityDetails) => void;
  /** When set, choose this sample and open the review step; the check starts only from «ابدأ الفحص». */
  autoSample?: SampleId;
  /** Called once the check finished; the shell then shows the results screen. */
  onDone: (run: ComplianceRun) => void;
  onHome: () => void;
  /** Open the digital twin studio (for the illustrative BIM library). */
  onTwin: () => void;
}

export interface ResultsProps {
  run: ComplianceRun;
  onReport: () => void;
  onNew: () => void;
  onHome: () => void;
  onTwin: () => void;
  notify: (message: string) => void;
}

export interface ReportProps {
  run: ComplianceRun;
  onBack: () => void;
  onHome: () => void;
  notify: (message: string) => void;
}
