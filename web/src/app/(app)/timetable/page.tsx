import { auth } from "@/auth";
import { TimetableModule } from "@/components/erp/timetable-module";

export default async function Page() {
  const s = await auth();
  return <TimetableModule token={s?.apiToken ?? ""} role={s?.user?.role ?? ""} />;
}
