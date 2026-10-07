import { redirect } from "next/navigation";
import { currentUserOrNull } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { homeFor } from "@/lib/platform/home";

export const dynamic = "force-dynamic";

/** Post-login landing: sends each signed-in user to their role's home (the public landing page lives at "/"). */
export default async function Home() {
  const user = await currentUserOrNull();
  if (!user) redirect("/login");
  let onboarded = true;
  if (user.companyId && (user.role === "COMPANY_OWNER" || user.role === "COMPANY_ADMIN")) {
    const c = await prisma.company.findUnique({ where: { id: user.companyId }, select: { onboardedAt: true } });
    onboarded = !!c?.onboardedAt;
  }
  redirect(homeFor(user.role, onboarded));
}
