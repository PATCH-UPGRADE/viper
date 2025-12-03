export const BASE_URL = 'http://localhost:3000/api/v1';

export const AUTH_TOKEN = `Bearer ${process.env.API_KEY}`;

export const generateCPE = (suffix: string) => `cpe:2.3:o:vendor:product:${suffix}`;

// Global object to store IDs of created resources for chaining tests
export const TestState: { 
  assetId?: string; 
  vulnerabilityId?: string; 
  remediationId?: string; 
  emulatorId?: string; 
} = {};

describe('Configuration Tests', () => {
  it('dummy test', async () => {

    expect(true).toBeTruthy();
  });
});
