/**
 * Startup configuration checks for production. Critical problems stop the server from starting (better than running
 * insecurely); the rest are logged once so they show up in the host's logs.
 */
export interface EnvReport { errors: string[]; warnings: string[] }

const PLACEHOLDER = /change[-_ ]?me|example|secret|password|changeme|your[-_ ]?/i;

export function checkEnv(env: Record<string, string | undefined> = process.env, production = env.NODE_ENV === "production"): EnvReport {
  const errors: string[] = [], warnings: string[] = [];
  if (!env.DATABASE_URL) errors.push("DATABASE_URL is not set.");
  const secret = env.NEXTAUTH_SECRET ?? "";
  if (!secret) errors.push("NEXTAUTH_SECRET is not set.");
  else if (secret.length < 32 || PLACEHOLDER.test(secret)) errors.push("NEXTAUTH_SECRET is too short or still a placeholder (use 32+ random characters).");
  const url = env.NEXTAUTH_URL ?? "";
  if (!url) (env.VERCEL ? warnings : errors).push("NEXTAUTH_URL is not set (set it to your public https:// address; links in emails and payment callbacks use it).");
  else if (production && !/^https:\/\//.test(url)) errors.push("NEXTAUTH_URL must be an https:// address in production.");
  if (production) {
    if (!env.CRON_SECRET) warnings.push("CRON_SECRET is not set: scheduled maintenance (trial/renewal/expiry jobs) is disabled.");
    else if (env.CRON_SECRET.length < 24) warnings.push("CRON_SECRET is short; use 24+ random characters.");
    if (!env.TWO_FACTOR_KEY) warnings.push("TWO_FACTOR_KEY is not set: 2FA secrets are encrypted with NEXTAUTH_SECRET, so rotating it will reset everyone's 2FA.");
    if (!env.PAYSTACK_SECRET_KEY) warnings.push("PAYSTACK_SECRET_KEY is not set: subscription checkout is disabled.");
    if (!env.EMAIL_PROVIDER_KEY || !env.EMAIL_FROM) warnings.push("Email is not configured: password-reset and email notifications will not be sent.");
    if ((env.STORAGE_PROVIDER ?? "disk") === "disk" && (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME)) warnings.push("STORAGE_PROVIDER=disk on a serverless host: uploaded documents will not persist. Use STORAGE_PROVIDER=s3.");
    if (!env.NEXT_PUBLIC_SUPPORT_EMAIL || /example\./.test(env.NEXT_PUBLIC_SUPPORT_EMAIL)) warnings.push("NEXT_PUBLIC_SUPPORT_EMAIL is still the placeholder; it appears on public pages and legal pages.");
    if (env.SEED_PASSWORD) warnings.push("SEED_PASSWORD is set in production: remove it unless you are deliberately seeding.");
  }
  return { errors, warnings };
}

export function assertEnv() {
  const production = process.env.NODE_ENV === "production";
  const { errors, warnings } = checkEnv(process.env, production);
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length && production) {
    for (const e of errors) console.error(`[config] ${e}`);
    throw new Error(`Invalid production configuration:\n- ${errors.join("\n- ")}`);
  }
  for (const e of errors) console.warn(`[config] ${e}`);
}
