import { auth } from "@/auth";
import { FinanceModule } from "@/components/erp/finance-module";

export default async function Page() {
  const s = await auth();
  return <FinanceModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
