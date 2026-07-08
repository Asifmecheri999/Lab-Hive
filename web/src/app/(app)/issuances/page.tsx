import { auth } from "@/auth";
import { IssuancesModule } from "@/components/erp/issuances-module";

export default async function Page() {
  const s = await auth();
  return <IssuancesModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
