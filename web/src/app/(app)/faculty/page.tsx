import { auth } from "@/auth";
import { FacultyModule } from "@/components/erp/faculty-module";

export default async function Page() {
  const s = await auth();
  return <FacultyModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
