class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';
  }

  async _fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, options);
      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = res.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000 * (attempt + 1);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    }
  }

  async get(path, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return this._fetchWithRetry(`${this.baseUrl}${path}`, { headers });
  }

  async post(path, data, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return this._fetchWithRetry(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
  }

  /**
   * Like post() but WITHOUT rate-limit retry — for tests that expect
   * specific HTTP error codes (400, 401, etc.) as part of validation testing.
   */
  async postRaw(path, data, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }

  async health() {
    return this.get('/api/health');
  }

  async healthSimple() {
    return this.get('/health');
  }

  async register(username, password) {
    return this.post('/api/auth/register', { username, password });
  }

  async login(username, password) {
    return this.post('/api/auth/login', { username, password });
  }

  async logout(token) {
    return this.post('/api/auth/logout', {}, token);
  }

  async uploadAvatar(token, avatar) {
    return this.post('/api/user/avatar', { avatar }, token);
  }

  async uploadServerIcon(token, serverId, icon) {
    return this.post(`/api/server/${serverId}/icon`, { icon }, token);
  }

  async sendWebhook(webhookId, webhookToken, payload) {
    return this.post(`/api/webhooks/${webhookId}/${webhookToken}`, payload);
  }
}

module.exports = { ApiClient };
