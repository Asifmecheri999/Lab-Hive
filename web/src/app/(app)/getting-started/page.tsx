import { auth } from "@/auth";
import { GettingStarted } from "@/components/getting-started";

export default async function Page() {
  const s = await auth();
  return <GettingStarted token={s?.apiToken ?? ""} />;
}
