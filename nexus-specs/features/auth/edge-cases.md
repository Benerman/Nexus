# Auth Edge Cases

- **Race condition on registration:** Two requests with the same username arrive simultaneously. DB unique constraint is the safety net — one must fail with 409.
- **JWT with deleted user:** User is deleted after token is issued. Server must check user still exists on `server:join`.
- **Empty JWT_SECRET:** Config must fail fast in production. Dev mode may allow a weak default.
- **Rate limit bypass:** Rate limit is per IP — behind a NAT or proxy, all users share one IP. Document this limitation.
- **Very long inputs:** Username, email, password, displayName — all must be bounded and validated before DB insertion.
- **SQL injection via username/email:** All inputs must be parameterized — never string-interpolated into queries.
- **bcrypt timing attack:** All password comparisons must use constant-time comparison (`bcrypt.compare`), even when the user doesn't exist (to prevent user enumeration via timing).
