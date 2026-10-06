import { redirect } from "next/navigation";
import { currentUserOrNull } from "@/lib/platform/context";
import { prisma } from "@/lib/platform/db";
import { homeFor } from "@/lib/platform/home";

export const dynamic = "force-dynamic";

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
