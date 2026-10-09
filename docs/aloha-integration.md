# ALOHA Integration Guide

This document describes the end-to-end workflow for integrating **ALOHA** (the IV&V testing system) with the **VIPER** Vulnerability Management Platform. ALOHA receives event notifications from VIPER via webhooks, queries for new or updated TA3 submissions and remediations, runs IV&V testing, and reports results back through the VIPER ALOHA API endpoints.

A **TA3 submission** is one upload from a TA3 performer: a SARIF log, with an optional exploit, narrative, and clinical impact. Each submission belongs to one vulnerability, and a vulnerability can have several (two performers can report the same CVE), so ALOHA tests and reports on each submission separately.

## Authentication

All VIPER API calls require an API key passed as a Bearer token:

```http
Authorization: Bearer <API_KEY>
```

API keys can be created on the VIPER user settings page (`/user/settings`). Every request to `/api/v1/*` must include this header.

## Step 1: Configure Webhooks in VIPER

The IV&V team configures a webhook in the VIPER frontend to receive notifications when vulnerabilities or remediations are created or updated.

1. Navigate to **Settings > Webhooks** (`/settings/webhooks`).
2. Click **Add Webhook** and fill in:
   - **Name**: A descriptive label (e.g. "ALOHA IV&V Notifications").
   - **Webhook URL**: The ALOHA callback endpoint that will receive event notifications.
   - **Authentication**: Choose an auth type (`None`, `Basic`, `Bearer`, or `Header`) depending on how ALOHA authenticates inbound requests.
   - **Triggers**: Select one or more of the following:
     - `Vulnerability_Created` -- fires when a new vulnerability is created.
     - `Vulnerability_Updated` -- fires when an existing vulnerability is modified.
     - `Remediation_Created` -- fires when a new remediation is created.
     - `Remediation_Updated` -- fires when an existing remediation is modified.
3. Save the webhook.

VIPER will now POST to the configured URL whenever a matching database event occurs. Adding or changing a TA3 submission updates its vulnerability, so it fires `Vulnerability_Created` or `Vulnerability_Updated`. ALOHA's own status updates (Step 5) don't fire a webhook.

## Step 2: Receive the Webhook

When a trigger fires, VIPER sends an HTTP `POST` to the configured callback URL. The payload contains the trigger type and a timestamp -- no entity IDs or record data are included.

**Webhook payload:**

```json
{
  "webhookTrigger": "Vulnerability_Created",
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `webhookTrigger` | `string` | The event that fired. One of: `Vulnerability_Created`, `Vulnerability_Updated`, `Remediation_Created`, `Remediation_Updated`. |
| `timestamp` | `string` (ISO 8601) | The time the database mutation occurred. Use this value for subsequent queries. |

The request includes a `Content-Type: application/json` header and any authentication headers configured on the webhook.

## Step 3: Query for New or Updated Items

Use the `lastUpdatedStartTime` query parameter set to the webhook `timestamp` to retrieve only items created or modified since that point.

### TA3 submissions

```http
GET /api/v1/ta3Submissions?lastUpdatedStartTime=2026-03-03T12:00:00.000Z&lastUpdatedEndTime=2026-03-03T22:00:00.000Z
Authorization: Bearer <API_KEY>
```

Each item carries its `id`, the `sarif` log, `exploitUri`, `narrative`, `impact`, and the `vulnerabilityId` it belongs to. Use `GET /api/v1/vulnerabilities/{vulnerabilityId}` for the vulnerability itself, such as its affected device groups.

### Remediations

```http
GET /api/v1/remediations?lastUpdatedStartTime=2026-03-03T12:00:00.000Z&lastUpdatedEndTime=2026-03-03T22:00:00.000Z
Authorization: Bearer <API_KEY>
```

## Step 4: Parse Returned Items for Testing

ALOHA parses the returned TA3 submission and remediation objects to determine what IV&V testing is needed.

## Step 5: Update ALOHA Status

After running IV&V tests, ALOHA reports results back to VIPER using the ALOHA update endpoints. Each TA3 submission or remediation can be marked with an `AlohaStatus` and an optional freeform `log` object for audit details.

### AlohaStatus values

| Value | Meaning |
|-------|---------|
| `Confirmed` | IV&V testing confirmed the TA3 submission or remediation. |
| `Unsure` | IV&V testing was inconclusive or requires further review. |

### Update TA3 submission ALOHA status

```http
PUT /api/v1/ta3Submissions/{id}/aloha
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

**Request body:**

```json
{
  "data": {
    "status": "Confirmed",
    "log": {
      "testedBy": "ALOHA-automated",
      "testDate": "2026-03-03T14:30:00.000Z",
      "note": "Exploit verified in emulator environment"
    }
  }
}
```

`log` has no restrictions and can take any JSON shape. The above is only an example.

### Update remediation ALOHA status

```http
PUT /api/v1/remediations/{id}/aloha
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

Same request body as above.

### Response

Both PUT endpoints return the full entity alongside the updated ALOHA data:

```json
{
  "ta3Submission": { "id": "...", "vulnerabilityId": "...", "sarif": { ... }, ... },
  "aloha": {
    "status": "Confirmed",
    "log": { "testedBy": "ALOHA-automated", ... }
  }
}
```

For remediations, `ta3Submission` is replaced with `remediation`.

## Step 6: Check ALOHA Status

ALOHA can verify the status of any TA3 submission or remediation at any time using the GET endpoints.

### Get TA3 submission ALOHA status

```http
GET /api/v1/ta3Submissions/{id}/aloha
Authorization: Bearer <API_KEY>
```

### Get remediation ALOHA status

```http
GET /api/v1/remediations/{id}/aloha
Authorization: Bearer <API_KEY>
```

### Response

```json
{
  "ta3Submission": {
    "id": "clxyz...",
    "recordId": "clabc...",
    "vulnerabilityId": "cldef...",
    "sarif": { ... },
    "exploitUri": "https://...",
    "narrative": "...",
    "impact": "...",
    ...
  },
  "aloha": {
    "status": "Confirmed",
    "log": {
      "testedBy": "ALOHA-automated",
      "testDate": "2026-03-03T14:30:00.000Z",
      "note": "Exploit verified in emulator environment"
    }
  }
}
```

The `aloha.status` field is `null` when no IV&V assessment has been submitted. The `aloha.log` defaults to `{}`.

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/ta3Submissions` | List TA3 submissions (supports `lastUpdatedStartTime`, pagination). |
| `GET` | `/api/v1/remediations` | List remediations (supports `lastUpdatedStartTime`, pagination). |
| `GET` | `/api/v1/ta3Submissions/{id}/aloha` | Get ALOHA status and log for a TA3 submission. |
| `PUT` | `/api/v1/ta3Submissions/{id}/aloha` | Update ALOHA status and log for a TA3 submission. |
| `GET` | `/api/v1/remediations/{id}/aloha` | Get ALOHA status and log for a remediation. |
| `PUT` | `/api/v1/remediations/{id}/aloha` | Update ALOHA status and log for a remediation. |

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| `401` | `UNAUTHORIZED` | Missing or invalid `Authorization` header. |
| `404` | `NOT_FOUND` | The requested TA3 submission or remediation does not exist. |

**Example error response:**

```json
{
  "code": "UNAUTHORIZED",
  "message": "Unauthorized"
}
```
