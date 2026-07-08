import { auth } from "@/auth";
import { ActivitiesModule } from "@/components/erp/activities-module";

export default async function Page() {
  const s = await auth();
  return <ActivitiesModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
