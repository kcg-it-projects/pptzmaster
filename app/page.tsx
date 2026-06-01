import { listMasters } from "@/lib/masters";
import Hub from "./components/Hub";

export const dynamic = "force-dynamic";

export default async function Page() {
  const masters = await listMasters();
  return <Hub masters={masters} />;
}
