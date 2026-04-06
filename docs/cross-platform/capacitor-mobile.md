# Capacitor Mobile (iOS & Android)

Nexus supports iOS and Android via Capacitor.

## Development

Mobile builds are produced via CI workflows. The Capacitor configuration lives in `client/capacitor.config.ts`.

## iOS

iOS builds require:
- Apple Developer Program membership
- Xcode on macOS
- Proper code signing setup

See [iOS Signing](ios-signing.md) for the complete signing setup guide.

## Android

Android builds are produced as APKs via the CI workflow.

## Server URL Configuration

`client/src/config.js` handles server URL resolution for Capacitor environments, detecting the platform and adjusting the connection URL accordingly.

## Related

- [Web](web.md) — Web client
- [iOS Signing](ios-signing.md) — iOS code signing setup
