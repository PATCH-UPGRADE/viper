### How were Integrations originally designed to work?

`ExternalAssetMapping` / `External*Mapping`: Used for synchronizing a VIPER model with a representation of it on an external platform. “Our row mirror a row that exists over there”.

```
model Asset {
  id             String  @id @default(cuid())
  serialNumber String?
  macAddress String?
  upstreamApi String
  externalMappings     ExternalAssetMapping[]
}

model ExternalAssetMapping {
  id            String      @id @default(cuid())
  itemId        String
  integrationId String
  externalId    String // the id the asset has on say, Blueflow
  // Relationships
  item          Asset       @relation(fields: [itemId], references: [id], onDelete: Cascade)
  integration   Integration @relation(fields: [integrationId], references: [id], onDelete: Cascade)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  lastSynced    DateTime?

  // Composite unique constraint: one external ID per integration per item
  @@unique([itemId, integrationId], name: "external_asset_mappings_item_integration_key")
  // Critical index for fast lookups: "find item by integration's external ID"
  @@unique([integrationId, externalId], name: "external_asset_mappings_integration_external_key")
  @@index([itemId])
  @@map("external_asset_mappings")
}

model Integration {
  id                 String          @id @default(cuid())
  name               String
  platform           String? // The name of the integration platform, e.g "BlueFlow"
  integrationUri     String          @map("integration-uri")
  integrationType    IntegrationType
  // ^PARTNER: Helm, Blueflow. Follows VIPER standard 
  // AI: uses AI to pull data from any platform
  // REST: Used for teamplay Fleet integration?
  prompt             String?         @db.Text // optional, additional instructions for AI
  authType           AuthType
  resourceType       ResourceType
  authentication     Json? // TODO: this needs to be encrypted
  syncEvery          Int // e.g 300, sync every 300 seconds
  syncStatus         SyncStatus[]
  lastSuccessfulSync DateTime?

  // The user who created the integration
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // the user that this integration creates
  integrationUserId String @unique
  integrationUser   User   @relation(name: "integration_user", fields: [integrationUserId], references: [id], onDelete: Cascade)

  assetMappings          ExternalAssetMapping[]
  deviceArtifactMappings ExternalDeviceArtifactMapping[]
  remediationMappings    ExternalRemediationMapping[]
  vulnerabilityMappings  ExternalVulnerabilityMapping[]
  workOrderMappings      ExternalWorkOrderMapping[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([integrationUserId])
  @@map("integration")
}
```

* Every `5 minutes`, an Inngest job gets triggered to go through all Integrations  
* If the diff between now and `lastSuccessfulSync` is greater than `syncEvery`, we will sync this `Integration`  
* Two pathways that merge into one:  
  * For an AI integration:  
    * Issues a token for the integration user (tokens expire after N minutes or when used, is essentially auth for a user)  
    * Creates a unique callback URL with the token, provides a schema, and gives `authType`, `authentication`, `integrationUri`, and `additionalInstructions` to N8N  
    * An N8N agent will go to `integrationUri`, authenticate, then follow `additionalInstructions`. It will find all \<assets|vulns|remediations|etc\>, format according to the schema, and then reply to the callback url  
  * For a PARTNER integration (Blueflow):  
    * Issue a token for the integration user  
    * Creates a unique callback URL with the token  
    * Authenticates, sends the callback url to `integrationUri` and a timestamp of when the last successful sync was. Should receive a 202 response  
    * Partner service responds back to callback url with assets that were updated since the last sync timestamp.  
* Without loss of generality, VIPER receives a list of assets at the callback url. This request is authenticated as `integrationUser`. For each asset in the payload:  
  * VIPER looks up the field `externalId`, if provided.   
  * Case 1\. `externalId` is provided, and VIPER has an `ExternalAssetMapping` with that unique ID, from this integration. VIPER updates the asset if any fields have changed.  
  * Case 2\. `externalId` is provided, but VIPER does not have an `ExternalAssetMapping` with that ID. VIPER upserts an asset based on unique fields (macAddress, serialNumber). If the asset is created, it is created by the `integrationUser`. VIPER creates an `ExternalAssetMapping`, tying this asset to the integration.  
    * Today, VIPER also modifies `upstreamApi` if provided – TODO: move `upstreamApi` from `Asset` to `ExternalAssetMapping`   
  * Case 3\. `externalId` is not provided. Not handled today, this is a required field. XKCD 2200\.

Currently, our auth middleware links requests to protected endpoints to a user, either via session or an API key (and now, token). `integrationUser` was a cheap way to extend this. An integration authenticates as a user. If an integration creates an asset, the asset `createdBy`, which expects a user, is set to the `integrationUser`. WLOG, a TA3 team creating a vulnerability on VIPER creates a user, authenticates with an API key, and then the “source tool” that created the vulnerability is the TA3 user.

Not documented above: error handling, “REST” integration type
