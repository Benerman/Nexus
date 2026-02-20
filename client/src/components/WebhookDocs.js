import React from 'react';
import './WebhookDocs.css';

export default function WebhookDocs({ onClose }) {
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="webhook-docs-overlay" onClick={onClose}>
      <div className="webhook-docs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="webhook-docs-header">
          <h2>📚 Webhook Documentation</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="webhook-docs-content">
          {/* Overview */}
          <section>
            <h3>Overview</h3>
            <p>
              Webhooks allow external services to send messages to your channels via HTTP POST requests.
              Each webhook has a unique URL containing a secret token that authenticates the request.
              Accepts Discord-compatible JSON payloads, so existing integrations and bots can work with minimal changes.
            </p>
            <p className="note">
              <strong>Important:</strong> The webhook URL (including the token) is only shown once when the webhook is created.
              Copy it immediately — there is no way to retrieve the token later. If you lose it, delete the webhook and create a new one.
            </p>
          </section>

          {/* Authentication */}
          <section>
            <h3>Authentication</h3>
            <p>
              Webhooks are authenticated via a secret token embedded in the URL path. No additional headers or API keys are needed.
            </p>
            <p>
              <strong>URL format:</strong> <code>{'http://<host>/api/webhooks/<webhookId>/<token>'}</code>
            </p>
            <ul>
              <li><code>webhookId</code> — UUID identifying the webhook</li>
              <li><code>token</code> — 64-character hex string (cryptographically random)</li>
            </ul>
            <p>
              Requests with an invalid or missing token will receive a <code>401 Unauthorized</code> response.
            </p>
          </section>

          {/* Basic Usage */}
          <section>
            <h3>Basic Usage</h3>
            <div className="code-block">
              <div className="code-header">
                <span>HTTP POST Request</span>
                <button onClick={() => copyToClipboard(`curl -X POST "http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"Hello from webhook!"}'`)}>
                  Copy
                </button>
              </div>
              <pre>{`curl -X POST "http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"Hello from webhook!"}'`}</pre>
            </div>
          </section>

          {/* Request Parameters */}
          <section>
            <h3>Request Parameters</h3>
            <table className="params-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>content</code></td>
                  <td>string</td>
                  <td>*</td>
                  <td>Message text (max 2000 chars). Required if no embeds.</td>
                </tr>
                <tr>
                  <td><code>username</code></td>
                  <td>string</td>
                  <td>No</td>
                  <td>Override webhook name (max 32 characters)</td>
                </tr>
                <tr>
                  <td><code>avatar</code></td>
                  <td>string</td>
                  <td>No</td>
                  <td>Bot avatar emoji (default: 🤖)</td>
                </tr>
                <tr>
                  <td><code>avatar_url</code></td>
                  <td>string</td>
                  <td>No</td>
                  <td>Avatar image URL</td>
                </tr>
                <tr>
                  <td><code>embeds</code></td>
                  <td>array</td>
                  <td>*</td>
                  <td>Array of embed objects (max 10)</td>
                </tr>
                <tr>
                  <td><code>tts</code></td>
                  <td>boolean</td>
                  <td>No</td>
                  <td>Text-to-speech flag</td>
                </tr>
                <tr>
                  <td><code>attachments</code></td>
                  <td>array</td>
                  <td>No</td>
                  <td>Array of attachment objects (max 4)</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Attachment Format */}
          <section>
            <h3>Attachment Format</h3>
            <p>Each attachment object should have the following structure:</p>
            <div className="code-block">
              <div className="code-header">
                <span>Attachment Object</span>
                <button onClick={() => copyToClipboard(`{
  "url": "https://example.com/image.png",
  "name": "image.png",
  "type": "image/png"
}`)}>
                  Copy
                </button>
              </div>
              <pre>{`{
  "url": "https://example.com/image.png",    // Image URL or data URL
  "name": "image.png",                        // File name (optional)
  "type": "image/png"                         // MIME type (optional)
}`}</pre>
            </div>
            <p className="note">
              <strong>Note:</strong> URLs must start with <code>http://</code>, <code>https://</code>, or <code>data:</code>
            </p>
          </section>

          {/* Embed Format */}
          <section>
            <h3>Embed Format</h3>
            <p>Embeds render as rich cards below the message content.</p>
            <div className="code-block">
              <div className="code-header">
                <span>Embed Object</span>
                <button onClick={() => copyToClipboard(`{
  "embeds": [{
    "title": "Build Status",
    "description": "All checks passed!",
    "color": 5763719,
    "fields": [
      { "name": "Branch", "value": "main", "inline": true },
      { "name": "Commit", "value": "abc1234", "inline": true }
    ],
    "footer": { "text": "CI Pipeline" },
    "timestamp": "${new Date().toISOString()}"
  }]
}`)}>
                  Copy
                </button>
              </div>
              <pre>{`{
  "embeds": [{
    "title": "Build Status",
    "description": "All checks passed!",
    "color": 5763719,          // Decimal RGB (green)
    "fields": [
      { "name": "Branch", "value": "main", "inline": true },
      { "name": "Commit", "value": "abc1234", "inline": true }
    ],
    "footer": { "text": "CI Pipeline" },
    "thumbnail": { "url": "https://..." },
    "image": { "url": "https://..." },
    "author": { "name": "Bot", "icon_url": "https://..." }
  }]
}`}</pre>
            </div>
            <p className="note">
              <strong>Tip:</strong> Color is a decimal integer. Hex #57F287 = decimal 5763719.
            </p>
          </section>

          {/* Examples */}
          <section>
            <h3>Examples</h3>

            <h4>Simple Text Message</h4>
            <div className="code-block">
              <div className="code-header">
                <span>JSON Payload</span>
                <button onClick={() => copyToClipboard(`{
  "content": "Hello from my bot!"
}`)}>
                  Copy
                </button>
              </div>
              <pre>{`{
  "content": "Hello from my bot!"
}`}</pre>
            </div>

            <h4>Custom Username and Avatar</h4>
            <div className="code-block">
              <div className="code-header">
                <span>JSON Payload</span>
                <button onClick={() => copyToClipboard(`{
  "content": "Server status: Online",
  "username": "Status Bot",
  "avatar": "online"
}`)}>
                  Copy
                </button>
              </div>
              <pre>{`{
  "content": "Server status: Online",
  "username": "Status Bot",
  "avatar": "online"
}`}</pre>
            </div>

            <h4>Message with Single Attachment</h4>
            <div className="code-block">
              <div className="code-header">
                <span>JSON Payload</span>
                <button onClick={() => copyToClipboard(`{
  "content": "Check out this screenshot!",
  "username": "Screenshot Bot",
  "attachments": [
    {
      "url": "https://example.com/screenshot.png",
      "name": "screenshot.png",
      "type": "image/png"
    }
  ]
}`)}>
                  Copy
                </button>
              </div>
              <pre>{`{
  "content": "Check out this screenshot!",
  "username": "Screenshot Bot",
  "attachments": [
    {
      "url": "https://example.com/screenshot.png",
      "name": "screenshot.png",
      "type": "image/png"
    }
  ]
}`}</pre>
            </div>

            <h4>Message with Multiple Attachments</h4>
            <div className="code-block">
              <div className="code-header">
                <span>JSON Payload</span>
                <button onClick={() => copyToClipboard(`{
  "content": "Build completed! Here are the results:",
  "username": "CI/CD Bot",
  "avatar": "bot",
  "attachments": [
    {
      "url": "https://example.com/build-log.png",
      "name": "build-log.png"
    },
    {
      "url": "https://example.com/test-results.png",
      "name": "test-results.png"
    }
  ]
}`)}>
                  Copy
                </button>
              </div>
              <pre>{`{
  "content": "Build completed! Here are the results:",
  "username": "CI/CD Bot",
  "avatar": "bot",
  "attachments": [
    {
      "url": "https://example.com/build-log.png",
      "name": "build-log.png"
    },
    {
      "url": "https://example.com/test-results.png",
      "name": "test-results.png"
    }
  ]
}`}</pre>
            </div>
          </section>

          {/* cURL Examples */}
          <section>
            <h3>cURL Examples</h3>

            <h4>Basic POST</h4>
            <div className="code-block">
              <div className="code-header">
                <span>Bash</span>
                <button onClick={() => copyToClipboard(`curl -X POST "http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"Hello World!"}'`)}>
                  Copy
                </button>
              </div>
              <pre>{`curl -X POST "http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"Hello World!"}'`}</pre>
            </div>

            <h4>With Attachments</h4>
            <div className="code-block">
              <div className="code-header">
                <span>Bash</span>
                <button onClick={() => copyToClipboard(`curl -X POST "http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Daily report",
    "username": "Report Bot",
    "attachments": [
      {
        "url": "https://example.com/report.png",
        "name": "report.png"
      }
    ]
  }'`)}>
                  Copy
                </button>
              </div>
              <pre>{`curl -X POST "http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Daily report",
    "username": "Report Bot",
    "attachments": [
      {
        "url": "https://example.com/report.png",
        "name": "report.png"
      }
    ]
  }'`}</pre>
            </div>
          </section>

          {/* JavaScript/Python Examples */}
          <section>
            <h3>Code Examples</h3>

            <h4>JavaScript (fetch)</h4>
            <div className="code-block">
              <div className="code-header">
                <span>JavaScript</span>
                <button onClick={() => copyToClipboard(`const webhookUrl = 'http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN';

const payload = {
  content: 'Hello from JavaScript!',
  username: 'JS Bot',
  attachments: [
    {
      url: 'https://example.com/image.png',
      name: 'image.png'
    }
  ]
};

fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => console.log('Success:', data))
.catch(err => console.error('Error:', err));`)}>
                  Copy
                </button>
              </div>
              <pre>{`const webhookUrl = 'http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN';

const payload = {
  content: 'Hello from JavaScript!',
  username: 'JS Bot',
  attachments: [
    {
      url: 'https://example.com/image.png',
      name: 'image.png'
    }
  ]
};

fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => console.log('Success:', data))
.catch(err => console.error('Error:', err));`}</pre>
            </div>

            <h4>Python (requests)</h4>
            <div className="code-block">
              <div className="code-header">
                <span>Python</span>
                <button onClick={() => copyToClipboard(`import requests

webhook_url = 'http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN'

payload = {
    'content': 'Hello from Python!',
    'username': 'Python Bot',
    'avatar': '🐍',
    'attachments': [
        {
            'url': 'https://example.com/chart.png',
            'name': 'chart.png'
        }
    ]
}

response = requests.post(webhook_url, json=payload)
print(f'Status: {response.status_code}')
print(f'Response: {response.json()}')`)}>
                  Copy
                </button>
              </div>
              <pre>{`import requests

webhook_url = 'http://localhost:3000/api/webhooks/WEBHOOK_ID/TOKEN'

payload = {
    'content': 'Hello from Python!',
    'username': 'Python Bot',
    'avatar': '🐍',
    'attachments': [
        {
            'url': 'https://example.com/chart.png',
            'name': 'chart.png'
        }
    ]
}

response = requests.post(webhook_url, json=payload)
print(f'Status: {response.status_code}')
print(f'Response: {response.json()}')`}</pre>
            </div>
          </section>

          {/* Response Codes */}
          <section>
            <h3>Response Codes</h3>
            <table className="params-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>200</code></td>
                  <td>OK</td>
                  <td>Message sent successfully</td>
                </tr>
                <tr>
                  <td><code>400</code></td>
                  <td>Bad Request</td>
                  <td>Invalid payload (missing content or invalid format)</td>
                </tr>
                <tr>
                  <td><code>401</code></td>
                  <td>Unauthorized</td>
                  <td>Invalid webhook ID or token</td>
                </tr>
                <tr>
                  <td><code>429</code></td>
                  <td>Too Many Requests</td>
                  <td>Rate limited (10 requests per 10 seconds)</td>
                </tr>
                <tr>
                  <td><code>500</code></td>
                  <td>Server Error</td>
                  <td>Internal server error</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Success Response */}
          <section>
            <h3>Success Response</h3>
            <div className="code-block">
              <pre>{`{
  "id": "message-uuid-here",
  "success": true,
  "username": "MyBot"
}`}</pre>
            </div>
          </section>

          {/* Error Response */}
          <section>
            <h3>Error Response</h3>
            <div className="code-block">
              <pre>{`// Missing content
{
  "error": "content or embeds is required"
}

// Invalid token
{
  "error": "Invalid webhook ID or token"
}`}</pre>
            </div>
          </section>

          {/* Limits */}
          <section>
            <h3>Limits & Restrictions</h3>
            <ul>
              <li><strong>Content:</strong> Maximum 2000 characters</li>
              <li><strong>Username:</strong> Maximum 32 characters (optional)</li>
              <li><strong>Attachments:</strong> Maximum 4 per message</li>
              <li><strong>Embeds:</strong> Maximum 10 per message</li>
              <li><strong>Attachment URLs:</strong> Must start with <code>http://</code>, <code>https://</code>, or <code>data:</code></li>
              <li><strong>Rate Limiting:</strong> 10 requests per 10 seconds</li>
            </ul>
          </section>

          {/* Tips */}
          <section>
            <h3>💬 Mentions & Channel References</h3>
            <p>Webhooks can mention users, roles, and reference channels using inline syntax:</p>
            <ul>
              <li><code>@username</code> — mention a user by their username</li>
              <li><code>@rolename</code> — mention a role (e.g. <code>@Admin</code>)</li>
              <li><code>@everyone</code> — mention everyone in the channel</li>
              <li><code>#channel-name</code> — reference a channel</li>
            </ul>
            <p>Mentions and channel references will be parsed and rendered with the same styling as user-sent messages.</p>
            <div className="code-block">
              <div className="code-header">
                <span>Example with mentions</span>
              </div>
              <pre>{`{
  "content": "Hey @johndoe, check out #general for the latest updates! /cc @Admin"
}`}</pre>
            </div>
          </section>

          <section>
            <h3>💡 Tips</h3>
            <ul>
              <li><strong>Keep your webhook URL secret</strong> — the token in the URL is the only authentication. Anyone with the full URL can post to your channel.</li>
              <li>The token is only shown once at creation time. Copy it immediately or you'll need to create a new webhook.</li>
              <li>Store webhook URLs in environment variables or secrets managers, not in source code.</li>
              <li>Use custom usernames to identify different bots or services.</li>
              <li>Use emojis for avatars to make messages visually distinct.</li>
              <li>Test your webhook with curl before integrating into your application.</li>
              <li>Handle errors gracefully — check for 401 (bad token) and 429 (rate limited) responses.</li>
              <li>Webhooks are persisted to the database and will continue to work after server restarts.</li>
            </ul>
          </section>
        </div>

        <div className="webhook-docs-footer">
          <button className="primary-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
