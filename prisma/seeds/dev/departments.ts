import prisma from "@/lib/db";

const SAMPLE_DEPARTMENTS = [
  {
    name: "Radiology",
    description:
      "Imaging department — CT, PACS, ultrasound, X-ray, reading rooms.",
    color: "purple",
  },
  {
    name: "Emergency Department",
    description: "ED clinical operations, including the bedside image viewer.",
    color: "red",
  },
  {
    name: "Biomed",
    description:
      "Medical device lifecycle — patient monitors, infusion pumps, validation.",
    color: "orange",
  },
  {
    name: "Biotech",
    description: "Biotechnology research and lab operations.",
    color: "yellow",
  },
  {
    name: "Nursing",
    description: "Ward operations on the medical-surgical floor.",
    color: "pink",
  },
  {
    name: "IT",
    description: "Network, firewall, VPN, identity, and security operations.",
    color: "blue",
  },
  {
    name: "Procurement",
    description: "Capital equipment sourcing and manufacturer management.",
    color: "blue",
  },
  {
    name: "Administration",
    description: "Hospital leadership and compliance oversight.",
    color: "slate",
  },
];

export const SEED_USER_DEPARTMENT = "IT";

export async function seedDepartments(userId: string) {
  console.log("\n🌱 Seeding departments...");

  const departments = await Promise.all(
    SAMPLE_DEPARTMENTS.map((dept) =>
      prisma.department.upsert({
        where: { name: dept.name },
        update: dept,
        create: dept,
      }),
    ),
  );

  const seedUserDept = departments.find((d) => d.name === SEED_USER_DEPARTMENT);
  if (seedUserDept) {
    await prisma.user.update({
      where: { id: userId },
      data: { departmentId: seedUserDept.id },
    });
  }

  console.log(`✅ Seeded ${departments.length} departments`);
  return departments;
}
