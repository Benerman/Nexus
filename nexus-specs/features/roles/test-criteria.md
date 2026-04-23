# Roles Test Criteria

- [ ] Role create requires Manage Roles permission
- [ ] Role update cannot grant permissions the updater doesn't hold
- [ ] Role assign requires assigner's highest role to be above target role
- [ ] Server owner passes all permission checks regardless of roles
- [ ] Channel deny overrides role allow for same permission
- [ ] `getUserPerms` correctly unions permissions from multiple roles
- [ ] Role delete cascades to remove member assignments
- [ ] Everyone role cannot be deleted
