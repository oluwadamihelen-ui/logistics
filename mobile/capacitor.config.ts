import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell loads the REAL production web app (same server, same auth, same tenant-aware APIs) —
 * there is no second backend and no second login system.
 *
 *   Windows CMD:   set CAPACITOR_SERVER_URL=https://app.yourdomain.com/driver
 *                  npx cap sync
 */
const url = process.env.CAPACITOR_SERVER_URL;
if (!url) throw new Error("Set CAPACITOR_SERVER_URL to your deployed app, e.g. https://app.example.com/driver");

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID ?? "com.example.driver",
  appName: process.env.CAPACITOR_APP_NAME ?? "Driver",
  webDir: "www",
  server: { url, cleartext: url.startsWith("http://"), allowNavigation: [new URL(url).host] },
  android: { allowMixedContent: false },
  plugins: { PushNotifications: { presentationOptions: ["badge", "sound", "alert"] } },
};
export default config;
