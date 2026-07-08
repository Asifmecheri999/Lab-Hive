import { auth } from "@/auth";
import { MaintenanceModule } from "@/components/erp/maintenance-module";

export default async function Page() {
  const s = await auth();
  return <MaintenanceModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
