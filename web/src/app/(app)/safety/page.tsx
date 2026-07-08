import { auth } from "@/auth";
import { SafetyModule } from "@/components/erp/safety-module";

export default async function Page() {
  const s = await auth();
  return <SafetyModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
