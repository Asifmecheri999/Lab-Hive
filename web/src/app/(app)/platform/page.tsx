import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PlatformModule } from "@/components/erp/platform-module";

export default async function Page() {
  const s = await auth();
  if (!s?.user?.superAdmin) redirect("/dashboard");
  return <PlatformModule token={s.apiToken ?? ""} />;
}
