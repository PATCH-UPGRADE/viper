-- Nothing fires the two DeviceGroup triggers. Saved webhooks must lose them
-- first, because the cast below fails on a value that the new enum lacks.
UPDATE "Webhook" SET "triggers" = array_remove(array_remove("triggers", 'DeviceGroup_Created'), 'DeviceGroup_Updated') WHERE "triggers" && ARRAY['DeviceGroup_Created', 'DeviceGroup_Updated']::"TriggerEnum"[];


-- AlterEnum
BEGIN;
CREATE TYPE "TriggerEnum_new" AS ENUM ('Artifact_Created', 'Artifact_Updated', 'DeviceArtifact_Created', 'DeviceArtifact_Updated', 'Remediation_Created', 'Remediation_Updated', 'Vulnerability_Created', 'Vulnerability_Updated');
ALTER TABLE "Webhook" ALTER COLUMN "triggers" TYPE "TriggerEnum_new"[] USING ("triggers"::text::"TriggerEnum_new"[]);
ALTER TYPE "TriggerEnum" RENAME TO "TriggerEnum_old";
ALTER TYPE "TriggerEnum_new" RENAME TO "TriggerEnum";
DROP TYPE "TriggerEnum_old";
COMMIT;
