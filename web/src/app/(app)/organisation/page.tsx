import { auth } from "@/auth";
import { OrgModule } from "@/components/erp/org-module";

export default async function Page() {
  const s = await auth();
  return <OrgModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
