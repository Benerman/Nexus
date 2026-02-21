const { ApiClient } = require('../helpers/api-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';
const api = new ApiClient(SERVER_URL);

describe('Health Endpoints', () => {
  test('GET /api/health returns { status: ok, name: Nexus }', async () => {
    const { status, body } = await api.health();
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', name: 'Nexus' });
  });

  test('GET /health returns { status: ok }', async () => {
    const { status, body } = await api.healthSimple();
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  test('Health endpoint responds within 500ms', async () => {
    const start = Date.now();
    const { status } = await api.health();
    const elapsed = Date.now() - start;
    expect(status).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });
});
