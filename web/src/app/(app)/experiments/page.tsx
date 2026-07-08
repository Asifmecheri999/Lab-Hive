import { auth } from "@/auth";
import { ExperimentsModule } from "@/components/erp/experiments-module";

export default async function Page() {
  const s = await auth();
  return <ExperimentsModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
