# PATCH Requirements and Interface Document

**Version:** 0.1 (November 2025 Submission)
**Date:** November 20, 2025
**Deliverable:** 2.4.1 Requirements Interface Document
**Program:** ARPA-H UPGRADE
**Prime Contractor:** Northeastern University (PATCH)

---

## Executive Summary

**PULSE**, the PATCH Vulnerability Management Platform (VMP), is the primary user interface and integration point between the PATCH team and other Technical Area (TA) performers in the ARPA-H UPGRADE program.

**Living Document:** The specifications defined herein represent our current understanding of integration requirements based on initial performer consultations and program kickoff discussions. As the ARPA-H UPGRADE program progresses and TA performers (TA2, TA3, TA4) advance their technical approaches, this document will also revolve.

**Version Control:** This document is version controlled in git, and available at https://github.com/PATCH-UPGRADE/pulse/blob/main/docs/PATCH-Requirements-Interface-Document-v0.1.md

### At a glance

```
┌───────────────────────────────────────────────────────────────────────┐
│                         PULSE VMP                                     │
│                         (TA1 Integration Hub)                         │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ VMP Core Components                                             │  │
│  │  • /assets: Asset Management                                    │  │
│  │  • /vulnerabilities: Vulnerability Management (TA3 integration) │  │
│  │  • /remediations: Remedations  (TA4 integration)                │  │
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

PULSE is API centric, and uses a hub-and-spokes architecture which:

- Users view assets, vulnerabilities, remediations, simulations, and decisions.

- Users create hospital-centric workflows, and use these workflows as the basis for modeling the clinical and operational impact for cybersecurity decisions.

- Performers and existing tools (e.g., asset management) plug in as an information source, and register hypermedia-style API callbacks (ala github API) that users can follow for more information.

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

- Replace existing commercial vulnerability management platforms, e.g., Qualys VMDR, Tenable Vulnerability Management, etc). Instead, it maintains a reference to those systems where users can get more information.

- QA other components. PULSE assumes, for example, when TA3 says there is a vulnerability that it must check that to be true. Instead, PULSE maintains a reference to the TA3 exploit, which it assumes works as intended.

### Anchor story and walk-through

**Anchor User Story:**

> If I deploy this patch in the ICU monitor today, how many patient systems
> will be offline and for how long? How will treatments be affected?
> What security risk remains if I delay it 24 hours? How do these choices
> affect compliance, safety, and cost?

**Mindset:**
Rather than thinking of the VMP as a raw network simulator, think of it as
hospital digital twin, where each system is a node representing a _clinical
function_, not just an IP address.

- **Nodes:** ICU monitors, infusion pumps, lab analyzers, pharmacy servers,
  nurse electronic medical record (EMR) workstations.
- **Edges:** Data or work flow dependencies ("Lab -> EMR -> Nurse Station ->
  Infusion pump")
- **Attributes:** Vulnerability score, patch status, uptime requirement,
  regulatory criticality.

A core component of the VMP is to enable users to perform hospital
simulations to understand outcomes.

**Example Answer to Anchor Story:**

Consider the workflow:

> Lab -> EMR -> Nurse Station -> Infusion pump

When a downstream TA proposes a change (e.g., TA-4 asks to apply patch to all
infusion pumps running InsecureOS4.1), the VMP:

- Highlights _affects device nodes_ for the security engineer and _affected
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

- Every request to the REST API includes an HTTP method and a path, and a bearer token for authenticcated endpoints.

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

## Integration Plan

### PULSE <> Asset Management Integration

PULSE maintains a database of assets, and a link to the upstream source where more information may be obtained.

- An asset management provider is registered via the `/assets/settings/` endpoint.
- Assets data is synced to PULSE periodically, and then available under the `/assets` view.
- Each listed asset includes an `upstream_url` field with the URL of the original provider.

### PULSE <> TA2 Integration

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

### PULSE <> TA3 Integration

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
  reference where the associated code is at.

**Additional Textual Fields:**

TA3 MUST provide comprehensive textual descriptions to enable clinical risk assessment and LLM-based analysis:

- **`description`** (required): Human-readable explanation of the vulnerability (2-3 sentences)
- **`narrative`** (required): How the vulnerability can be exploited (attack vector, prerequisites)
- **`impact`** (required): Potential clinical consequences if
  exploited in hospital environment

- **`exploit_uri`** (optional): The URI where the POV resides.

**Batch Submission Guidelines:**

- TA3 MAY NOT submit multiple vulnerabilities in a single SARIF document. Each
  requires a separate post.
- Each `result` object represents one vulnerability finding
- The response `accepted` and `rejected` counts correspond to the number of `result` objects processed

---

## 5. TA1 ↔ TA4 Interface (Remediation)

### 5.1 Integration Overview

**TA4 Role:** Generate and provide patches/remediations for discovered vulnerabilities

**TA1 Role:**

- Provide vulnerability data and affected assets to TA4
- Simulate clinical impact of proposed remediations in WHS
- Orchestrate remediation deployment
- Track remediation status

### 5.2 Remediation Query and Submission Endpoints

### 5.2.1 API: GET /api/v1/remediations

**Description:** Retrieve all remediations or filtered subset

**Request:**

```http
GET /api/v1/remediations?status=under_review&cve=CVE-2024-1234
```

**Query Parameters:**

- `status` (optional): Filter by status (under_review | approved | deployed | rejected)
- `cve` (optional): Filter by CVE identifier
- `assetUuid` (optional): Filter by affected asset
- `remediationType` (optional): Filter by type

**Response:**

```json
{
  "remediations": [
    {
      "remediationId": "patch-2024-1234-001",
      "cve": "CVE-2024-1234",
      "status": "under_review",
      "remediationType": "patch",
      "submittedDate": "2024-11-19T10:00:00Z"
    }
  ]
}
```

**Response Codes:**

- `200 OK`: Success
- `400 Bad Request`: Invalid filter parameters

### 5.2.2 API: GET /api/v1/remediations/{id}

**Description:** Retrieve single remediation with full details including status and impact

**Request:**

```http
GET /api/v1/remediations/patch-2024-1234-001
```

**Response:**

```json
{
  "remediationId": "patch-2024-1234-001",
  "cve": "CVE-2024-1234",
  "status": "under_review",
  "remediationType": "patch | configuration | workaround | upgrade | firewall_rule | ebpf_rule",
  "affectedAssets": ["cfe7db8c-b313-4efe-aee5-40e55ba3d1bf"],
  "submittedDate": "2024-11-19T10:00:00Z",
  "impact": {
    "requiresReboot": true,
    "estimatedDowntimeMinutes": 12,
    "servicesAffected": ["Windows Update", "Remote Desktop"]
  },
  "patchArtifact": {
    "type": "msi | exe | script | configuration | firmware",
    "url": "https://ta4-cdn.example.com/patches/patch-2024-1234-001.msi",
    "hash": "sha256:abc123...",
    "size": "45MB"
  }
}
```

**Response Codes:**

- `200 OK`: Success
- `404 Not Found`: Remediation ID not found

### 5.3 Remediation Request

TA1 initiates remediation by providing TA4 with vulnerability context.

**API: POST /api/v1/remediation/request (TA1 → TA4)**

**Request:**

```http
POST /api/v1/remediation/request
Content-Type: application/json

{
  "requestId": "rem-req-001",
  "vulnerabilities": [
    {
      "cve": "CVE-2024-1234",
      "affectedAssets": [
        {
          "uuid": "cfe7db8c-b313-4efe-aee5-40e55ba3d1bf",
          "cpe": "cpe:2.3:o:microsoft:windows_11:22000.1696:*:*:*:pro:*:*:*",
          "location": "ER",
          "clinicalFunction": "Patient intake workstation"
        }
      ],
      "severity": "critical",
      "cvss": 9.8
    }
  ],
  "constraints": {
    "maxDowntimeMinutes": 30,
    "maintenanceWindows": ["2024-11-20T02:00:00Z"],
    "criticalSystems": ["ICU", "ER"]
  }
}
```

### 5.3 Remediation Response Format

**Remediation Metadata Requirements:**

TA4 responses MUST include sufficient metadata for clinical impact assessment:

```json
{
  "remediationId": "patch-2024-1234-001",
  "cve": "CVE-2024-1234",
  "remediationType": "patch | configuration | workaround | upgrade | firewall_rule | ebpf_rule",
  "affectedAssets": ["cfe7db8c-b313-4efe-aee5-40e55ba3d1bf"],
  "patchArtifact": {
    "type": "msi | exe | script | configuration",
    "url": "https://ta4-cdn.example.com/patches/patch-2024-1234-001.msi",
    "hash": "sha256:abc123...",
    "size": "45MB"
  },
  "supportingDocumentation": {
    "deploymentInstructions": {
      "url": "https://ta4-docs.example.com/deploy/patch-2024-1234-001.pdf",
      "format": "pdf | md",
      "steps": [
        "Pre-deployment checklist",
        "Installation procedure",
        "Verification steps"
      ]
    },
    "rollbackProcedure": {
      "url": "https://ta4-docs.example.com/rollback/patch-2024-1234-001.md",
      "estimatedRollbackMinutes": 15
    },
    "releaseNotes": {
      "url": "https://ta4-docs.example.com/releases/patch-2024-1234-001.md"
    }
  },
  "deploymentRequirements": {
    "requiresReboot": true,
    "estimatedDowntimeMinutes": 12,
    "prerequisites": ["KB5034120"],
    "rollbackSupported": true
  },
  "impactAssessment": {
    "servicesAffected": ["Windows Update", "Remote Desktop"],
    "dataLoss": false,
    "configurationChanges": ["Registry: HKLM\\..."]
  },
  "testing": {
    "testedOn": ["Windows 11 22000.1696", "Windows 11 22621.963"],
    "whsValidated": true,
    "validationReport": "https://ta4.example.com/reports/patch-2024-1234-001.pdf"
  },
  "vendorInformation": {
    "msrcBulletin": "https://msrc.microsoft.com/...",
    "releaseDate": "2024-01-20T00:00:00Z"
  }
}
```

### 5.4 API: POST /api/v1/remediations (TA4 → TA1)

**Description:** TA4 submits proposed remediation to TA1

**Request:**

```http
POST /api/v1/remediations
Content-Type: application/json

{
  "remediation": { /* Remediation metadata as above */ }
}
```

**Request with Webhook Callback:**

```http
POST /api/v1/remediations
Content-Type: application/json

{
  "remediation": { /* Remediation metadata as above */ },
  "statusWebhook": {
    "url": "https://ta4-callback.example.com/patch-status",
    "secret": "webhook-secret-for-signature-validation",
    "events": ["review_complete", "deployment_started", "deployment_complete", "deployment_failed"]
  }
}
```

**Response:**

```json
{
  "remediationId": "patch-2024-1234-001",
  "status": "accepted | under_review | rejected",
  "whsSimulationScheduled": true,
  "estimatedReviewTime": "4 hours",
  "webhookRegistered": true
}
```

### 5.4.1 Webhook Callback Format

When TA4 provides a `statusWebhook`, VMP will POST status updates to the specified URL:

**Callback Payload:**

```json
{
  "event": "review_complete | deployment_started | deployment_complete | deployment_failed",
  "remediationId": "patch-2024-1234-001",
  "timestamp": "2024-11-20T03:00:00Z",
  "status": "approved | rejected | deploying | completed | failed | rolled_back",
  "details": {
    "reviewOutcome": "approved",
    "reviewNotes": "Clinical impact acceptable within maintenance window",
    "deployedAssets": 15,
    "failedAssets": 0
  },
  "signature": "HMAC-SHA256 signature using provided secret"
}
```

**Security:**

- Webhook URLs must use HTTPS
- VMP signs payloads with HMAC-SHA256 using the provided secret
- TA4 should verify signatures before processing callbacks
- Retry policy: 3 attempts with exponential backoff (1s, 10s, 60s)

**Alternative: Polling**
If webhook is not provided, TA4 can poll for status using `GET /api/v1/remediations/{id}`

### 5.5 Clinical Impact Simulation

After receiving a remediation, TA1 performs WHS simulation to assess clinical impact.

**API: GET /api/v1/remediations/{id}/impact (TA4 → TA1)**

**Description:** TA4 queries impact assessment results

**Request:**

```http
GET /api/v1/remediations/patch-2024-1234-001/impact
```

**Response:**

```json
{
  "remediationId": "patch-2024-1234-001",
  "impactAnalysis": {
    "riskReduction": {
      "before": 82,
      "after": 44,
      "reductionPercentage": 46
    },
    "downtime": {
      "totalMinutes": 30,
      "affectedSystems": 15,
      "criticalSystemsAffected": ["ER Workstation WS-021"]
    },
    "clinicalWorkflows": [
      {
        "workflow": "Patient Intake → EMR → Lab Orders",
        "impactLevel": "medium",
        "workarounds": "Manual paper charting available",
        "estimatedPatientDelay": "5-10 minutes"
      }
    ],
    "recommendation": {
      "deploymentWindow": "2024-11-20T02:00:00Z",
      "stagingApproach": "Deploy to non-ER systems first, then ER during overnight",
      "approvalRequired": true,
      "approvalRoles": ["Clinical Lead", "IT Director"]
    }
  },
  "simulationCompleted": "2024-11-17T19:30:00Z",
  "_links": {
    "self": {
      "href": "/api/v1/remediations/patch-2024-1234-001/impact",
      "title": "This impact analysis"
    },
    "remediation": {
      "href": "/api/v1/remediations/patch-2024-1234-001",
      "title": "View full remediation details"
    },
    "updateStatus": {
      "href": "/api/v1/remediations/patch-2024-1234-001",
      "method": "PUT",
      "title": "Update deployment status (approve, schedule, or deploy)"
    },
    "rerunSimulation": {
      "href": "/api/v1/remediations/patch-2024-1234-001/simulate",
      "method": "POST",
      "title": "Re-run WHS simulation with updated parameters"
    },
    "affectedAssets": {
      "href": "/api/v1/inventory?uuid=cfe7db8c-b313-4efe-aee5-40e55ba3d1bf",
      "title": "View details of affected assets"
    },
    "vulnerabilities": {
      "href": "/api/v1/vulnerabilities?remediationId=patch-2024-1234-001",
      "title": "View vulnerabilities addressed by this remediation"
    }
  }
}
```

### 5.6 Remediation Deployment Status

**API: PUT /api/v1/remediations/{id} (TA1 ↔ TA4)**

**Description:** Update remediation deployment status or metadata

**Request (TA1 updates after deployment):**

```http
PUT /api/v1/remediations/patch-2024-1234-001
Content-Type: application/json

{
  "status": "scheduled | deploying | completed | failed | rolled_back",
  "deployedAssets": [
    {
      "uuid": "cfe7db8c-b313-4efe-aee5-40e55ba3d1bf",
      "status": "completed",
      "deploymentTime": "2024-11-20T02:15:00Z",
      "actualDowntimeMinutes": 11
    }
  ],
  "approvals": [
    {
      "role": "Clinical Lead",
      "approver": "jane.smith@hospital.com",
      "timestamp": "2024-11-19T16:00:00Z"
    }
  ]
}
```

### 5.7 Open Issues: Patch Format Variability

**Challenge:** TA4 performers may use vastly different approaches to remediation:

- Traditional vendor patches (MSI, DEB, RPM)
- Configuration changes
- Virtual patches / network-level mitigations
- Custom-generated patches
- Firmware updates

**Phase I Approach:**

- Accept flexible `remediationType` field
- Require comprehensive metadata regardless of type
- WHS simulation validates across all types
- Iterate based on actual TA4 submissions

**Future Refinement:** Define sub-schemas for specific remediation types based on Phase I learnings

### 5.8 Data Flow: TA1 ↔ TA4

```
1. TA1 sends remediation request with vulnerability context → TA4
2. TA4 generates remediation
3. TA4 submits remediation with metadata → TA1
4. TA1 performs WHS clinical impact simulation
5. TA1 provides impact analysis → TA4 (and clinical stakeholders)
6. Clinical/IT approval obtained
7. TA1 orchestrates deployment
8. TA1 updates status → TA4
9. Verification and tracking
```

---

## 6. Cross-Cutting Concerns

### 6.1 Authentication & Authorization

#### 6.1.1 Authentication Mechanism

**Phase I: API Key Authentication**

All API requests MUST include an API key in the `Authorization` header:

```http
GET /api/v1/inventory HTTP/1.1
Host: patch.vmp.local
Authorization: Bearer patch_api_key_a1b2c3d4e5f6...
X-API-Version: v1
```

**API Key Requirements:**

- **Format:** Bearer token, 256-bit entropy (64 hex characters)
- **Provisioning:** Issued by PATCH team to each TA performer during onboarding
- **Rotation:** Every 90 days or upon suspected compromise
- **Storage:** TA performers MUST store keys securely (e.g., environment variables, secrets manager)
- **Transmission:** HTTPS/TLS only - never in URL parameters or logs

**Example API Key:** `patch_api_key_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9`

#### 6.1.2 Transport Security

**TLS Requirements:**

- **Minimum Version:** TLS 1.3 (TLS 1.2 acceptable with strong cipher suites)
- **Certificate Validation:** TA performers MUST validate VMP TLS certificates
- **Cipher Suites:** ECDHE-RSA-AES256-GCM-SHA384 or stronger
- **HSTS:** Enabled with `max-age=31536000; includeSubDomains`

**Rationale:** Healthcare data security requires strong encryption (HIPAA compliance).

#### 6.1.3 Authorization Model (RBAC)

Role-based permissions for API operations:

| Resource                               | TA2 (Device Emulation) | TA3 (Vulnerability Discovery) | TA4 (Remediation) | VMP (Internal) |
| -------------------------------------- | ---------------------- | ----------------------------- | ----------------- | -------------- |
| `GET /api/v1/inventory`                | Read                   | Read                          | Read              | Read/Write     |
| `GET /api/v1/inventory/{uuid}`         | Read                   | Read                          | Read              | Read/Write     |
| `POST /api/v1/vulnerabilities/submit`  | -                      | Write                         | -                 | Read           |
| `GET /api/v1/vulnerabilities`          | Read                   | Read                          | Read              | Read/Write     |
| `POST /api/v1/pov/submit`              | -                      | Write                         | -                 | Read           |
| `GET /api/v1/remediations`             | -                      | Read                          | Read              | Read/Write     |
| `POST /api/v1/remediations`            | -                      | -                             | Write             | Read           |
| `GET /api/v1/remediations/{id}`        | -                      | Read                          | Read              | Read/Write     |
| `PUT /api/v1/remediations/{id}`        | -                      | -                             | Write             | Read/Write     |
| `GET /api/v1/remediations/{id}/impact` | -                      | Read                          | Read              | Read/Write     |
| `POST /api/v1/whs/emulators`           | Write                  | -                             | -                 | Read           |
| `GET /api/v1/whs/emulators`            | Read                   | -                             | -                 | Read           |

**Permissions Enforcement:**

- 403 Forbidden returned if API key lacks required permission
- All authorization decisions logged for audit

#### 6.1.4 API Key Provisioning Workflow

1. TA performer contacts PATCH team with integration request
2. PATCH team generates API key with appropriate role (TA2/TA3/TA4)
3. API key delivered via secure channel (encrypted email, 1Password, etc.)
4. TA performer confirms receipt and tests with `GET /api/v1/health` endpoint
5. API key activated for production use

#### 6.1.5 Security Best Practices

**For TA Performers:**

- Store API keys in environment variables or secrets management system (AWS Secrets Manager, HashiCorp Vault, etc.)
- Never commit API keys to version control
- Implement key rotation automation
- Monitor for unauthorized API usage (unexpected IP addresses, rate limit violations)
- Report suspected key compromise to PATCH team immediately

**For PATCH VMP:**

- Hash API keys in database (bcrypt, scrypt, or Argon2)
- Log all authentication attempts (success and failure)
- Implement rate limiting per API key (Section 6.3)
- Provide API key audit logs to TA performers on request

#### 6.1.6 Future Enhancements

**Phase II (Months 13+):**

- OAuth 2.0 / OpenID Connect for production deployments
- Mutual TLS (mTLS) for TA4 remediation submissions (elevated security)
- API key scopes for fine-grained permissions
- Automated key rotation with zero-downtime transition

### 6.2 API Versioning

All APIs use URI versioning:

- Current: `/api/v1/...`
- Future versions: `/api/v2/...` with backward compatibility for one version

**API Evolution Policy:**

VMP maintains API stability throughout the program while allowing for necessary evolution:

- **Non-breaking changes** (always permitted without version change):

  - Adding new optional request/response fields
  - Adding new API endpoints
  - Adding new query parameters
  - Extending enumerations with new values
  - Changing API rate limiting or security measures not related to authentication

- **Breaking changes** (require new API version):

  - Removing fields or endpoints
  - Changing field types or formats
  - Changing required/optional status of fields
  - Modifying authentication mechanisms
  - Changing response structure

- **Deprecation process**:

  1. New version released with deprecation notice on old version
  2. 6-month transition period where both versions are supported
  3. Old version retired with 30-day final notice
  4. TA performers receive direct notification of all version changes

- **Version negotiation**: Clients may include `X-API-Version: v1` header; if omitted, latest stable version is used

**Note:** See Section 2.7 for data schema versioning policy, which follows similar principles.

### 6.3 HATEOAS (Hypermedia as the Engine of Application State)

VMP APIs use HATEOAS links to guide API clients through available actions and related resources.

**Benefits:**

- **Discoverability**: Clients don't need to hardcode URL patterns
- **Evolvability**: VMP can change internal URL structure without breaking clients
- **State-driven workflows**: Available actions reflect current resource state

**Link Format:**

```json
"_links": {
  "relationName": {
    "href": "/api/v1/resource/id",
    "method": "GET | POST | PUT | DELETE",
    "title": "Human-readable description"
  }
}
```

**Standard Relations:**

- `self`: The current resource
- `related`: Related resources (e.g., asset → vulnerabilities)
- `action`: Available actions (e.g., approve, deploy, rerun)

**HATEOAS-Enabled APIs:**

- Asset Inventory (Section 2.4): Links to vulnerabilities, remediations, emulators
- Vulnerability Submission (Section 4.4): Links to POV submission, asset inventory
- Remediation Impact Analysis (Section 5.5): Links to deployment, re-simulation, affected assets

**Client Implementation:**

- Clients MAY follow links for navigation
- Clients MUST NOT hardcode URLs beyond the base API endpoint
- Link availability depends on resource state and permissions

### 6.4 Rate Limiting

- Informed by TA performer requirements, we will implement rate limiting to external VMP API endpoints

### 6.4 Error Handling

Standard HTTP status codes with detailed error messages:

```json
{
  "error": "Invalid form entry",
  "issues": {
    "formErrors": {
        "assets[0].cpe": ["Invalid input: expected CPE 2.3 format, received string"]
    }
    "fieldErrors": []
  }
}
```

### 6.5 Data Retention

- Asset inventory: Retained for program duration
- Vulnerabilities: Retained for program duration + 2 years
- Remediation records: Retained for program duration + 2 years
- API logs: 90 days

---

## 7. OpenAPI Specifications

Full OpenAPI 3.0 specifications for all interfaces will be published at:

- **Asset Inventory API:** `https://patch.vmp.local/openapi/inventory.yaml`
- **Vulnerability API:** `https://patch.vmp.local/openapi/vulnerabilities.yaml`
- **Remediation API:** `https://patch.vmp.local/openapi/remediation.yaml`
- **WHS Integration API:** `https://patch.vmp.local/openapi/whs.yaml`

These specifications enable auto-generation of client libraries for TA performers.

---

## 8. Testing & Validation

### 8.1 Integration Testing Environment

PATCH will provide a test VMP environment for TA performer integration testing:

- **Endpoint:** `https://test.patch.vmp.local`
- **Test data:** Synthetic hospital with 50 test assets
- **Availability:** 24/7 starting (specific date TBD)

### 8.2 Validation Requirements

All TA performers MUST demonstrate:

1. Successful API authentication
2. Correct data format submission
3. Error handling for edge cases
4. Performance within acceptable thresholds (TBD)

### 8.3 Hackathon Integration Events

Per program requirements, integration validation will occur at quarterly hackathon events where all performers demonstrate interoperability.

---

## 9. Open Issues & Decisions Needed

### 9.1 Asset-to-Emulator Matching (TA2)

- **Issue:** No standardized mechanism for matching real assets to TA2 emulators
- **Options:** CPE-based, naming convention, metadata registry, manual config
- **Decision Needed:** By Month 2
- **Owner:** TA1 + TA2 joint working group

### 9.2 Patch Metadata Completeness (TA4)

- **Issue:** Unknown what metadata TA4 can realistically provide for impact assessment
- **Options:** Require comprehensive metadata vs. best-effort with LLM augmentation
- **Decision Needed:** After first TA4 integration meeting
- **Owner:** TA1 + TA4 joint working group

### 9.3 Bidirectional Data Flow Patterns

- **Issue:** Push vs. pull patterns for each integration point
- **Current:** Both supported, TA performers choose
- **Refinement Needed:** Performance and operational experience will guide standardization
- **Owner:** TA1 architecture team

### 9.4 WHS Direct Access

- **Issue:** Do TA performers need direct WHS access or only through VMP?
- **Current Stance:** VMP-mediated only for Phase I
- **Future:** May expose WHS APIs if use cases emerge
- **Decision Point:** After integration experience

### 9.5 Network Traffic and PCAP Capture Exposure

- **Issue:** Should VMP expose network traffic captures (PCAP) for device matching, seed generation, and remediation validation?
- **Raised By:** TA2 and TA4 performers
- **Use Cases:**
  - Device Matching (TA2): PCAP analysis to identify device protocols and behaviors for emulator validation
  - Seed Generation (TA3): Traffic patterns for fuzzing and vulnerability discovery
  - Remediation Validation (TA4): Pre/post-patch traffic comparison to verify remediation effectiveness
- **Options:**
  1. Full PCAP exposure: Provide raw packet captures via API endpoint
  2. Filtered PCAP: Provide filtered captures based on asset UUID/IP filtering (reduces data volume)
  3. Metadata-only: Provide traffic statistics and protocol fingerprints without raw packets
  4. On-demand capture: TA performers request targeted captures for specific assets during testing windows
- **Considerations:**
  - Privacy: PCAP may contain PHI (patient health information) - requires de-identification or access restrictions
  - Data Volume: Continuous PCAP storage/transmission is expensive (TB-scale per day)
  - Utility: Value of raw PCAP vs. alternative approaches (e.g., protocol documentation)
- **Decision Needed:** After security/privacy review
- **Owner:** TA1 architecture team + security review board

### 9.6 Alternative Remediation Formats (Firewall Rules, eBPF)

- **Issue:** TA4 performers propose non-traditional remediation formats beyond software patches
- **Raised By:** Galois, Aarno Labs
- **Proposed Formats:**
  - Firewall rules: Network-level mitigations (e.g., block vulnerable port, rate limiting)
  - eBPF programs: Kernel-level runtime mitigations without device modification
  - IDS/IPS signatures: Detection rules for vulnerability exploitation attempts
- **Challenges:**
  - Impact Assessment: How does VMP assess clinical impact of firewall rule vs. traditional patch? TA4 feedback: "very little idea on how to return assessment of impact"
  - Deployment Mechanism: Who deploys firewall rules? Hospital network team? VMP automation?
  - Validation: How to verify remediation effectiveness without traditional patch validation?
  - Standardization: Need common schema for non-patch remediations
- **Current Approach:**
  - Section 5.2.2 and 5.3 include firewall_rule and ebpf_rule in remediationType enumeration
  - Phase I: Accept alternative formats with best-effort impact assessment
- **Refinement Needed:**
  - Define sub-schemas for firewall rules (iptables, pf, Windows Firewall formats)
  - Define eBPF program packaging standards (bytecode, source, documentation)
  - Establish validation criteria for network-level mitigations
- **Decision Needed:** After TA4 prototype submission
- **Owner:** TA1 + TA4 joint working group

### 9.7 TA4 Firmware Update and Patched Image Hosting

- **Issue:** TA4 performers may need to push updated firmware or patched device images
- **Raised By:** Aarno Labs use case for firmware patches
- **Options:**
  1. WHS Registry write access: Grant TA4 push permissions to Docker Registry (Section 3.6)
  2. Separate TA4 registry: Dedicated registry for remediation artifacts (separation of concerns)
  3. External hosting: TA4 hosts artifacts externally, submits URL in patchArtifact.url (current approach)
- **Considerations:**
  - Security: TA4 artifacts must undergo same security scanning as TA2 emulators
  - Versioning: How to track multiple patch iterations? (e.g., patch-v1.0, patch-v1.1, rollback)
  - Asset Linking: When TA4 patches a device emulator, how does VMP link to original TA2 emulator CPE?
- **Current Approach:**
  - Section 5.3 and 5.4 use patchArtifact.url with external hosting (no VMP registry dependency)
- **Recommendation:**
  - Phase I: External hosting (TA4 responsibility)
  - Phase II: If TA4 firmware patching becomes common, provision WHS Registry write access with approval workflow
- **Decision Needed:** After TA4 integration patterns emerge
- **Owner:** TA1 + TA4 joint working group

---

## 10. References

### Standards & Specifications

- [CPE 2.3 Specification](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7695.pdf)
- [SARIF 2.1.0 Specification](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [CVSS 3.1 Specification](https://www.first.org/cvss/v3.1/specification-document)

### Program Documents

- ARPA-H UPGRADE Program BAA
- PATCH Program Plan Phase I (October 2025)
- PATCH Technical Proposal

---

## Appendix A: Example Integration Scenarios

### A.1 End-to-End Vulnerability Discovery and Remediation

**Scenario:** TA3 discovers critical vulnerability, TA4 provides patch, TA1 orchestrates deployment

```
Day 1:
1. TA3 scans assets via GET /api/v1/inventory
2. TA3 discovers CVE-2024-1234 on 15 Windows workstations
3. TA3 validates with POV in WHS environment
4. TA3 submits vulnerability via POST /api/v1/vulnerabilities/submit (SARIF)
5. VMP ingests, links to affected assets by UUID

Day 2:
6. TA1 requests remediation (optional workflow)
7. TA4 generates patch, tests in WHS
8. TA4 submits via POST /api/v1/remediations with metadata

Day 3:
9. VMP runs clinical impact simulation in WHS
10. Impact analysis shows 30min downtime, affects ER workflow
11. VMP generates decision support for clinical lead
12. Clinical lead approves deployment with constraints

Day 4:
13. VMP orchestrates staged rollout during maintenance window
14. Deployment metrics: 11min actual downtime vs 12min estimated
15. Verification scan confirms vulnerability remediated
16. Status updated via PUT /api/v1/remediations/{id}

Metric Achievement:
- Deployment in 4 days (vs 471-day baseline)
- Non-disruptive to critical operations
- Clinical stakeholder confidence via explainability
```

### A.2 Device Emulator Integration for Testing

**Scenario:** TA2 provides MRI emulator for vulnerability testing

```
1. TA2 publishes emulator registry via POST /api/v1/whs/emulators
2. TA2 pushes Docker image to WHS Registry (or hosts externally)
3. VMP queries inventory, identifies real Siemens MRI (uuid: 81ff33eb...)
4. VMP matches CPE: cpe:2.3:h:siemens:magnetom_mri:5.8.0
5. VMP internally orchestrates emulator deployment in WHS environment
6. WHS integrates emulator into clinical workflow graph
7. TA3 uses emulator for safe POV validation
8. TA4 uses emulator for patch compatibility testing
9. Results inform real-device deployment decisions
```

**Note:** Deployment orchestration (step 5) is internal to VMP/WHS and not exposed as an external API.

---

## Appendix B: Clinical Workflow Examples

### B.1 Patient Immunotherapy Workflow

Critical workflow requiring high reliability:

```
Lab → EMR → Nurse Station → Infusion Pump
```

**Assets Involved:**

- Lab analyzer (uuid: abc-123, CPE: cpe:2.3:a:roche:cobas_analyzer:...)
- EMR workstation (uuid: def-456, CPE: cpe:2.3:o:microsoft:windows_11:...)
- Nurse tablet (uuid: ghi-789, CPE: cpe:2.3:h:apple:ipad:...)
- Infusion pump (uuid: jkl-012, CPE: cpe:2.3:h:bd:infusion_pump:...)

**Clinical Impact Factors:**

- Life-safety critical: Patient receiving chemotherapy
- Regulatory: Must maintain audit trail (21 CFR Part 11)
- Uptime requirement: 99.9%
- Workaround: Manual dosing (high risk, requires physician approval)

**Vulnerability Impact:**
If any node compromised → Entire workflow offline → Patient treatment delayed/manual override

**Remediation Constraints:**

- Max 15min downtime per device
- Must maintain treatment schedule
- Requires clinical lead approval

This workflow demonstrates why PATCH focuses on **clinical impact** rather than technical vulnerability scores alone.

---

## Document Revision History

| Version | Date       | Author   | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | 2024-11-17 | E. Hofer | Initial draft for team review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.2     | 2024-11-18 | E. Hofer | Incorporated team feedback: Added TA3 scope clarification (known vs unknown vulnerabilities), lastSeen timestamps, workflowId cross-references, VM/Docker format support for TA2, supporting documentation requirements (MDS2, SBOM, IFU), validation scope clarification, clinical impact indicators, webhook patterns for TA4, enhanced API versioning policy                                                                                                                                                                                                                                                                                                                                                                                                  |
| 0.3     | 2024-11-20 | E. Hofer | Incorporated team and other performer feedback: Added PUT /api/v1/inventory/{uuid} for asset updates (Section 2.5.1), restructured remediation API with GET/POST/PUT endpoints (Sections 5.2.1-5.2.2, 5.4, 5.6), standardized endpoint naming to plural convention (/remediations), added firewall_rule and ebpf_rule to remediationType enumeration (Section 5.3), added open issues for PCAP exposure (Section 9.5), alternative remediation formats (Section 9.6), and TA4 firmware workflow (Section 9.7), expanded asset-to-emulator matching with CPE+UUID hybrid approach (Section 3.2), added external hosting flexibility note (Section 3.6), removed POST /api/v1/whs/deploy endpoint (deployment is internal VMP/WHS orchestration, not external API) |

---
