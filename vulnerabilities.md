# Vulnerability Tracker: Prisma Schema

PostgreSQL. Each model has a `///` doc comment explaining what it is for (these also show up in the generated Prisma Client). Commented-out `TODO` fields and models are planned but not in use yet. Save the block below as `prisma/schema.prisma`.

## How the models fit together

```
Vulnerability (canonical, one per real-world vuln)
 ├── VulnerabilityIdentifier   every ID it is known by (CVE, GHSA, TA3…), for lookup
 ├── Metric                    CVSS / EPSS / SSVC scores, one row per score
 └── VulnerabilityRecord       one source's statement (NVD, GHSA, OSV, vendor, TA3 team)
       │                       aliases[] = IDs this record claims (drives merging)
       ├── Affected ──► Product   vers range in a component (purl) or device
       └── Finding ──► User       TA3 team upload + SARIF
```

## Schema

```prisma
// Vulnerability tracker schema (PostgreSQL)
// Influenced by OSV (records, aliases, affected ranges) and CSAF (scores, remediations).

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────── Enums ───────────────────────────────

/// Where a VulnerabilityRecord or Metric came from.
/// Add one value per feed or commercial integration (e.g. SNYK, CLAROTY).
/// Trust/precedence between sources is handled in application code.
enum Source {
  NVD
  GHSA
  OSV
  FIRST_EPSS // exploit-probability scores only, no advisory text
  CISA_KEV // known-exploited flag only
  VENDOR_CSAF // manufacturer advisories; prefix sourceRecordId with the vendor to avoid ID clashes
  TA3 // uploads from the TA3 team (see Finding)
}

/// Kind of score in a Metric row.
enum MetricType {
  CVSS_V2
  CVSS_V3_0
  CVSS_V3_1
  CVSS_V4_0
  EPSS
  SSVC
  QUALITATIVE // plain "HIGH" from a tool or team, with no vector
}

enum Severity {
  NONE
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

/// Whether a Product is a software package or a whole device.
enum ProductKind {
  COMPONENT // software package, identified by purl
  DEVICE // medical/IoT device, identified by vendor + model number
}

/// Triage state of a team-submitted Finding.
enum FindingStatus {
  NEW
  TRIAGING
  CONFIRMED
  NOT_A_VULNERABILITY
  RESOLVED
}

// ─────────────────────── Canonical vulnerability ──────────────────────

/// The canonical, real-world vulnerability: one row no matter how many sources
/// describe it. Everything else in the app (UI, VEX, tickets, assets) links here.
/// Source-specific data lives on VulnerabilityRecord; every ID it is known by
/// lives on VulnerabilityIdentifier.
model Vulnerability {
  id        String @id @default(cuid())
  /// Best human-facing ID: CVE > GHSA > other public ID > TA3.
  /// Recomputed when aliases change, so it is not unique and not a key.
  displayId String

  /// Set when this vulnerability turned out to be a duplicate and was folded into
  /// another. Its records and identifiers are moved to the survivor; old links and
  /// bookmarks follow this pointer.
  mergedIntoId String?
  mergedInto   Vulnerability?  @relation("Merge", fields: [mergedIntoId], references: [id])
  mergedFrom   Vulnerability[] @relation("Merge")

  title       String?
  description String?

  // Denormalized "effective" values, chosen in code from all Metrics by a
  // precedence policy (e.g. TA3 > VENDOR_CSAF > NVD > GHSA; CVSS v4 > v3.1).
  // Stored here so list views can sort/filter without joining every metric.
  effectiveSeverity Severity?
  effectiveMetricId String?   @unique
  effectiveMetric   Metric?   @relation("EffectiveMetric", fields: [effectiveMetricId], references: [id], onDelete: SetNull)
  latestEpss        Decimal?  @db.Decimal(6, 5)
  knownExploited    Boolean   @default(false) // CISA KEV or internal intel

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  identifiers VulnerabilityIdentifier[]
  records     VulnerabilityRecord[]
  metrics     Metric[]                  @relation("VulnerabilityMetrics")

  @@index([displayId])
  @@index([effectiveSeverity])
}

/// Every ID a vulnerability is known by (CVE-2024-3094, GHSA-xxxx, PYSEC-..., TA3-...),
/// one row per ID. This is the search index for "find a vuln by any identifier", and
/// the unique constraint guarantees an ID belongs to exactly one Vulnerability, which
/// is what makes alias-based merging deterministic.
model VulnerabilityIdentifier {
  id         String @id @default(cuid())
  namespace    String // "CVE", "GHSA", "PYSEC", "RUSTSEC", "TA3", ...
  value        String // trimmed + upper-cased, for lookup: "GHSA-JFH8-C2JP-5V3Q"
  displayValue String // as published, for display: "GHSA-jfh8-c2jp-5v3q"

  vulnerabilityId String
  vulnerability   Vulnerability @relation(fields: [vulnerabilityId], references: [id])

  createdAt DateTime @default(now())

  @@unique([namespace, value])
  @@index([value]) // search when the user doesn't say which namespace
  @@index([vulnerabilityId])
}

// ───────────────────────────── Source data ─────────────────────────────

/// One source's statement about a vulnerability: an NVD CVE entry, a GHSA advisory,
/// an OSV record, a vendor CSAF advisory, a commercial tool result, or a team's
/// Finding from the TA3 team. Several records point at one Vulnerability. The original payload is
/// kept in `raw` so it can be re-parsed later without re-fetching.
model VulnerabilityRecord {
  id String @id @default(cuid())

  source         Source
  /// ID of the record inside its source (CVE-2024-3094 for NVD, GHSA-... for GHSA).
  /// Null for TA3 findings that have no identifier yet.
  sourceRecordId String?
  /// Other IDs this record says refer to the same vulnerability (OSV `aliases`).
  /// Drives merging, and records who claimed each alias so a bad merge can be undone.
  aliases        String[]

  vulnerabilityId String
  vulnerability   Vulnerability @relation(fields: [vulnerabilityId], references: [id])

  summary     String?
  details     String?
  publishedAt DateTime?

  // TODO: modifiedAt DateTime? — the source's own modified timestamp (OSV `modified`).
  // TODO: withdrawnAt DateTime? — when the source withdrew / rejected the record.

  // TODO: relatedIds String[] — OSV `related`: IDs of similar-but-different
  // vulnerabilities (never merged). Add when we start using it.

  schemaVersion String? // "osv-1.6.x", "csaf-2.0", "nvd-cve-api-2.0", "sarif-2.1.0"
  raw           Json? // original payload, untouched (CWEs from feeds live here for now)
  rawHash       String? // skip re-processing when an unchanged payload is fetched again

  ingestedAt DateTime @default(now())
  updatedAt  DateTime @updatedAt

  metrics  Metric[]
  affected Affected[]
  finding  Finding?
  // TODO: references Reference[] — see the Reference model below.

  // Postgres treats NULLs as distinct, so many unidentified TA3 findings are allowed.
  @@unique([source, sourceRecordId])
  @@index([vulnerabilityId])
  @@index([aliases], type: Gin) // "which records claim alias X?"
}

/// One score about a vulnerability: a CVSS vector/score, an EPSS probability, an SSVC
/// decision or a plain severity. A record can carry several (NVD often has CVSS v3.1
/// from NIST *and* from the CNA, plus v4.0). `recordId` is optional so score-only
/// feeds like EPSS don't need a placeholder record.
model Metric {
  id String @id @default(cuid())

  vulnerabilityId String
  vulnerability   Vulnerability        @relation("VulnerabilityMetrics", fields: [vulnerabilityId], references: [id])
  source          Source
  recordId        String?
  record          VulnerabilityRecord? @relation(fields: [recordId], references: [id], onDelete: Cascade)

  type       MetricType
  vector     String? // "CVSS:3.1/AV:N/AC:L/..." or an SSVC vector
  score      Decimal?  @db.Decimal(7, 5) // CVSS base 0–10, EPSS probability 0–1
  percentile Decimal?  @db.Decimal(6, 5) // EPSS percentile
  severity   Severity?
  /// Who inside the source made the assessment: "nvd@nist.gov", a CNA, a user id.
  assertedBy String?
  assessedAt DateTime?
  extra      Json? // environmental/threat metrics, SSVC decision points, etc.

  createdAt DateTime @default(now())

  effectiveFor Vulnerability? @relation("EffectiveMetric")

  // One score per (record, type, assessor): stops duplicates on re-ingest.
  @@unique([recordId, type, assertedBy])
  @@index([vulnerabilityId, type])
  @@index([type, score])
}

// ─────────────────────── Products & affected ranges ───────────────────────

/// A version-less thing that can contain a vulnerability: a software component
/// (identified by purl) or a medical device (vendor + model number). Versions live
/// on Affected ranges, not here, so a product row is shared by every advisory.
model Product {
  id     String      @id @default(cuid())
  kind   ProductKind
  name   String
  vendor String?

  // COMPONENT: canonical purl WITHOUT version, e.g. "pkg:npm/%40babel/core"
  purl          String? @unique
  purlType      String?
  purlNamespace String?
  purlName      String?

  // DEVICE
  modelNumber          String?
  cpe                  String? // version-less CPE prefix, if the manufacturer publishes one

  affected Affected[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([kind, vendor, modelNumber])
  @@index([purlType, purlName])
}

/// "This record says the vulnerability is present in these versions of this product."
/// Equivalent to one entry of OSV `affected[]`. Used to match your inventory/SBOMs:
/// take a component purl@version or a device model@firmware, find Affected rows for
/// that Product, and check the version against `vers`. Presence only; whether it is
/// exploitable in a given device is a VEX decision and doesn't belong here.
model Affected {
  id String @id @default(cuid())

  recordId  String
  record    VulnerabilityRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
  productId String
  product   Product             @relation(fields: [productId], references: [id])

  /// VERS range, e.g. "vers:npm/>=1.0.0|<1.2.3" or "vers:generic/>=4.2|<4.2.7"
  vers           String?
  versions       String[] // explicitly listed versions (OSV `versions`)
  fixedVersions  String[] // first fixed version(s); "<1.2.3" alone doesn't prove 1.2.3 exists
  purlQualifiers Json? // e.g. {"distro":"debian-12","arch":"amd64"} when they matter

  remediations Json? // CSAF remediations: vendor_fix, workaround, mitigation, none_available
  rawRanges    Json? // original OSV ranges, incl. GIT commit ranges that vers can't express

  @@index([productId])
  @@index([recordId])
}

// TODO: add Reference when we need it.
// Links a record cites: the advisory page, the fix commit, a bug report, a public
// exploit, a vendor bulletin. Uses OSV reference types so the UI can show
// "Fix" / "Advisory" / "Exploit" links, and so you can spot "exploit is public".
// model Reference {
//   id       String              @id @default(cuid())
//   recordId String
//   record   VulnerabilityRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
//   type     String // ADVISORY, ARTICLE, DETECTION, DISCUSSION, REPORT, FIX, INTRODUCED, PACKAGE, EVIDENCE, WEB
//   url      String
//
//   @@index([recordId])
// }

// ─────────────────────────── Team findings ───────────────────────────

/// Extra data for a record uploaded by a member of the TA3 team (record.source = TA3),
/// possibly a zero-day with no public ID yet. Severity and CVSS go in Metric like any
/// other record (source TA3, assertedBy = the user); CWEs stay in the SARIF.
/// Several findings (different users, tools, SARIF) can point at the same
/// Vulnerability through their records.
model Finding {
  id       String              @id @default(cuid())
  recordId String              @unique
  record   VulnerabilityRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)

  submittedById String
  submittedBy   User   @relation(fields: [submittedById], references: [id])

  status FindingStatus @default(NEW)

  /// SARIF log with the analysis data (results, locations, rules incl. CWE tags).
  sarif Json?

  // TODO: tool String? — from SARIF runs[].tool.driver.name/version, for filtering by tool.
  // TODO: sarifUri String? — object-storage location when a SARIF log is too large for a row.
  // TODO: fingerprints String[] — SARIF partialFingerprints, to suggest duplicate findings.

  submittedAt DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([status])
  @@index([submittedById])
}

/// A member of the TA3 team who can submit findings.
model User {
  id       String    @id @default(cuid())
  email    String    @unique
  name     String?
  findings Finding[]
}
```
