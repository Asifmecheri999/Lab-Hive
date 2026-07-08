import { auth } from "@/auth";
import { ProcurementModule } from "@/components/erp/procurement-module";

export default async function Page() {
  const s = await auth();
  return <ProcurementModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} email={s?.user?.email ?? ""} />;
}
