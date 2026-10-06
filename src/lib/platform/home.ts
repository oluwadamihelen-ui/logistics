import type { Role } from "@prisma/client";

/** Landing route per role. */
export function homeFor(role: Role, onboarded = true): string {
  switch (role) {
    case "PLATFORM_SUPER_ADMIN": return "/platform";
    case "DRIVER": case "RIDER": return "/driver";
    case "CUSTOMER": case "SENDER": case "RECIPIENT": return "/portal";
    case "COMPANY_OWNER": case "COMPANY_ADMIN": return onboarded ? "/dashboard" : "/onboarding";
    default: return "/dashboard";
  }
}
