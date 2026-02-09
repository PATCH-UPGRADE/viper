# VIPER Architecture and Supporting Diagrams

## Integrating with external data providers

```mermaid
graph TB
    Start([Integration Type]) --> Pattern1{Pattern 1:<br/>VIPER Polls External Provider}
    Start --> Pattern2{Pattern 2:<br/>External Provider Uses VIPER API}
    
    %% Pattern 1: VIPER Polls External Provider
    Pattern1 --> Trigger1[Scheduled or Manual Trigger]
    Trigger1 --> Decision{Does Provider Follow<br/>VIPER Standard?}
    
    Decision -->|Case 1: Yes| Standard1[VIPER sends POST request<br/>to external provider]
    Standard1 --> Standard2[Provider formats data per<br/>VIPER specification]
    Standard2 --> Standard3[Provider submits to<br/>integration upload endpoint]
    
    Decision -->|Case 2: No| NonStandard1[AI Agent crawls provider's<br/>API endpoints]
    NonStandard1 --> NonStandard2[AI formats data per<br/>VIPER specification]
    NonStandard2 --> NonStandard3[AI submits to<br/>integration upload endpoint]
    
    Standard3 --> End1([Data Synchronized])
    NonStandard3 --> End1
    
    %% Pattern 2: External Provider Uses VIPER API
    Pattern2 --> APIKey[Provider receives<br/>VIPER API key]
    APIKey --> Pull[Pull: Provider pulls data<br/>from VIPER endpoints]
    APIKey --> Push[Push: VIPER sends webhooks<br/>on specific events]
    
    Pull --> ProviderSubmit[Provider submits new data<br/>to VIPER endpoints]
    Push --> WebhookExample[Example: New TA2<br/>emulator uploaded]
    WebhookExample --> WebhookSend[VIPER sends data to<br/>external provider]
    WebhookSend --> ProviderSubmit
    
    ProviderSubmit --> End2([Integration Complete])
    
    %% Styling
    classDef viperAction fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,color:#fff
    classDef providerAction fill:#50C878,stroke:#2D7A4A,stroke-width:2px,color:#fff
    classDef aiAction fill:#9B59B6,stroke:#6C3483,stroke-width:2px,color:#fff
    classDef decision fill:#F39C12,stroke:#B8860B,stroke-width:2px,color:#fff
    classDef endpoint fill:#E74C3C,stroke:#A93226,stroke-width:2px,color:#fff
    
    class Start,Trigger1,Standard1,NonStandard1,NonStandard2,Push,WebhookSend decision
    class Standard2,Standard3,ProviderSubmit,Pull,WebhookExample providerAction
    class NonStandard1,NonStandard2,NonStandard3 aiAction
    class Pattern1,Pattern2,Decision decision
    class End1,End2,APIKey endpoint
```


**VIPER polls external provider**:
* VIPER initiates a request to synchronize with/get data from an external provider (either triggered on a schedule, or manually by a user)
* Two pathways:
    * Case 1. External provider follows standardized integration procedure with VIPER
        * VIPER submits a POST request to external provider requesting latest data for synchronization
        * External provider formats data according to VIPER specification
        * External provider submits data to VIPER's `<assets|vulnerabilities|remediations|deviceArtifacts>/integrationUpload` endpoint
    * Case 2. External provider doesn't follow standardized integration procedure
        * Triggers AI agent to crawl provider's specified API endpoints
        * AI formats data according to internal VIPER specification
        * AI submits data to VIPER's `<assets|vulnerabilities|remediations|deviceArtifacts>/integrationUpload` endpoint

**External provider uses VIPER API**:
* Provider receives VIPER API key
    * Pull: Provider pulls data from VIPER endpoints
    * Push: Provider sends webhooks on specific events (e.g, new TA2 emulator uploaded)
* Provider submits new data to VIPER endpoints

## VMP Blueflow / Helm Integration

This is a subcase of the "VIPER polls external provider" case presented above.

A VMP user configures both a Helm and Blueflow integration, and a schedule on how often to request new data for synchronization.

VIPER just treats the API endpoints for Blueflow/Helm the user configures as blackboxes. In actuality, Blueflow will have an explicit connector for VIPER, and Helm with have an additional API that negotiates between VIPER and Helm, but both facilitate the transfer of external data to VIPER's platform.
