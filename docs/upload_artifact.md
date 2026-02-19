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

6. PUT against Viper /remediations/{id}
    - See http://localhost:3000/api/openapi-ui#tag/remediations/put/remediationsid
    - Example payload:
        ```json
        "id": "cmkojdbwb002iy95bcw2ujerl"
        {
            "artifacts": [
                {
                "name": "vw61-architecture.drawio",
                "artifactType": "Source",
                "hash": "WknCHrZ5WeXj1IimWmsSMQ==",
                "size": 7883
                }
            ]
        }
        ```

    - Example response:
        ```json
        {
            "remediation": {
                "id": "cmkojdbwb002iy95bcw2ujerl",
                "affectedDeviceGroups": [
                {
                    "id": "cmkojdbjv000fy95b3hfqai5f",
                    "cpe": "cpe:2.3:a:epic:emr:2023:*:*:*:*:*:*:*"
                }
                ],
                "upstreamApi": "https://www.epic.com/software",
                "description": "HL7 interface upgrade replaces deprecated DES encryption with AES-256-GCM for all patient data transmissions.",
                "narrative": "Epic technical team must schedule upgrade during EMR maintenance window (quarterly, usually Sunday midnight-6 AM). All HL7 interfaces (lab, pharmacy, radiology) will be offline during 4-hour upgrade. Clinical systems revert to downtime procedures. After upgrade, validate all interface transactions for 24 hours. Monitor HL7 error logs. Test critical workflows: lab orders, medication orders, radiology results.",
                "vulnerability": {
                "id": "cmkojdbom0024y95bnxmhxteo",
                "url": "http://localhost:3000/api/v1/vulnerabilities/cmkojdbom0024y95bnxmhxteo"
                },
                "user": {
                "id": "2fa204a5-3940-4944-ae41-4bfe6c32397e",
                "name": "Seed User",
                "email": "user@example.com",
                "image": null
                },
                "artifacts": [
                {
                    "id": "cmltqzodh000uov8opbgw07vb",
                    "versionsCount": 1,
                    "allVersionsUrl": "http://localhost:3000/api/v1/artifacts/versions/cmltqzodh000uov8opbgw07vb",
                    "latestArtifact": {
                    "id": "cmltqzoga000wov8o3e4ubuds",
                    "name": "Test",
                    "artifactType": "Source",
                    "downloadUrl": "https://northeasterntest0226.s3.us-east-1.amazonaws.com/artifacts/eccbf6f5-533a-4742-868e-dc6df4a6c2f7-Test",
                    "hash": "WknCHrZ5WeXj1IimWmsSMQ==",
                    "size": 7883,
                    "versionNumber": 1,
                    "createdAt": "2026-02-19T17:41:32.939Z",
                    "updatedAt": "2026-02-19T17:41:32.939Z",
                    "url": "http://localhost:3000/api/v1/artifacts/cmltqzoga000wov8o3e4ubuds",
                    "prevVersionId": null
                    }
                },
                {
                    "id": "wrapper_rem_cmkojdbwb002iy95bcw2ujerl",
                    "versionsCount": 1,
                    "allVersionsUrl": "http://localhost:3000/api/v1/artifacts/versions/wrapper_rem_cmkojdbwb002iy95bcw2ujerl",
                    "latestArtifact": {
                    "id": "artifact_fix_cmkojdbwb002iy95bcw2ujerl",
                    "name": "Fix",
                    "artifactType": "Emulator",
                    "downloadUrl": "https://github.com/epic-systems/hl7-encryption-upgrade-2024",
                    "hash": null,
                    "size": null,
                    "versionNumber": 1,
                    "createdAt": "2026-02-06T21:07:57.279Z",
                    "updatedAt": "2026-02-17T18:58:32.500Z",
                    "url": "http://localhost:3000/api/v1/artifacts/artifact_fix_cmkojdbwb002iy95bcw2ujerl",
                    "prevVersionId": null
                    }
                },
                {
                    "id": "cmltr7r0o0014ov8oc71e22a8",
                    "versionsCount": 1,
                    "allVersionsUrl": "http://localhost:3000/api/v1/artifacts/versions/cmltr7r0o0014ov8oc71e22a8",
                    "latestArtifact": {
                    "id": "cmltr7r3g0016ov8o7ud5g7g3",
                    "name": "vw61-architecture.drawio",
                    "artifactType": "Source",
                    "downloadUrl": "https://northeasterntest0226.s3.us-east-1.amazonaws.com/artifacts/edd3d6a1-891e-47e9-bb88-6277c8054d95-vw61-architecture.drawio",
                    "hash": "WknCHrZ5WeXj1IimWmsSMQ==",
                    "size": 7883,
                    "versionNumber": 1,
                    "createdAt": "2026-02-19T17:47:49.613Z",
                    "updatedAt": "2026-02-19T17:47:49.613Z",
                    "url": "http://localhost:3000/api/v1/artifacts/cmltr7r3g0016ov8o7ud5g7g3",
                    "prevVersionId": null
                    }
                }
                ],
                "createdAt": "2026-01-21T21:29:39.708Z",
                "updatedAt": "2026-01-21T21:29:39.708Z"
            },
            "uploadInstructions": [
                {
                "artifactName": "vw61-architecture.drawio",
                "uploadUrl": "https://northeasterntest0226.s3.us-east-1.amazonaws.com/artifacts/edd3d6a1-891e-47e9-bb88-6277c8054d95-vw61-architecture.drawio?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAS54JWPVTND4BLWNO%2F20260219%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260219T174749Z&X-Amz-Expires=3600&X-Amz-Signature=4b21f1bee330a9e52b9270fdeebda1e7548463270d41ff2e7005f307899f0826&X-Amz-SignedHeaders=content-length%3Bcontent-md5%3Bhost&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject",
                "requiredHeader": "WknCHrZ5WeXj1IimWmsSMQ=="
                }
            ]
        }
        ```
    - Use same PUT to S3 format as above, and navigate to the remediation to see your new artifact.

7. For programmatic uploads, you may want to do something like
    ```js
          fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-MD5": requiredHeader
            },
            body: yourFileBlob
          });
    ```


### Initial setup 
- Note that the following env vars must exist (also see .env.example):

```bash
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
```