import prisma from "@/lib/db";
import { matchingIdsForCpes } from "./canonical-identity";

export async function seedWorkflows(userId: string) {
  console.log("\n🌱 Seeding workflows...");

  const STEP_POS = 100;

  const ctScannerMatchingIds = await matchingIdsForCpes([
    "cpe:2.3:h:gehealthcare:brightspeed_elite_select:-:*:*:*:*:*:*:*",
  ]);

  // ── Workflow 1: Emergency CT — Acute Stroke / Trauma Protocol ───────────────
  const workflow1 = await prisma.workflow.create({
    data: {
      name: "Emergency CT: Acute Stroke / Trauma Protocol",
      description:
        "End-to-end clinical pathway for a time-sensitive ED imaging order — from patient arrival through CT acquisition, PACS routing, radiology interpretation, and ED treatment decision.",
      userId,
    },
  });

  const w1nodes = await Promise.all([
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "Patient Arrives at ED",
        type: "STEP",
        position: { x: 0 * STEP_POS, y: 0 },
        data: {
          label: "Patient Arrives at ED",
          description:
            "Patient presents with suspected stroke, trauma, or altered mental status — time-sensitive imaging required.",
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "ED Physician Orders CT",
        type: "STEP",
        position: { x: 1 * STEP_POS, y: 0 },
        data: {
          label: "ED Physician Orders CT",
          description:
            "Clinical order placed for emergent CT scan with contrast.",
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "CT Scanner",
        type: "ASSET",
        position: { x: 2 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "GE BrightSpeed Elite Select",
          description:
            "GE BrightSpeed Elite Select acquires axial and helical CT studies. Completed images are sent to the CT acquisition workstation via DICOM.",
        },
        deviceGroupMatchings: {
          connect: ctScannerMatchingIds.map((id) => ({ id })),
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "CT Acquisition Workstation",
        type: "ASSET",
        position: { x: 3 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "CT Acquisition Workstation",
          description:
            "GE Advantage Workstation 4.6 processes raw CT data, reconstructs images, and pushes the completed study to PACS.",
        },
        assets: { connect: [{ id: "rad-ws-001" }] },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "PACS Server",
        type: "ASSET",
        position: { x: 4 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "PACS Server",
          description:
            "Centricity PACS-IW v5.0 stores and routes DICOM studies to radiology workstations and the ED image viewer.",
        },
        assets: { connect: [{ id: "rad-pacs-001" }] },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "Radiology Diagnostic Workstations",
        type: "ASSET",
        position: { x: 5 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "Radiology Diagnostic Workstations",
          description:
            "Radiologist interprets the CT study on a diagnostic-grade display, dictates findings, and signs the final report.",
        },
        assets: { connect: [{ id: "rad-rws-001" }, { id: "rad-rws-002" }] },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "ED Image Viewer",
        type: "ASSET",
        position: { x: 6 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "ED Image Viewer",
          description:
            "ED team reviews the imaging study and the signed radiology report to guide treatment and disposition decisions.",
        },
        assets: { connect: [{ id: "rad-ed-001" }] },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow1.id,
        name: "Treatment / Disposition Decision",
        type: "STEP",
        position: { x: 7 * STEP_POS, y: 0 },
        data: {
          label: "Treatment / Disposition Decision",
          description:
            "ED team uses imaging result for treatment, transfer, or patient disposition.",
        },
      },
    }),
  ]);

  for (let i = 0; i < w1nodes.length - 1; i++) {
    await prisma.connection.create({
      data: {
        workflowId: workflow1.id,
        fromNodeId: w1nodes[i].id,
        toNodeId: w1nodes[i + 1].id,
        fromOutput: "main",
        toInput: "main",
      },
    });
  }

  console.log(`  ✅ "${workflow1.name}" (${w1nodes.length} nodes)`);

  // ── Workflow 2: Remote Radiology — After-Hours Imaging Coverage ─────────────
  const workflow2 = await prisma.workflow.create({
    data: {
      name: "Remote Radiology — After-Hours Imaging Coverage",
      description:
        "Workflow for inpatient studies acquired after hours and routed to a remote radiologist via VPN, enabling continuous imaging coverage and timely clinical decisions around the clock.",
      userId,
    },
  });

  const imagingDeviceMatchingIds = await matchingIdsForCpes([
    "cpe:2.3:h:gehealthcare:logiq_e:r7:*:*:*:*:*:*:*",
    "cpe:2.3:h:gehealthcare:optima_xr200amx:-:*:*:*:*:*:*:*",
  ]);

  const w2nodes = await Promise.all([
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Inpatient Imaging Order Placed",
        type: "STEP",
        position: { x: 0 * STEP_POS, y: 0 },
        data: {
          label: "Inpatient Imaging Order Placed",
          description:
            "Clinical team orders after-hours imaging for an inpatient.",
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Imaging Device",
        type: "ASSET",
        position: { x: 1 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "Portable Ultrasound / X-Ray",
          description:
            "GE LOGIQ e R7 portable ultrasound or Optima XR200amx DR system acquires bedside or mobile studies for inpatients.",
        },
        deviceGroupMatchings: {
          connect: imagingDeviceMatchingIds.map((id) => ({ id })),
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "PACS Server",
        type: "ASSET",
        position: { x: 2 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "PACS Server",
          description:
            "Centricity PACS-IW v5.0 stores the study and routes it to the remote radiologist via the VPN gateway.",
        },
        assets: { connect: [{ id: "rad-pacs-001" }] },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Remote Radiology VPN Gateway",
        type: "ASSET",
        position: { x: 3 * STEP_POS, y: 0 },
        data: {
          icon: "Workstation on Wheels",
          label: "Remote Radiology VPN Gateway",
          description:
            "Cisco ASA 5505 VPN gateway provides secure encrypted connectivity for remote radiologist access to the hospital PACS.",
        },
        assets: { connect: [{ id: "rad-vpn-001" }] },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Remote Radiologist Reviews Study",
        type: "STEP",
        position: { x: 4 * STEP_POS, y: 0 },
        data: {
          label: "Remote Radiologist Reviews Study",
          description:
            "Off-site radiologist reads the study via VPN and prepares a signed report.",
        },
      },
    }),
    prisma.node.create({
      data: {
        workflowId: workflow2.id,
        name: "Signed Report Returned to Care Team",
        type: "STEP",
        position: { x: 5 * STEP_POS, y: 0 },
        data: {
          label: "Signed Report Returned to Care Team",
          description:
            "Final radiology report transmitted back to the ordering care team.",
        },
      },
    }),
  ]);

  for (let i = 0; i < w2nodes.length - 1; i++) {
    await prisma.connection.create({
      data: {
        workflowId: workflow2.id,
        fromNodeId: w2nodes[i].id,
        toNodeId: w2nodes[i + 1].id,
        fromOutput: "main",
        toInput: "main",
      },
    });
  }

  console.log(`  ✅ "${workflow2.name}" (${w2nodes.length} nodes)`);
  console.log("✅ Workflow seeding complete");
}
