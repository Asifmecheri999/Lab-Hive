import { auth } from "@/auth";
import { AnalyticsModule } from "@/components/erp/analytics-module";

export default async function Page() {
  const s = await auth();
  return <AnalyticsModule token={s?.apiToken ?? ""} />;
}
