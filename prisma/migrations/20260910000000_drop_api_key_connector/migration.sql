-- ApiKeyConnector is gone (VW-435). Nothing else references the table: its FKs
-- all point outward (apikey, integration, user), so a plain DROP is enough.
DROP TABLE "api_key_connector";
