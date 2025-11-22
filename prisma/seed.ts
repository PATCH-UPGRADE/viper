import { PrismaClient } from '@/generated/prisma';
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

// Seed user credentials
const SEED_USER = {
  email: 'user@example.com',
  password: '1337_gone_jolene',
  name: 'Seed User',
};

// Sample hospital asset data
const SAMPLE_ASSETS = [
  // ICU Medical Devices
  {
    ip: '10.20.1.101',
    cpe: 'cpe:2.3:h:philips:intellivue_mp70:*:*:*:*:*:*:*:*',
    role: 'ICU Patient Monitor',
    upstream_api: 'https://api.philips.com/devices/monitor',
  },
  {
    ip: '10.20.1.102',
    cpe: 'cpe:2.3:h:baxter:infusion_pump:sigma_spectrum:*:*:*:*:*:*:*',
    role: 'Infusion Pump',
    upstream_api: 'https://api.baxter.com/devices/pump',
  },
  {
    ip: '10.20.1.103',
    cpe: 'cpe:2.3:h:ge_healthcare:dash_4000:*:*:*:*:*:*:*:*',
    role: 'Vital Signs Monitor',
    upstream_api: 'https://api.gehealthcare.com/devices/vitals',
  },
  {
    ip: '10.20.1.104',
    cpe: 'cpe:2.3:h:draeger:evita_v500:*:*:*:*:*:*:*:*',
    role: 'Ventilator',
    upstream_api: 'https://api.draeger.com/devices/ventilator',
  },

  // Laboratory Equipment
  {
    ip: '10.30.2.201',
    cpe: 'cpe:2.3:h:roche:cobas_6000:*:*:*:*:*:*:*:*',
    role: 'Laboratory Analyzer',
    upstream_api: 'https://api.roche.com/lab/analyzer',
  },
  {
    ip: '10.30.2.202',
    cpe: 'cpe:2.3:h:abbott:architect_i2000sr:*:*:*:*:*:*:*:*',
    role: 'Immunoassay Analyzer',
    upstream_api: 'https://api.abbott.com/lab/immunoassay',
  },
  {
    ip: '10.30.2.203',
    cpe: 'cpe:2.3:h:sysmex:xs-1000i:*:*:*:*:*:*:*:*',
    role: 'Hematology Analyzer',
    upstream_api: 'https://api.sysmex.com/lab/hematology',
  },

  // Imaging Equipment
  {
    ip: '10.40.3.301',
    cpe: 'cpe:2.3:h:siemens:magnetom_aera:*:*:*:*:*:*:*:*',
    role: 'MRI Scanner',
    upstream_api: 'https://api.siemens-healthineers.com/imaging/mri',
  },
  {
    ip: '10.40.3.302',
    cpe: 'cpe:2.3:h:ge_healthcare:optima_ct660:*:*:*:*:*:*:*:*',
    role: 'CT Scanner',
    upstream_api: 'https://api.gehealthcare.com/imaging/ct',
  },
  {
    ip: '10.40.3.303',
    cpe: 'cpe:2.3:h:fujifilm:fcr_xg-1:*:*:*:*:*:*:*:*',
    role: 'X-Ray System',
    upstream_api: 'https://api.fujifilm.com/imaging/xray',
  },

  // IT Infrastructure
  {
    ip: '10.10.4.401',
    cpe: 'cpe:2.3:a:epic:emr:2023:*:*:*:*:*:*:*',
    role: 'EMR Server',
    upstream_api: 'https://api.epic.com/emr/server',
  },
  {
    ip: '10.10.4.402',
    cpe: 'cpe:2.3:a:cerner:millennium:*:*:*:*:*:*:*:*',
    role: 'Clinical Information System',
    upstream_api: 'https://api.cerner.com/cis/server',
  },
  {
    ip: '10.10.4.403',
    cpe: 'cpe:2.3:a:meditech:expanse:*:*:*:*:*:*:*:*',
    role: 'Pharmacy System',
    upstream_api: 'https://api.meditech.com/pharmacy/server',
  },
  {
    ip: '10.10.4.404',
    cpe: 'cpe:2.3:h:cisco:unified_communications:*:*:*:*:*:*:*:*',
    role: 'Nurse Call System',
    upstream_api: 'https://api.cisco.com/communications/nurse',
  },

  // Surgical Equipment
  {
    ip: '10.50.5.501',
    cpe: 'cpe:2.3:h:stryker:surgical_navigation:*:*:*:*:*:*:*:*',
    role: 'Surgical Navigation System',
    upstream_api: 'https://api.stryker.com/surgical/navigation',
  },
  {
    ip: '10.50.5.502',
    cpe: 'cpe:2.3:h:intuitive:da_vinci_xi:*:*:*:*:*:*:*:*',
    role: 'Robotic Surgical System',
    upstream_api: 'https://api.intuitive.com/surgical/robot',
  },

  // Workstations
  {
    ip: '10.60.6.601',
    cpe: 'cpe:2.3:h:dell:optiplex_7090:*:*:*:*:*:*:*:*',
    role: 'Clinical Workstation',
    upstream_api: 'https://api.dell.com/workstation/clinical',
  },
  {
    ip: '10.60.6.602',
    cpe: 'cpe:2.3:h:hp:elitedesk_800:*:*:*:*:*:*:*:*',
    role: 'Nurse Station Workstation',
    upstream_api: 'https://api.hp.com/workstation/nurse',
  },
  {
    ip: '10.60.6.603',
    cpe: 'cpe:2.3:h:lenovo:thinkcentre_m90a:*:*:*:*:*:*:*:*',
    role: 'Administrative Workstation',
    upstream_api: 'https://api.lenovo.com/workstation/admin',
  },

  // Network Infrastructure
  {
    ip: '10.70.7.701',
    cpe: 'cpe:2.3:h:cisco:catalyst_9300:*:*:*:*:*:*:*:*',
    role: 'Network Switch',
    upstream_api: 'https://api.cisco.com/network/switch',
  },
  {
    ip: '10.70.7.702',
    cpe: 'cpe:2.3:h:fortinet:fortigate_600e:*:*:*:*:*:*:*:*',
    role: 'Firewall',
    upstream_api: 'https://api.fortinet.com/network/firewall',
  },
];

// Sample hospital vulnerability data
const SAMPLE_VULNERABILITIES = [
  {
    sarif: {
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'NVD Scanner' } },
        results: [{
          ruleId: 'CVE-2024-1234',
          level: 'error',
          message: { text: 'Buffer overflow in Philips IntelliVue patient monitor firmware' }
        }]
      }]
    },
    cpe: 'cpe:2.3:h:philips:intellivue_mp70:*:*:*:*:*:*:*:*',
    exploitUri: 'https://github.com/security-research/cve-2024-1234-poc',
    upstreamApi: 'https://nvd.nist.gov/vuln/detail/CVE-2024-1234',
    description: 'Buffer overflow vulnerability in Philips IntelliVue MP70 patient monitor firmware allows remote code execution',
    narrative: 'An attacker on the hospital network could send specially crafted packets to the monitor, causing a buffer overflow. This allows execution of arbitrary code with system privileges, enabling the attacker to manipulate vital sign readings or disable alarm functions.',
    impact: 'Critical patient safety risk. Compromised monitors could display false vital signs (heart rate, blood pressure, oxygen saturation) leading to incorrect clinical decisions. Alarm suppression could prevent detection of patient deterioration in ICU settings.',
  },
  {
    sarif: {
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'ICS-CERT Scanner' } },
        results: [{
          ruleId: 'CVE-2024-5678',
          level: 'warning',
          message: { text: 'Authentication bypass in Baxter infusion pump' }
        }]
      }]
    },
    cpe: 'cpe:2.3:h:baxter:infusion_pump:sigma_spectrum:*:*:*:*:*:*:*',
    exploitUri: 'https://github.com/medical-security/baxter-auth-bypass',
    upstreamApi: 'https://www.cisa.gov/ics-cert/advisories/icsa-24-001',
    description: 'Authentication bypass vulnerability in Baxter Sigma Spectrum infusion pump allows unauthorized access to drug library',
    narrative: 'An attacker with physical or network access could bypass authentication mechanisms and modify the drug library parameters. This includes changing maximum dose limits, infusion rates, and alarm thresholds without proper credentials.',
    impact: 'Life-threatening medication errors. Altered drug libraries could allow dangerous overdoses or underdoses. Modified rate limits could enable fatal medication administration. Suppressed alarms prevent clinical staff from detecting improper infusions.',
  },
  {
    sarif: {
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'FDA Cybersecurity Scanner' } },
        results: [{
          ruleId: 'CVE-2024-9012',
          level: 'error',
          message: { text: 'SQL injection in GE Healthcare PACS system' }
        }]
      }]
    },
    cpe: 'cpe:2.3:h:ge_healthcare:optima_ct660:*:*:*:*:*:*:*:*',
    exploitUri: 'https://github.com/healthcare-vulns/ge-pacs-sqli',
    upstreamApi: 'https://nvd.nist.gov/vuln/detail/CVE-2024-9012',
    description: 'SQL injection vulnerability in GE Healthcare CT scanner PACS interface allows database manipulation',
    narrative: 'An authenticated user could inject SQL commands through the PACS query interface. This allows reading, modifying, or deleting patient imaging records, exam metadata, and radiologist reports stored in the imaging database.',
    impact: 'HIPAA violation and patient safety risk. Attackers could access protected health information (PHI) including patient demographics and medical images. Modified or deleted imaging studies could lead to misdiagnosis. Altered reports could result in inappropriate treatment decisions.',
  },
  {
    sarif: {
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'MITRE Scanner' } },
        results: [{
          ruleId: 'CVE-2024-3456',
          level: 'warning',
          message: { text: 'Weak encryption in Epic EMR interface' }
        }]
      }]
    },
    cpe: 'cpe:2.3:a:epic:emr:2023:*:*:*:*:*:*:*',
    exploitUri: 'https://github.com/ehr-security/epic-encryption-weakness',
    upstreamApi: 'https://nvd.nist.gov/vuln/detail/CVE-2024-3456',
    description: 'Weak encryption in Epic EMR HL7 interface allows interception of patient data',
    narrative: 'The HL7 messaging interface uses deprecated encryption (DES) for patient data transmission. An attacker with network access could intercept and decrypt messages containing patient demographics, diagnoses, medications, and lab results.',
    impact: 'Massive HIPAA breach potential. Compromised EMR data includes complete medical histories, social security numbers, insurance information, and treatment plans. Exposure affects entire patient population. Regulatory fines and loss of patient trust.',
  },
  {
    sarif: {
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'Vendor Scanner' } },
        results: [{
          ruleId: 'CVE-2024-7890',
          level: 'error',
          message: { text: 'Remote code execution in Siemens MRI scanner' }
        }]
      }]
    },
    cpe: 'cpe:2.3:h:siemens:magnetom_aera:*:*:*:*:*:*:*:*',
    exploitUri: 'https://github.com/imaging-vulns/siemens-mri-rce',
    upstreamApi: 'https://cert.vde.com/en/advisories/VDE-2024-001',
    description: 'Remote code execution vulnerability in Siemens Magnetom Aera MRI scanner control software',
    narrative: 'Unauthenticated remote attacker could send malicious DICOM messages to the MRI scanner, triggering a stack overflow in the image processing module. This allows arbitrary code execution with SYSTEM privileges on the scanner workstation.',
    impact: 'Patient safety and equipment damage risk. Compromised MRI could alter scan parameters (gradient strength, RF power) causing patient harm or equipment damage. Modified images could lead to misdiagnosis. Scanner downtime disrupts radiology workflow and delays critical imaging.',
  },
  {
    sarif: {
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'Lab Equipment Scanner' } },
        results: [{
          ruleId: 'CVE-2024-2345',
          level: 'warning',
          message: { text: 'Default credentials in Roche Cobas analyzer' }
        }]
      }]
    },
    cpe: 'cpe:2.3:h:roche:cobas_6000:*:*:*:*:*:*:*:*',
    exploitUri: 'https://github.com/lab-security/roche-default-creds',
    upstreamApi: 'https://nvd.nist.gov/vuln/detail/CVE-2024-2345',
    description: 'Hardcoded default credentials in Roche Cobas 6000 laboratory analyzer',
    narrative: 'The analyzer ships with hardcoded administrative credentials that cannot be changed. An attacker with network access could log in using these credentials and access all analyzer functions including result reporting and quality control data.',
    impact: 'Lab result integrity compromised. Attackers could modify test results before transmission to EMR, leading to incorrect diagnoses and treatment. Altered QC data could hide equipment malfunction. False critical values could trigger unnecessary interventions.',
  },
  {
    sarif: {
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'Network Scanner' } },
        results: [{
          ruleId: 'CVE-2024-6789',
          level: 'error',
          message: { text: 'Privilege escalation in Cisco hospital network switch' }
        }]
      }]
    },
    cpe: 'cpe:2.3:h:cisco:catalyst_9300:*:*:*:*:*:*:*:*',
    exploitUri: 'https://github.com/network-exploits/cisco-priv-esc',
    upstreamApi: 'https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-2024-001',
    description: 'Local privilege escalation vulnerability in Cisco Catalyst 9300 switch firmware',
    narrative: 'An authenticated user with low privileges could exploit a logic flaw in the CLI command parser to escalate to administrative privileges. This allows complete control over network switch configuration, VLAN assignments, and port security.',
    impact: 'Hospital network segmentation failure. Compromised network infrastructure could allow lateral movement between clinical and administrative networks. Attackers could access isolated medical device VLANs, intercept patient data, or disrupt critical network services including PACS, EMR, and pharmacy systems.',
  },
];


async function clearDatabase() {
  console.log('🗑️  Clearing database...');

  // Delete in order of dependencies (child tables first)
  await prisma.vulnerability.deleteMany();
  await prisma.assetSettings.deleteMany();
  await prisma.asset.deleteMany();
  // Don't delete users - we'll handle the seed user separately

  console.log('✅ Database cleared');
}

async function createOrGetSeedUser() {
  console.log('\n👤 Creating/finding seed user...');

  // Check if seed user already exists
  let user = await prisma.user.findUnique({
    where: { email: SEED_USER.email },
  });

  if (user) {
    console.log(`✅ Seed user already exists: ${SEED_USER.email}`);
    return user;
  }

  // Create new seed user with hashed password
  const hashedPassword = await hashPassword(SEED_USER.password);

  user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: SEED_USER.email,
      name: SEED_USER.name,
      emailVerified: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: SEED_USER.email,
          providerId: 'credential',
          password: hashedPassword,
        },
      },
    },
  });

  console.log(`✅ Created seed user: ${SEED_USER.email}`);
  return user;
}

async function seedAssets(userId: string) {
  console.log('\n🌱 Seeding assets...');

  const assets = await Promise.all(
    SAMPLE_ASSETS.map((asset) =>
      prisma.asset.create({
        data: {
          ...asset,
          userId,
        },
      })
    )
  );

  console.log(`✅ Seeded ${assets.length} assets`);
  return assets;
}

async function seedVulnerabilities(userId: string) {
  console.log('\n🌱 Seeding vulnerabilities...');

  const vulnerabilities = await Promise.all(
    SAMPLE_VULNERABILITIES.map((vulnerability) =>
      prisma.vulnerability.create({
        data: {
          ...vulnerability,
          userId,
        },
      })
    )
  );

  console.log(`✅ Seeded ${vulnerabilities.length} vulnerabilities`);
  return vulnerabilities;
}

async function main() {
  console.log('🌱 Starting database seed...\n');

  try {
    // Optional: Clear database before seeding
    const shouldClear = process.env.SEED_CLEAR_DB === 'true';
    if (shouldClear) {
      await clearDatabase();
    }

    // Create or get seed user
    const user = await createOrGetSeedUser();

    // Seed data
    await seedAssets(user.id);
    await seedVulnerabilities(user.id);

    // Future seeds will go here:
    // await seedRemediations(user.id);

    console.log('\n✅ Database seeding completed successfully!');
    console.log(`\n📧 Login with: ${SEED_USER.email} / ${SEED_USER.password}`);
  } catch (error) {
    console.error('\n❌ Error during database seeding:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
