import { auth } from "@/auth";
import { ModuleView } from "@/components/erp/module-view";

export default async function Page() {
  const s = await auth();
  return <ModuleView resource="docs" token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
