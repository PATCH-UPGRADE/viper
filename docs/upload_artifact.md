# Uploading artifacts to Viper

- When adding an artifact such as a remediation, an external downloadUrl can be provided (IE to a GitHub patch).

- If a downloadUrl is not available, Viper is also able to host an artifact via S3. Here's an example workflow:

1. Ensure that you have generated a Viper API key and can call its endpoints.

2. Obtain the size (in bytes) and Base64 MD5 hash of the file you wish to upload. Here's an example of how that might be done: 
    - SIZE:
        - `stat -c %s vw61-architecture.drawio`
    - Base64 MD5 Hash:
        - `md5_hash=$(openssl dgst -md5 -binary vw61-architecture.drawio | openssl enc -base64) && echo $md5_hash` 

3. POST against the Viper /remediations API endpoint and include both an artifact hash and the size (in bytes), but *NOT* a downloadUrl
    - See https://viper-xi.vercel.app/api/openapi-ui#tag/remediations/post/remediations
    - Example payload:
        ```json
        {
            "cpes": [
                "cpe:2.3:h:tester:dummy:*:*:*:*:*:*:*:*"
            ],
            "vulnerabilityId": "cmkojdbok001sy95b18ad1q4t",
            "description": "Dummy remediation to test artifact upload",
            "artifacts": [
                {
                "name": "vw61-architecture.drawio",
                "artifactType": "Documentation",
                "hash": "WknCHrZ5WeXj1IimWmsSMQ==",
                "size": 7883
                }
            ]
        }
        ```

    -  Example response:
        ```json
        {
        "remediation": {
            "id": "cmlr2yahd000sov7rgv3yyel7",
            "affectedDeviceGroups": [
            {
                "id": "cmlqzpxr5000yovqzgfoagpvj",
                "cpe": "cpe:2.3:h:tester:dummy:*:*:*:*:*:*:*:*"
            }
            ],
            "upstreamApi": null,
            "description": "Dummy remediation to test artifact upload",
            "narrative": null,
            "vulnerability": {
            "id": "cmkojdbok001sy95b18ad1q4t",
            "url": "http://localhost:3000/api/v1/vulnerabilities/cmkojdbok001sy95b18ad1q4t"
            },
            "user": {
            "id": "2fa204a5-3940-4944-ae41-4bfe6c32397e",
            "name": "Seed User",
            "email": "user@example.com",
            "image": null
            },
            "artifacts": [
            {
                "id": "cmlr2yasx000uov7rekx9jh7t",
                "versionsCount": 1,
                "allVersionsUrl": "http://localhost:3000/api/v1/artifacts/versions/cmlr2yasx000uov7rekx9jh7t",
                "latestArtifact": {
                "id": "cmlr2yavq000wov7rfkgaev3k",
                "name": "vw61-architecture.drawio",
                "artifactType": "Documentation",
                "downloadUrl": "https://northeasterntest0226.s3.us-east-1.amazonaws.com/artifacts/e4b437fa-1b29-40a1-ba37-cefe2d28d2b1-vw61-architecture.drawio",
                "hash": null,
                "size": 7883,
                "versionNumber": 1,
                "createdAt": "2026-02-17T20:53:05.558Z",
                "updatedAt": "2026-02-17T20:53:05.558Z",
                "url": "http://localhost:3000/api/v1/artifacts/cmlr2yavq000wov7rfkgaev3k",
                "prevVersionId": null
                }
            }
            ],
            "createdAt": "2026-02-17T20:53:05.041Z",
            "updatedAt": "2026-02-17T20:53:05.041Z"
        },
        "uploadInstructions": [
            {
            "artifactName": "vw61-architecture.drawio",
            "uploadUrl": "https://northeasterntest0226.s3.us-east-1.amazonaws.com/artifacts/e4b437fa-1b29-40a1-ba37-cefe2d28d2b1-vw61-architecture.drawio?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAS54JWPVTND4BLWNO%2F20260217%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260217T205304Z&X-Amz-Expires=3600&X-Amz-Signature=509498cb3e7074a6bad312a4809dcf1d56f9d0d45aa85becc5308ab54ec27474&X-Amz-SignedHeaders=content-length%3Bcontent-md5%3Bhost&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject",
            "requiredHeader": "WknCHrZ5WeXj1IimWmsSMQ=="
            }
        ]
        }
        ```

4. Use the uploadUrl and requiredHeader to send a PUT request to S3 to upload your artifact. The presigned upload URL will expire in one hour.
    - Example PUT to S3 using CURL:
    ```bash
    curl -i -X PUT \
     -T "vw61-architecture.drawio" \
     -H "Content-Type: application/octet-stream" \
     -H "Content-MD5: WknCHrZ5WeXj1IimWmsSMQ==" \
     "https://northeasterntest0226.s3.us-east-1.amazonaws.com/artifacts/e4b437fa-1b29-40a1-ba37-cefe2d28d2b1-vw61-architecture.drawio?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAS54JWPVTND4BLWNO%2F20260217%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260217T205304Z&X-Amz-Expires=3600&X-Amz-Signature=509498cb3e7074a6bad312a4809dcf1d56f9d0d45aa85becc5308ab54ec27474&X-Amz-SignedHeaders=content-length%3Bcontent-md5%3Bhost&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject"
    ```

5. Once the artifact is uploaded, go to Viper -> Remediations and test the link to your new remediation artifact.