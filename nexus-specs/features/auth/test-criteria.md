# Auth Test Criteria

- [ ] Registration with valid inputs creates user and returns JWT
- [ ] Registration with duplicate username returns 409
- [ ] Registration with duplicate email returns 409
- [ ] Registration with short password (< 8 chars) returns 400
- [ ] Login with valid credentials returns JWT
- [ ] Login with wrong password returns 401 (not 403, not 404)
- [ ] Login error message is identical for bad username and bad password (no enumeration)
- [ ] Login rate limiter triggers after 5 attempts from same IP within 15 minutes
- [ ] Socket.IO connection with invalid JWT is rejected
- [ ] Socket.IO connection with expired JWT is rejected
- [ ] Password change requires current password to match
- [ ] Password change with weak new password is rejected
- [ ] Input validation rejects username > 32 chars
- [ ] Input validation rejects SQL injection attempts in username/email
