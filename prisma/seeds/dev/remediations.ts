import type { ArtifactType } from "@/generated/prisma";
import prisma from "@/lib/db";
import { matchingForGroup } from "./canonical-identity";

// Remediations matched to seed vulnerability CPEs
const SAMPLE_REMEDIATIONS = [
  // CVE-2020-25175 remediation for GE BrightSpeed Elite Select
  {
    cpe: "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
    fixUri:
      "https://www.cisa.gov/news-events/ics-medical-advisories/icsma-20-343-01",
    description:
      "Apply GE Healthcare ICS security controls per CISA advisory ICSMA-20-343-01 and GE Security Bulletin GE-2020-004 to mitigate credential exposure on imaging devices (CVE-2020-25175).",
    narrative:
      "Work with GE Healthcare Biomedical/Clinical Engineering to apply mitigations from GE Security Bulletin GE-2020-004. Immediately isolate all affected GE imaging devices (CT scanner, ultrasound units, X-ray node) to a dedicated DICOM VLAN with strict ACLs permitting only DICOM traffic (port 104/TCP) to and from the PACS server. Disable unnecessary network services on each device via GE service mode. Request firmware update availability from your GE account representative. Deploy IDS/IPS monitoring on the DICOM VLAN to detect anomalous credential-bearing traffic. Post-remediation: verify DICOM connectivity to PACS and confirm the imaging workflow is unaffected.",
  },
  // CVE-2017-0144 remediation for CT Acquisition Workstation (Windows 7 / EOL host)
  {
    cpe: "cpe:2.3:a:gehealthcare:advantage_workstation:4.6:*:*:*:*:*:*:*",
    fixUri:
      "https://support.microsoft.com/en-us/topic/ms17-010-security-update-for-windows-smb-server-814d78c1-a11d-e4c8-d52a-f41a41b5d238",
    description:
      "Windows 7 and Server 2008 R2 are end-of-life and do not receive patches via standard Windows Update. Apply MS17-010 via Microsoft extended support if contracted, then implement network-level compensating controls to mitigate EternalBlue (CVE-2017-0144) across all five imaging network Windows hosts.",
    narrative:
      "Immediate actions: (1) Disable SMBv1 on all five affected hosts via PowerShell (Set-SmbServerConfiguration -EnableSMB1Protocol $false) and registry (HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters, SMB1=0). (2) Block TCP port 445 inbound at the Cisco Catalyst 2960S switch using ACLs on all imaging and PACS VLANs. (3) Deploy host-based firewall rules to block SMB from non-management hosts. (4) Micro-segment each workstation subnet to minimize lateral movement. Long-term: coordinate with GE Healthcare to plan migration of CT acquisition workstation and PACS server to a supported OS — Advantage Workstation 4.6 and Centricity PACS-IW 5.0 compatibility with newer Windows versions must be confirmed with the manufacturer before upgrading.",
  },
  // CVE-2016-6366 remediation for Cisco ASA 5505 (both VPN gateway and firewall)
  {
    cpe: "cpe:2.3:h:cisco:asa_5505:-:*:*:*:*:*:*:*",
    fixUri:
      "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-20160817-asa-snmp",
    description:
      "Upgrade Cisco ASA 5505 software from 8.2.x to a patched release (9.1(7.21) or later) per Cisco Security Advisory cisco-sa-20160817-asa-snmp to remediate the EXTRABACON SNMP buffer overflow (CVE-2016-6366). Applies to both the remote radiology VPN gateway and the perimeter firewall.",
    narrative:
      "Both ASA 5505 appliances must be upgraded. Cisco ASA 5505 supports ASA software up to 9.2(x); upgrade to 9.1(7.21)+ or the latest available 9.2.x release. Before upgrading: back up ASA configuration (copy running-config tftp://...), test rollback procedure in a change window. Schedule separate maintenance windows for each device — perimeter firewall first (~30 min downtime), then VPN gateway (coordinate with remote radiology team to minimize after-hours coverage gap). If an immediate upgrade cannot be scheduled: switch from SNMPv2c to SNMPv3 with authentication and encryption, or restrict SNMP community access via ACL to the management VLAN only. Post-upgrade: verify VPN tunnels for remote radiologist access, confirm firewall policy enforcement, and validate DICOM routing.",
  },
];

export async function seedRemediations(userId: string) {
  console.log("\n🌱 Seeding remediations...");

  const remediations = await Promise.all(
    SAMPLE_REMEDIATIONS.map(async (remediation) => {
      const deviceGroup = await prisma.deviceGroup.findFirst({
        where: { cpe: { has: remediation.cpe } },
      });

      if (!deviceGroup) {
        console.warn(`⚠️  No device group found for CPE: ${remediation.cpe}`);
        return null;
      }

      // Link the remediation to the device group via its own matching, and to
      // the vulnerability that affects the same group.
      const matchingId = await matchingForGroup({
        manufacturerId: deviceGroup.manufacturerId,
        productId: deviceGroup.productId,
        versionId: deviceGroup.versionId,
      });

      const vulnerability = await prisma.vulnerability.findFirst({
        where: {
          deviceGroupMatchings: {
            some: {
              manufacturerId: deviceGroup.manufacturerId ?? undefined,
              productId: deviceGroup.productId,
            },
          },
        },
      });

      if (!vulnerability) {
        console.warn(`⚠️  No vulnerability found for CPE: ${remediation.cpe}`);
        return null;
      }

      const createdRemediation = await prisma.remediation.create({
        data: {
          description: remediation.description,
          narrative: remediation.narrative,
          vulnerabilities: { connect: { id: vulnerability.id } },
          deviceGroupMatchings: matchingId
            ? { connect: { id: matchingId } }
            : undefined,
          userId,
        },
      });

      const wrapper = await prisma.artifactWrapper.create({
        data: {
          remediationId: createdRemediation.id,
          userId,
        },
      });

      const fixArtifact = await prisma.artifact.create({
        data: {
          wrapperId: wrapper.id,
          name: "Fix",
          artifactType: "Emulator" as ArtifactType,
          downloadUrl: remediation.fixUri,
          versionNumber: 1,
          userId,
        },
      });

      await prisma.artifactWrapper.update({
        where: { id: wrapper.id },
        data: {
          latestArtifactId: fixArtifact.id,
        },
      });

      return createdRemediation;
    }),
  );

  const successfulRemediations = remediations.filter((r) => r !== null);
  console.log(`✅ Seeded ${successfulRemediations.length} remediations`);
  return successfulRemediations;
}
