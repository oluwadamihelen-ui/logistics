import { Card, CardHeader, PageHeader } from "@/components/ui";
import { CheckboxField, Field, Form } from "@/components/client/form";
import { prisma } from "@/lib/platform/db";
import { setAnnouncementAction, setSignupsAction } from "../actions";

export default async function PlatformSettings() {
  const s = new Map((await prisma.platformSetting.findMany()).map((x) => [x.key, x.value]));
  return (
    <>
      <PageHeader title="Platform settings" subtitle="Provider credentials (Paystack, AI, SMS, email, maps) are server environment variables and are never shown here." />
      <div className="grid max-w-3xl gap-4">
        <Card><CardHeader title="Registration" /><div className="p-5"><Form action={setSignupsAction} submitLabel="Save"><CheckboxField name="signupsEnabled" label="Allow new companies to register" defaultChecked={s.get("signupsEnabled") !== false} /></Form></div></Card>
        <Card><CardHeader title="Announcement banner" subtitle="Shown on the login page. Leave blank to hide." /><div className="p-5"><Form action={setAnnouncementAction} submitLabel="Save"><Field name="announcement" label="Message" defaultValue={String(s.get("announcement") ?? "")} maxLength={300} /></Form></div></Card>
      </div>
    </>
  );
}
