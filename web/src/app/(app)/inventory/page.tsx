import { auth } from "@/auth";
import { InventoryModule } from "@/components/erp/inventory-module";

export default async function Page() {
  const s = await auth();
  return <InventoryModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
