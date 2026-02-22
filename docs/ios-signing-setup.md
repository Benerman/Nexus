# iOS Signing Setup for Release Workflow

The release workflow already supports signed iOS builds. You just need to generate the credentials and add them as GitHub secrets.

## Prerequisites

- Apple Developer Program membership ($99/year) at https://developer.apple.com
- Xcode installed on your Mac
- `gh` CLI authenticated (`gh auth login`)

## Step 1: Create a Distribution Certificate

1. Open **Xcode → Settings → Accounts**
2. Select your Apple ID → your team
3. Click **Manage Certificates → + → Apple Distribution**
4. Open **Keychain Access** → **My Certificates**
5. Right-click the new "Apple Distribution: ..." certificate → **Export Items...**
6. Save as `.p12`, set a password when prompted (remember this for Step 4)

Base64 encode it:
```bash
base64 -i ~/Desktop/certificate.p12 | tr -d '\n' | pbcopy
# This is now on your clipboard — you'll paste it as a secret
```

## Step 2: Create an App ID

1. Go to https://developer.apple.com → **Certificates, Identifiers & Profiles**
2. **Identifiers → +**
3. Select **App IDs → App**
4. Set Bundle ID to match your Capacitor config (check `client/capacitor.config.ts` or `capacitor.config.json` — likely `com.nexus.app` or similar)
5. Enable any capabilities you need (Push Notifications, etc.)
6. Register

## Step 3: Create a Provisioning Profile

1. Go to **Profiles → +**
2. Select **Ad Hoc** (for direct distribution outside App Store)
3. Select the App ID from Step 2
4. Select the distribution certificate from Step 1
5. Add device UDIDs you want to test on (you can find a device UDID via Finder when the device is connected)
6. Name it (e.g., "Nexus Ad Hoc") and download the `.mobileprovision` file

Base64 encode it:
```bash
base64 -i ~/Downloads/Nexus_Ad_Hoc.mobileprovision | tr -d '\n' | pbcopy
```

## Step 4: Find Your Team ID

Go to https://developer.apple.com → **Membership** (or Account → Membership Details)

Your Team ID is a 10-character alphanumeric string (e.g., `ABC1234DEF`).

## Step 5: Add Secrets to GitHub

Run these from the repo directory (or any directory with `gh` authenticated):

```bash
cd ~/path/to/Nexus

# Paste the base64 certificate when prompted
gh secret set IOS_CERTIFICATE_BASE64

# Type the password you set when exporting the .p12
gh secret set IOS_CERTIFICATE_PASSWORD

# Paste the base64 provisioning profile when prompted
gh secret set IOS_PROVISION_PROFILE_BASE64

# Type your 10-character Team ID
gh secret set APPLE_TEAM_ID
```

## Step 6: Trigger a Release Build

```bash
gh workflow run release.yml
```

The iOS job will now use the signing credentials instead of producing an unsigned zip.

## Verifying

After the build completes, the release should contain a `.ipa` file instead of `Nexus-iOS-unsigned.zip`. You can install the `.ipa` on registered devices via Apple Configurator, Xcode, or an OTA distribution service.

## Notes

- Ad Hoc profiles are limited to 100 registered devices per year
- For wider distribution, consider App Store or Enterprise distribution
- Certificates expire after 1 year — you'll need to regenerate and update the secrets
- The workflow cleans up the temporary keychain after export
