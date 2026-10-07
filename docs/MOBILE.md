# Driver / rider mobile app

The driver experience is a mobile-first section of the main web app (`/driver`): same authentication, same tenant-aware APIs, same server. The **Capacitor shell** in `mobile/` is a thin native wrapper that loads the deployed app via `CAPACITOR_SERVER_URL` — there is no duplicate codebase and no second login system.

## What works in the web app (and therefore in the shell)

Login · today's tasks (pickups/deliveries, priority sorted) · accept task · call / SMS / navigate (provider-aware deep links) · mark picked up · start delivery · proof of delivery (recipient name, camera photo, finger signature, OTP, GPS, COD amount — each required or not per company settings) · failed delivery with reason + reschedule · report issue · SOS (alerts dispatch with location) · earnings estimate and settlement statements · notifications · online/offline availability · foreground GPS sharing.

## Offline-aware workflow

`src/lib/driver/offline-queue.ts`: every status change / proof / failure is written to an IndexedDB outbox **first**, then sent. If the network is down it stays queued and the UI shows "Pending sync"; it flushes on reconnect and every 30 s, in order. Each item has a client-generated `clientEventId` that the server treats as an idempotency key, so a retry after an ambiguous failure can never double-apply (proof of delivery, attempt count, COD, timeline all protected — see `tests/shipments.test.ts` "idempotent on replay"). Updates that the server rejects permanently (e.g. validation) are shown to the driver instead of being dropped silently.

Offline cold start: `public/sw.js` (registered by the driver layout in production builds) caches `/_next/static` assets and the last successfully loaded `/driver` pages (network-first), so the app opens without connectivity and shows the last-loaded tasks; the outbox keeps queueing actions. Caches are cleared on sign-out. Pages never opened while online show an offline notice.

## Build the native app

Requirements: Node 22, Android Studio (Android) / Xcode on macOS (iOS).

```cmd
cd mobile
npm install
set CAPACITOR_SERVER_URL=https://app.yourdomain.com/driver
set CAPACITOR_APP_ID=com.yourcompany.driver
npx cap add android
npx cap sync
npx cap open android
```

Android permissions to add in `AndroidManifest.xml`: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `CAMERA`, `POST_NOTIFICATIONS`. iOS `Info.plist`: location (always/when-in-use), camera usage strings, and the *Location updates* background mode.

## Background GPS

`src/components/client/driver/native-bridge.tsx` detects the `@capacitor-community/background-geolocation` plugin at runtime and posts positions (every ≥15 s, ≥25 m) to `POST /api/driver/location` using the same session cookie. In a plain browser the foreground `GpsReporter` is used instead. Positions appear on the live operations map with their real "last update" time.

## Push notifications

Server: set `FCM_SERVICE_ACCOUNT_JSON` (Firebase service-account key as JSON or base64). The PUSH channel then sends to every device registered by the user via FCM HTTP v1 and removes tokens FCM reports as unregistered. Client: inside the Capacitor shell `PushRegistrar` asks permission, registers with `@capacitor/push-notifications`, and posts the token to `POST /api/push/register` (bound to the signed-in user; deleted on sign-out). Tapping a notification opens its `actionUrl`. Add `google-services.json` (Android) / the APNs key in Firebase (iOS) when building the shell. Without credentials, deliveries are recorded as `SKIPPED`.

## Release checklist

Serve the app over HTTPS only · set `NEXTAUTH_URL` to the public origin · verify camera/GPS permission prompts on real devices · test airplane-mode delivery completion · sign the release build (keystore / Apple certificates) · publish via Play Console / App Store Connect.
