import { auth } from "@/auth";
import { VendorsPanel } from "@/components/erp/procurement-module";

export default async function Page() {
  const s = await auth();
  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-[#0A1628]">Vendors</h1>
      <VendorsPanel token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />
    </div>
  );
}
