import Link from "next/link";
import { Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { Field, FieldGrid, ModalForm, SelectField } from "@/components/client/form";
import { requirePageContext } from "@/lib/platform/context";
import { ROLE_LABELS } from "@/lib/platform/permissions";
import { saveStaffProfileAction } from "./actions";
import { dateOnly, titleCase } from "@/lib/utils/format";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const ctx = await requirePageContext("staff.view");
  const users = await ctx.db.user.findMany({ where: { role: { notIn: ["CUSTOMER", "SENDER", "RECIPIENT"] } }, orderBy: { name: "asc" }, include: { staffProfile: true, branch: { select: { name: true } } } });
  const manage = ctx.can("staff.manage");
  return (
    <>
      <PageHeader title="Staff" subtitle="Employee records. Roles and permissions are managed in Settings." actions={ctx.can("users.manage") && <Link href="/settings?tab=team" className="btn-secondary">Manage logins & roles</Link>} />
      <Card><Table><THead><TH>Name</TH><TH>Role</TH><TH>Department</TH><TH>Branch</TH><TH>Employment</TH><TH>Hired</TH><TH>Emergency contact</TH><TH>{""}</TH></THead><TBody>
        {users.map((u) => { const p = u.staffProfile; return <TR key={u.id}><TD><span className="font-medium">{u.name}</span><div className="text-xs text-slate-500">{u.email} {u.phone && `· ${u.phone}`}</div></TD><TD>{ROLE_LABELS[u.role]}{p?.jobTitle && <div className="text-xs text-slate-500">{p.jobTitle}</div>}</TD><TD>{p?.department ?? "—"}</TD><TD>{u.branch?.name ?? "All"}</TD><TD><Badge tone={!u.isActive || p?.employmentStatus === "TERMINATED" ? "neutral" : p?.employmentStatus === "ON_LEAVE" ? "warning" : "success"}>{titleCase(!u.isActive ? "INACTIVE" : p?.employmentStatus ?? "ACTIVE")}</Badge></TD><TD className="text-xs">{dateOnly(p?.hireDate)}</TD><TD className="text-xs">{p?.emergencyName ? `${p.emergencyName} · ${p.emergencyPhone ?? ""}` : "—"}</TD>
          <TD className="text-right">{manage && <ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title={`Staff record — ${u.name}`} action={saveStaffProfileAction} extra={{ userId: u.id }}>
            <FieldGrid><Field name="jobTitle" label="Job title" defaultValue={p?.jobTitle ?? ""} /><Field name="department" label="Department" defaultValue={p?.department ?? ""} /><Field name="phone" label="Phone" defaultValue={u.phone ?? ""} /><Field name="hireDate" label="Hire date" type="date" defaultValue={p?.hireDate?.toISOString().slice(0, 10)} /></FieldGrid>
            <SelectField name="employmentStatus" label="Employment status" defaultValue={p?.employmentStatus ?? "ACTIVE"} options={["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"].map((s) => ({ value: s, label: titleCase(s) }))} /><FieldGrid><Field name="emergencyName" label="Emergency contact" defaultValue={p?.emergencyName ?? ""} /><Field name="emergencyPhone" label="Emergency phone" defaultValue={p?.emergencyPhone ?? ""} /></FieldGrid></ModalForm>}</TD></TR>; })}</TBody></Table></Card>
    </>
  );
}
