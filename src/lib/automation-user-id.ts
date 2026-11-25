// Fixed id for the single service account that owns automatically-ingested
// records (e.g. work-order tickets created from forwarded emails). Using a
// stable id makes find-or-create idempotent and keeps provenance clear.
// Kept apart from automation-user.ts, which is server-only.
export const AUTOMATION_USER_ID = "viper-automation";
