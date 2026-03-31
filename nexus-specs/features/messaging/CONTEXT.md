# Messaging Feature Context

Messaging is the core feature of Nexus. Changes here affect the most active code path and carry the highest XSS/injection risk due to user-generated content being rendered in the browser.

The message content pipeline: user input → server validation/sanitization → stored in DB → emitted to channel room via Socket.IO → rendered in ChatArea.js. XSS vectors can exist at any step.

Reactions are stored as JSONB, which means reaction updates require careful read-modify-write or atomic JSONB operations to avoid race conditions.

Attachments are base64 uploaded via REST and stored as files. There is no virus scanning.
