# Authentication Tests

## TC-001: Register new account with valid credentials

**Preconditions:** No existing account with the test username

**Steps:**
1. Navigate to the login/register page
2. Click "Register" or switch to the registration form
3. Enter a valid username (3-32 chars, alphanumeric)
4. Enter a valid password (8+ chars)
5. Submit the registration form

**Expected Result:**
- Account is created successfully
- User is redirected to the main app / server list
- Auth token is stored in localStorage
- User avatar and color are randomly assigned

---

## TC-002: Reject registration with short password (<8 chars)

**Preconditions:** None

**Steps:**
1. Navigate to the registration form
2. Enter a valid username
3. Enter a password with fewer than 8 characters (e.g., "short")
4. Submit the form

**Expected Result:**
- Registration is rejected
- Error message is displayed indicating password requirements
- No account is created

---

## TC-003: Login with correct credentials

**Preconditions:** An account with known username and password exists

**Steps:**
1. Navigate to the login page
2. Enter the correct username
3. Enter the correct password
4. Submit the login form

**Expected Result:**
- Login is successful
- User is redirected to the main app
- Auth token is stored in localStorage
- User info (avatar, color, username) is loaded

---

## TC-004: Reject login with wrong password

**Preconditions:** An account with known username exists

**Steps:**
1. Navigate to the login page
2. Enter the correct username
3. Enter an incorrect password
4. Submit the form

**Expected Result:**
- Login is rejected
- Error message "Invalid credentials" is displayed
- No token is stored

---

## TC-005: Session persists across page refresh (token in localStorage)

**Preconditions:** User is logged in

**Steps:**
1. Verify user is logged in and on the main app
2. Refresh the page (F5 or Ctrl+R)
3. Wait for the app to reload

**Expected Result:**
- User remains logged in after refresh
- Token in localStorage is used to re-authenticate
- User's servers, channels, and messages are reloaded
- No login prompt is shown
