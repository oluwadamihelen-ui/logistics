import { NotConfigured, PageHeader } from "@/components/ui";
import { LiveMapLoader } from "@/components/client/live-map-loader";
import { requirePageContext } from "@/lib/platform/context";
import { getEntitlements } from "@/lib/platform/entitlements";
import { getMapProvider } from "@/lib/platform/maps";

export const metadata = { title: "Live map" };

export default async function MapPage() {
  const ctx = await requirePageContext("map.view");
  const ent = await getEntitlements(ctx.companyId);
  const provider = getMapProvider();
  return (
    <>
      <PageHeader title="Live operations map" subtitle={`Driver positions come from the driver app's GPS · map provider: ${provider.label}`} />
      {!ent.features.has("live_map") ? <NotConfigured title="Live map is not on your plan" description="Upgrade to Professional or above to see driver positions live." />
        : !provider.embeddedMap ? <NotConfigured title="Embedded map not available for this provider" description={`${provider.label} is used for navigation links only in this build. Set MAPS_PROVIDER=osm or mapbox.`} />
        : !provider.configured ? <NotConfigured title="Map provider not configured" description="Set MAPS_PROVIDER_KEY for the selected provider." steps={["Add MAPS_PROVIDER and MAPS_PROVIDER_KEY to your environment", "Restart the server"]} />
        : <LiveMapLoader attribution={provider.attribution} />}
    </>
  );
}
