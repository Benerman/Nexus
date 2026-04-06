# iOS Code Signing

Set up iOS code signing for Capacitor builds.

## Prerequisites

- Apple Developer Program membership ($99/year)
- Xcode installed on Mac
- `gh` CLI authenticated

## Step 1: Distribution Certificate

1. Xcode → Settings → Accounts → Select Apple ID/team
2. Manage Certificates → **+** → Apple Distribution
3. Keychain Access → My Certificates → Right-click certificate → Export as `.p12`
4. Set a password
5. Base64 encode:

```bash
base64 -i certificate.p12 | tr -d '\n' | pbcopy
```

## Step 2: App ID

1. [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles
2. Identifiers → **+** → App IDs → App
3. Set Bundle ID to match `client/capacitor.config.ts` (typically `com.nexus.app`)
4. Enable required capabilities (Push Notifications, etc.)

## Step 3: Provisioning Profile

1. Profiles → **+** → Ad Hoc
2. Select your App ID
3. Select the distribution certificate
4. Add device UDIDs for testing (Ad Hoc limited to 100 devices/year)
5. Download the `.mobileprovision` file
6. Base64 encode:

```bash
base64 -i file.mobileprovision | tr -d '\n' | pbcopy
```

## Step 4: Find Team ID

Go to [developer.apple.com](https://developer.apple.com) → Membership. The Team ID is a 10-character alphanumeric string.

## Step 5: Add GitHub Secrets

```bash
gh secret set IOS_CERTIFICATE_BASE64
gh secret set IOS_CERTIFICATE_PASSWORD
gh secret set IOS_PROVISION_PROFILE_BASE64
gh secret set APPLE_TEAM_ID
```

## Step 6: Trigger Build

```bash
gh workflow run release.yml
```

The iOS job uses the signing credentials to produce a signed `.ipa` file.

## Notes

- Ad Hoc profiles are limited to 100 registered devices per year
- Certificates expire after 1 year — regenerate and update GitHub secrets
- The CI workflow cleans up the temporary keychain after export

## Related

- [Capacitor Mobile](capacitor-mobile.md) — iOS/Android builds
