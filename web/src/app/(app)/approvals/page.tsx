import { auth } from "@/auth";
import { ApprovalsModule } from "@/components/erp/approvals-module";

export default async function Page() {
  const s = await auth();
  return <ApprovalsModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} email={s?.user?.email ?? ""} />;
}
