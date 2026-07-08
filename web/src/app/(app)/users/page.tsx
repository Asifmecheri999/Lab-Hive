import { auth } from "@/auth";
import { UsersModule } from "@/components/erp/users-module";

export default async function Page() {
  const s = await auth();
  return <UsersModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
