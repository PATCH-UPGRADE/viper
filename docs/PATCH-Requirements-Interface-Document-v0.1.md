# PATCH Requirements and Interface Document

**Version:** 0.1 (November 2025 Submission)
**Date:** November 23, 2025
**Deliverable:** 2.4.1 Requirements Interface Document
**Program:** ARPA-H UPGRADE
**Prime Contractor:** Northeastern University (PATCH)

---

## 1. Document Introduction
**Document Purpose:** This document defines the requirements and interface specifications for integrating the PATCH TA1 Vulnerability Management Platform (known as PULSE) with other Technical Area (TA) performers in the ARPA-H UPGRADE program. PULSE is the primary user interface and integration point for the PATCH team's contribution to the ARPA-H UPGRADE program.

**Living Document:** The specifications defined herein represent our current understanding of integration requirements based on initial performer consultations and program kickoff discussions. As the ARPA-H UPGRADE program progresses and TA performers (TA2, TA3, TA4) advance their technical approaches, this document will also evolve.

**Document Structure:** The document is organized into the following sections:
1. Document Introduction
2. PULSE Overview
3. Integration Plan
4. Open Issues and Decisions Needed

**Version Control:** This document is version controlled in git, and available at https://github.com/PATCH-UPGRADE/pulse/blob/main/docs/PATCH-Requirements-Interface-Document-v0.1.md

**OpenAPI Spec:** Detailed API specifications are not provided in this document, but may be generated at any time from a PULSE instance.

Run `npm run openapi:generate` or visit the server at
`/api/openapi-ui` (UI) or `/api/openapi.json` (JSON file).

---

## 2. PULSE Overview 

```
┌───────────────────────────────────────────────────────────────────────┐
│                         PULSE VMP                                     │
│                         (TA1 Integration Hub)                         │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ VMP Core Components                                             │  │
│  │  • /assets: Asset Management                                    │  │
│  │  • /vulnerabilities: Vulnerability Management (TA3 integration) │  │
│  │  • /remediations: Remediations  (TA4 integration)                │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ Whole Hospital Simulation (WHS)                                 │  │
│  │  • /workflows: Clinical workflows                               │  │
│  │  • /simulations: WHS simulations                                │  │
│  │  • /emulators:  TA2 emulator registry                           │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│                                                                       │
│                           ↑         ↑         ↑                       │
└───────────────────────────│─────────│─────────│───────────────────────┘
                            │         │         │
                   ┌────────┘         │         └────────┐
                   │                  │                  │
           ┌───────────────┐  ┌──────────────┐  ┌──────────────┐
           │     TA2       │  │     TA3      │  │     TA4      │
           │    Device     │  │     Vuln     │  │  Remedia-    │
           │  Emulation    │  │  Discovery   │  │    tion      │
           │               │  │              │  │              │
           │ Pushes docker │  │ Submits SARIF│  │   Submits    │
           │    images +   │  │  + POVs via  │  │ remediation  │
           │ assets API.   │  │    API       │  │  via API.    │
           └───────────────┘  └──────────────┘  └──────────────┘

```

PULSE is designed to help hospital administrators understand the operational impact of vulnerabilities and remediations -- across systems, safety, and operational workflows. Since the hospital security ecosystem is inherently heterogeneous, PULSE serves as a system of record by integrating with downstream systems such as TA2-4, existing commercial systems, and open source tools.

PULSE is API centric, and uses a hub-and-spoke architecture where:

- Users view assets, vulnerabilities, remediations, simulations, and decisions.

- Users create hospital-centric workflows, and use these workflows as the basis for modeling the clinical and operational impact for cybersecurity decisions.

- Performers and existing tools (e.g., asset management) plug in as an information source, and register hypermedia-style API callbacks (a la GitHub API) that users can follow for more information.

- Standards-based data formats (CPE, SARIF, OpenAPI) ensure that external tools—commercial and open-source—can interoperate cleanly with the VMP and performer services.

Instead of baking every possible analytic or reporting workflow into the core, PULSE exposes:

- Core APIs for downstream performers to upload and retrieve information.

- Extension links to downstream Performer APIs that may have APIs and components deployed independently.

**Goals**

- Loose coupling: PULSE and performers can evolve independently.

- Discoverability: Clients discover more information from sources via links. For example, PULSE maintains a link to a source API where it pulls asset lists from.

- Composability: Orchestrators (e.g., AI agents, hospital IT workflows) can chain VMP + performer calls.

- Replaceability: One TA2/3/4 performer can be swapped out without changing VMP or clients.

**Non-goals.** The VMP keeps an inventory of assets, what network they are on, and vulnerabilities _to the extent necessary to perform decision support_. Pulse does not:

- Replace existing commercial vulnerability management platforms, e.g., Qualys VMDR, Tenable Vulnerability Management, etc. Instead, it maintains a reference to those systems where users can get more information.

- QA other components. PULSE assumes, for example, when TA3 says there is a vulnerability that it does not need to verify that report. Instead, PULSE maintains a reference to the TA3 exploit, which it assumes works as intended.

### Anchor story and walk-through

**Anchor User Story:**

> If I deploy this patch in the ICU monitor today, how many patient systems
> will be offline and for how long? How will treatments be affected?
> What security risk remains if I delay it 24 hours? How do these choices
> affect compliance, safety, and cost?

**Mindset:**
Rather than thinking of the VMP as a raw network simulator, think of it as a hospital digital twin, where each system is a node representing a _clinical function_, not just an IP address.

- **Nodes:** ICU monitors, infusion pumps, lab analyzers, pharmacy servers,
  nurse electronic medical record (EMR) workstations.
- **Edges:** Data or workflow dependencies ("Lab -> EMR -> Nurse Station ->
  Infusion pump")
- **Attributes:** Vulnerability score, patch status, uptime requirement,
  regulatory criticality.

A core component of the VMP is to enable users to perform hospital
simulations to understand outcomes.

**Example Answer to Anchor Story:**

Consider the workflow:

> Lab -> EMR -> Nurse Station -> Infusion pump

When a downstream TA proposes a change (e.g., TA4 asks to apply patch to all
infusion pumps running InsecureOS4.1), the VMP:

- Highlights _affected device nodes_ for the security engineer and _affected
  clinical nodes_ for the clinician.
- Gathers data from the WHS on hospital impact.
- Generates _summary metrics_ for application to the real hospital: downtime,
  risk reduction, clinical impact, regulatory delta.

- Impact summary produced, e.g., "patching now reduces exploit risk 92%
  (determined by CVSS score) on 15 machines, causing 0.5 hours downtime in
  radiology with affected machines."
- Produces recommendation: "Apply to radiology systems at midnight; schedule remaining
  across network for low-load hours."

### API-Centric Design

- PULSE exposes APIs for integration. (All references in this document are
  nested under `/api` on the server.)

- Every request to the REST API includes an HTTP method and a path, and a bearer token for authenticated endpoints.

- Depending on the REST API endpoint, you might also need to specify request headers, authentication information, query parameters, or body parameters.

- Endpoints are RESTful, supporting POST, GET, DELETE, and UPDATE.

- HTTP status codes reflect API success, e.g., 2xx reflects a successful API
  request.

- Field names are spinal-case, not camelCase and not snake_case. Because
  snake_case requires the shift key, and camelCase is less readable.

### Data formats

We use NIST-standardized formats:

- CPE / CPE 2.3: Identifies the platform for a particular finding or asset (All performers).

- SARIF 2.1.0: Vulnerability discovery (TA3).

- URI: Upstream reference to more information, e.g., a particular exploit.

- OpenAPI (service contracts)

- Docker images (emulation). Any non-container emulation (e.g., VMs) must be hosted outside PULSE.

---

## 3. Integration Plan

### 3.1 PULSE <> Asset Management Integration

PULSE maintains a database of assets, and a link to the upstream source where more information may be obtained.

- An asset management provider is registered via the `/assets/settings/` endpoint.
- Assets data is synced to PULSE periodically, and then available under the `/assets` view.
- Each listed asset includes an `upstream_url` field with the URL of the original provider.

### 3.2 PULSE <> TA2 Integration

PULSE maintains a registry of emulators, and optionally a container for the emulator. When an emulator is not available as a container, TA2 performers must provide a reference location where users can download the container.

1. TA1 exposes asset inventory → TA2 emulators for at least some assets in
   inventory.
2. TA2 publishes emulator to WHS registry or hosts externally.
3. PULSE performs internal matching and deployment orchestration
4. WHS integrates emulators into simulation environment for testing

**Storage Limits:**

- Maximum image size: 10 GB per image
- Maximum images per TA performer: 50
- Images may be removed between hackathons.

**Phase I Implementation:**

- PULSE team provisions Docker Registry during program setup
- TA2 performers receive registry credentials during onboarding
- TA2 performers either:
  - Container: push to the registry and update the `/emulators` endpoint, or
  - Update the `/emulators` endpoint and include a reference to where
    their emulator can be downloaded.

### 3.3 PULSE <> TA3 Integration

TA3's value proposition is discovering **unknown/novel vulnerabilities** that cannot be detected by commodity vulnerability scanning tools.

PULSE maintains a registry of vulnerabilities in SARIF 2.1.0 format, which is appropriate for unknown vulnerabilities.

**TA1 Role:**

- Provide asset inventory for vulnerability scanning targets
- Ingest and track discovered vulnerabilities

Non-goals:

- Provide WHS environment for POV validation. TA1 does not QA TA3 results.
- Store POV. Instead, PULSE stores a reference to the POV, identified by a
  URI. Anyone can pull the POV from that URL, and this allows flexibility for
  both TA3 and TA1 in the short term. We envision eventually there will be a
  standardized exploit invocation, e.g., `./exploit`, but for now we just
  reference the associated code location.

**Additional Textual Fields:**

TA3 MUST provide comprehensive textual descriptions to enable clinical risk assessment and LLM-based analysis:

- **`description`** (required): Human-readable explanation of the vulnerability (2-3 sentences)
- **`narrative`** (required): How the vulnerability can be exploited (attack vector, prerequisites)
- **`impact`** (required): Potential clinical consequences if
  exploited in hospital environment

- **`exploit_uri`** (optional): The URI where the POV resides.

**Batch Submission Guidelines:**

- TA3 MUST submit each vulnerability in a separate SARIF document. Submitting multiple vulnerabilities in a single SARIF document is not allowed. Each
  requires a separate post.
- Each `result` object represents one vulnerability finding
- The response `accepted` and `rejected` counts correspond to the number of `result` objects processed

---

### 3.4 TA1 ↔ TA4 Interface 

**TA4 Role:** Generate and provide patches/remediations for discovered vulnerabilities

**TA1 Role:**

- Provide vulnerability data and affected assets to TA4

---

## 4. Open Issues & Decisions Needed

### 4.1 Asset-to-Emulator Matching (TA2)

- **Issue:** TA1 and TA2 have different ideas for emulators.
- **Approach:**
  - TA1 will have a container registry as a service. Others can pull from
    this, but it's not key in the design.
  - TA1 will not provide VM hosting. Creating a brand new full cyber range capability for
    all the other TA performers seems out of scope.
  - TA2 can register the location of their emulators running within their own
    infra. This gives maximum flexibility to emulator design -- TA1's job is
    to redirect people to the emulator location, rather than trying to limit
    the different emulator approaches.
- **Decision Owner:** ARPA-H on direction.

### 4.2 Patch Metadata Completeness (TA4)

- **Issue:** Unknown what metadata TA4 can realistically provide for
  remediation. Could be any arbitrary machine or network action.
- **Approach:** TA4 provides a narrative on remediation, which is used in the
  WHS.

## 5. Contact and Support
For questions regarding this interface document, please contact the PATCH team.