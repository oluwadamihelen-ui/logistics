import { Badge, Card, CardHeader, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton, Field, ModalForm } from "@/components/client/form";
import { requirePortalPage } from "@/lib/platform/portal";
import { portalAddTeamMemberAction, portalToggleTeamMemberAction } from "../actions";

export default async function PortalTeam() {
  const ctx = await requirePortalPage("portal.team.manage");
  const users = await ctx.db.user.findMany({ where: { customerId: ctx.customerId }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Team" subtitle="People in your organisation who can book and track shipments" actions={<ModalForm trigger="Add team member" title="Add team member" action={portalAddTeamMemberAction}><Field name="name" label="Name" required /><Field name="email" label="Email" type="email" required /><Field name="password" label="Temporary password" type="password" minLength={10} required /></ModalForm>} />
      <Card><Table><THead><TH>Name</TH><TH>Email</TH><TH>Status</TH><TH>{""}</TH></THead><TBody>{users.map((u) => <TR key={u.id}><TD className="font-medium">{u.name}</TD><TD>{u.email}</TD><TD><Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Disabled"}</Badge></TD><TD className="text-right">{u.id !== ctx.user.id && <ActionButton small variant="ghost" label={u.isActive ? "Disable" : "Enable"} action={portalToggleTeamMemberAction} args={{ id: u.id, isActive: !u.isActive }} />}</TD></TR>)}</TBody></Table></Card>
    </>
  );
}
