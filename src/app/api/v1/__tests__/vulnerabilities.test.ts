import request from 'supertest';
import { BASE_URL, AUTH_TOKEN, generateCPE, TestState } from './test-config';

describe('Vulnerabilities Endpoint (/vulnerabilities)', () => {
  const authHeader = { Authorization: AUTH_TOKEN };

  const payload = {
    sarif: { tool: { driver: { name: "TestScanner" } } },
    cpe: generateCPE('vuln_v1'),
    exploitUri: 'https://exploit-db.com/1234',
    upstreamApi: 'https://nvd.nist.gov/api',
    description: 'Buffer overflow in device X',
    narrative: 'Found during routine scan.',
    impact: 'High',
  };

  it('POST /vulnerabilities - Without auth, should get a 401', async () => {
    const res = await request(BASE_URL)
      .post('/vulnerabilities')
      .send(payload);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /vulnerabilities - Without auth, should get a 401', async () => {
    const res = await request(BASE_URL)
      .get('/vulnerabilities');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('POST /vulnerabilities - Should create a new vulnerability', async () => {
    const res = await request(BASE_URL)
      .post('/vulnerabilities')
      .set(authHeader)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    TestState.vulnerabilityId = res.body.id; // Store ID
  });

  it('GET /vulnerabilities/{id} - Should retrieve the vulnerability', async () => {
    expect(TestState.vulnerabilityId).toBeDefined();

    const res = await request(BASE_URL)
      .get(`/vulnerabilities/${TestState.vulnerabilityId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TestState.vulnerabilityId);
  });

  it('GET /vulnerabilities/{id} - Without auth, should 401', async () => {
    expect(TestState.vulnerabilityId).toBeDefined();

    const res = await request(BASE_URL)
      .get(`/vulnerabilities/${TestState.vulnerabilityId}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('DELETE /vulnerabilities/{id} - Should delete the vulnerability (Cleanup)', async () => {
    expect(TestState.vulnerabilityId).toBeDefined();

    const res = await request(BASE_URL)
      .delete(`/vulnerabilities/${TestState.vulnerabilityId}`)
      .set(authHeader);

    expect(res.status).toBe(200);
    TestState.vulnerabilityId = undefined; // Clear state
  });
});
