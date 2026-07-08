import { Suspense } from "react";
import { auth } from "@/auth";
import { RequestsModule } from "@/components/erp/requests-module";

export default async function Page() {
  const s = await auth();
  return (
    <Suspense fallback={null}>
      <RequestsModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />
    </Suspense>
  );
}
