# Roles Feature Context

Roles are the permission system backbone. Changes here affect every privileged action in the entire application. The permission resolver in `utils.js` is called by nearly every handler.

The biggest risk area: privilege escalation. A user must never be able to gain permissions or assign roles that exceed their own. The role position hierarchy enforces this — you can only manage roles below your highest role.

Channel-level overrides add complexity: the same user may have `send_messages` allowed by role but denied by a channel override. The resolver must handle all three layers correctly.
