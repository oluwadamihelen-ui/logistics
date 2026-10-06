import { Badge, Card, EmptyState, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "@/components/client/form";
import { DocumentUpload } from "@/components/client/document-upload";
import { requirePageContext } from "@/lib/platform/context";
import { getStorage } from "@/lib/platform/storage";
import { deleteDocumentAction } from "./actions";
import { dateOnly, titleCase } from "@/lib/utils/format";
import { NotConfigured } from "@/components/ui";

export const metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const ctx = await requirePageContext("documents.view");
  const [docs, drivers, vehicles, staff, customers] = await Promise.all([
    ctx.db.document.findMany({ orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }], take: 200 }),
    ctx.db.driver.findMany({ select: { id: true, name: true } }), ctx.db.vehicle.findMany({ select: { id: true, registrationNumber: true } }),
    ctx.db.user.findMany({ where: { role: { notIn: ["CUSTOMER", "SENDER", "RECIPIENT"] } }, select: { id: true, name: true } }), ctx.db.customer.findMany({ select: { id: true, name: true }, take: 300 }),
  ]);
  const names = new Map<string, string>([...drivers.map((d) => [d.id, d.name] as const), ...vehicles.map((v) => [v.id, v.registrationNumber] as const), ...staff.map((s) => [s.id, s.name] as const), ...customers.map((c) => [c.id, c.name] as const)]);
  const manage = ctx.can("documents.manage"), storage = getStorage();
  return (
    <>
      <PageHeader title="Documents" subtitle="Licences, insurance, registrations and contracts — with expiry tracking" actions={manage && storage && <DocumentUpload owners={{ DRIVER: drivers.map((d) => ({ id: d.id, label: d.name })), VEHICLE: vehicles.map((v) => ({ id: v.id, label: v.registrationNumber })), STAFF: staff.map((s) => ({ id: s.id, label: s.name })), CUSTOMER: customers.map((c) => ({ id: c.id, label: c.name })) }} />} />
      {!storage && <div className="mb-4"><NotConfigured title="File storage not configured" description="Set STORAGE_PROVIDER=disk (with a persistent STORAGE_DIR) to enable uploads." /></div>}
      <Card>{!docs.length ? <div className="p-6"><EmptyState title="No documents" description="Upload documents to track expiry dates and get alerts before they lapse." /></div> : <Table><THead><TH>Title</TH><TH>Type</TH><TH>Belongs to</TH><TH>Expiry</TH><TH>Status</TH><TH>{""}</TH></THead><TBody>
        {docs.map((d) => { const days = d.expiryDate ? Math.ceil((d.expiryDate.getTime() - Date.now()) / 86400_000) : null; const st = days === null ? "VALID" : days < 0 ? "EXPIRED" : days <= 30 ? "EXPIRING" : "VALID"; return <TR key={d.id}><TD className="font-medium">{d.title}</TD><TD>{d.type}</TD><TD>{titleCase(d.ownerType)}{d.ownerId && names.get(d.ownerId) ? ` · ${names.get(d.ownerId)}` : ""}</TD><TD className="text-xs">{dateOnly(d.expiryDate)}</TD><TD><Badge tone={st === "EXPIRED" ? "danger" : st === "EXPIRING" ? "warning" : "success"}>{st === "EXPIRING" ? `Expires in ${days}d` : titleCase(st)}</Badge></TD>
          <TD className="whitespace-nowrap text-right">{d.fileUrl && <a className="btn-ghost btn-sm" href={`/api/files/${d.id}`} target="_blank" rel="noreferrer">View</a>}{manage && <ActionButton small variant="ghost" label="Delete" confirm="Delete this document and its file?" action={deleteDocumentAction} args={{ id: d.id }} />}</TD></TR>; })}</TBody></Table>}</Card>
    </>
  );
}
