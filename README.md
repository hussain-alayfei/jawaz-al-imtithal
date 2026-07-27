# جواز الامتثال | Compliance Passport

مساعد رقمي للفحص الاستباقي للمخططات الهندسية قبل رفع طلب الرخصة.

Compliance Passport is a pre-submission engineering compliance checker. It
reads structured BIM/IFC models, applies traceable rules, identifies issues in
their model locations, and produces an actionable readiness report.

> This product supports applicants and engineering offices. It does not issue
> official approvals or replace review by a municipality, engineering office,
> or other competent authority.

## Product goal

Reduce avoidable submission rework by detecting automatically verifiable
issues before an application is submitted.

The intended flow is:

1. Select the establishment activity and enter its basic information.
2. Upload a structured BIM model in IFC format.
3. Validate the model's quality and required information.
4. Apply versioned compliance rules.
5. Review passed, failed, and needs-review results.
6. Locate each issue in a 3D model viewer.
7. Export a report containing the rule source and suggested action.

## Prototype scope

- Four activity examples: restaurant, café, outpatient clinic, and beauty salon
- Two prepared IFC fixtures per activity (`review` and `ready`)
- Ten deterministic demonstration rules per activity
- Activity-specific, interactive 3D fit-outs with architectural construction
- Rule results linked to IFC GUIDs
- Three result states: `pass`, `fail`, and `unknown`
- Activity-aware readiness reports

Examples of prototype checks include required spaces, room metadata, door
width, accessible routes, sanitary facilities, exits, and required ventilation
information. Exact thresholds must come from approved source documents and be
reviewed by a qualified domain expert.

## Technical direction

The system should be deterministic at its core:

```text
IFC/BIM model
    -> model quality checks
    -> structured building data
    -> versioned rule engine
    -> evidence-backed findings
    -> 3D viewer and report
```

Suggested components for later implementation:

- Web application: React / Next.js
- IFC viewer: `web-ifc` or That Open Engine
- IFC processing: Python with IfcOpenShell
- Rules: versioned, testable rule definitions
- Findings: JSON results linked to IFC GUIDs
- AI assistance: explanation and retrieval from approved sources, not the
  final compliance decision

## Important boundaries

- Start with IFC/BIM rather than arbitrary PDFs.
- The 3D viewer is the presentation layer; structured data and the rule engine
  are the product core.
- A drawing represents the design (`as-designed`), not proof of actual
  construction (`as-built`).
- Unknown or insufficient evidence must result in `needs_review`, never an
  invented pass.
- Every finding must retain its rule source, version, evidence, and model
  location.

## Status

Functional proof-of-concept implemented with an Arabic-first RTL interface,
deterministic multi-sector rule fixtures, a live interactive 3D model,
model-linked findings, and printable/downloadable readiness reports.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

Verification commands:

```bash
npm test
npm run build
npm run test:e2e
```

The end-to-end test uses the installed Chrome browser and saves review
screenshots under `artifacts/e2e/`.

## Prototype note

The bundled sector examples are deterministic semantic 3D fixtures linked to
stable IFC-like identifiers. The small IFC files under `public/samples/`
exercise the upload and validation flow for every activity and state.
Arbitrary IFC geometry parsing is intentionally not claimed in this version;
integrating `web-ifc` against verified production models is a later phase.
