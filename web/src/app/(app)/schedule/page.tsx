import { auth } from "@/auth";
import { ScheduleModule } from "@/components/erp/schedule-module";

export default async function Page() {
  const s = await auth();
  return <ScheduleModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
