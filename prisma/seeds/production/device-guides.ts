import type { DeviceGuideTopic } from "@/generated/prisma";
import prisma from "@/lib/db";
import { requireDeviceTypeId } from "./device-types";

const DEVICE_TYPE_GUIDES: Record<
  string,
  Partial<Record<DeviceGuideTopic, string>>
> = {
  "infusion-pump": {
    TYPICAL_USAGE:
      "Delivers fluids and medicines into a patient's vein at a set rate. Many run for hours or days without stopping.",
  },
  "patient-monitor": {
    TYPICAL_USAGE:
      "Tracks a patient's heart rate, breathing, oxygen and blood pressure, and alerts nurses when something changes. Runs day and night.",
  },
  ventilator: {
    TYPICAL_USAGE:
      "Breathes for patients who can't breathe well on their own, mostly in intensive care and during surgery. Often stays connected to one patient for days or weeks without a break.",
  },
  "lab-equipment": {
    TYPICAL_USAGE:
      "Analyzes blood, urine and other samples so doctors can diagnose and track illness. Runs batches of samples around the clock and sends results to the hospital's records system.",
  },
  "x-ray": {
    TYPICAL_USAGE:
      "Takes quick pictures of bones, chest and lungs, in the imaging department, the emergency room or at the bedside. Used many times a day, each scan taking only seconds.",
  },
  "computed-tomography": {
    TYPICAL_USAGE:
      "Takes detailed cross-section images of the body to find injuries, bleeding, strokes and tumors. Scans patients back to back all day and is on call around the clock for emergencies.",
  },
  "magnetic-resonance-imaging": {
    TYPICAL_USAGE:
      "Uses a strong magnet to create detailed images of the brain, spine, joints and organs without radiation. Each scan takes 20 to 60 minutes, and the schedule is usually booked from morning into the evening.",
  },
  ultrasound: {
    TYPICAL_USAGE:
      "Uses sound waves to show organs, blood flow and babies during pregnancy in real time. Moved between rooms and wards and used for many short exams throughout the day.",
  },
  mammography: {
    TYPICAL_USAGE:
      "Takes low-dose X-rays of the breast to screen for and diagnose breast cancer. Runs scheduled screening appointments during clinic hours, usually every 15 to 30 minutes.",
  },
  angiography: {
    TYPICAL_USAGE:
      "Shows blood vessels live on screen while doctors open blocked arteries, place stents or stop bleeding. Used during planned procedures and urgent cases such as heart attacks and strokes, day or night.",
  },
  "molecular-imaging": {
    TYPICAL_USAGE:
      "Uses a small amount of radioactive tracer (PET or SPECT) to show how organs and tissues are working, mostly to find and stage cancer. Scans are scheduled in advance and take around 30 minutes to an hour each.",
  },
  "imaging-workstation": {
    TYPICAL_USAGE:
      "Computer where radiologists and technologists review, measure and process scans, including 3D views. Used throughout each shift and often left logged in between readings.",
  },
  "image-viewer": {
    TYPICAL_USAGE:
      "Lets doctors and nurses open and look at patient scans from a regular computer or browser across the hospital. Used many times a day by many staff, often alongside the patient's record.",
  },
  "imaging-platform": {
    TYPICAL_USAGE:
      "Central software that connects scanners, workstations and records, and runs tools like AI analysis and reporting. Always running in the background so images and reports flow between systems.",
  },
  "image-archive-pacs": {
    TYPICAL_USAGE:
      "Stores every scan the hospital takes and sends them to whoever needs to view them. Runs 24/7 and holds years of patient images.",
  },
  firewall: {
    TYPICAL_USAGE:
      "Controls which network traffic is allowed in and out of the hospital and between its internal networks, keeping medical devices separated from the internet. Runs nonstop and inspects every connection.",
  },
  "network-switch": {
    TYPICAL_USAGE:
      "Connects computers, medical devices, phones and printers on the hospital network and moves data between them. Runs nonstop, usually in a wiring closet on each floor.",
  },
};

export async function seedDeviceGuides(idBySlug: Map<string, string>) {
  const data = Object.entries(DEVICE_TYPE_GUIDES).flatMap(([slug, topics]) => {
    const deviceTypeId = requireDeviceTypeId(idBySlug, slug, "Device guide");
    return Object.entries(topics).map(([topic, body]) => ({
      deviceTypeId,
      topic: topic as DeviceGuideTopic,
      body,
    }));
  });
  const { count } = await prisma.deviceGuide.createMany({
    data,
    skipDuplicates: true,
  });
  return count;
}
