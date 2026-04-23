# Roles Edge Cases

- User grants a role permissions they don't hold (privilege escalation)
- User assigns a role that is above their own highest role
- Role deletion with active members assigned to it
- Channel deny bit vs role allow bit — deny must win
- Permission check for server owner must always return all-granted
- Role at position 0 (everyone) should not be deletable
- Concurrent role assignments racing on position
