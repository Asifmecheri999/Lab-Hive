import { auth } from "@/auth";
import { FacilitiesModule } from "@/components/erp/facilities-module";

export default async function Page() {
  const s = await auth();
  return <FacilitiesModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
