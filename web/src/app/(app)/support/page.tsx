import { auth } from "@/auth";
import { SupportForm } from "@/components/support-form";

export default async function Page() {
  const session = await auth();
  const name = session?.user?.name ?? "";
  const email = session?.user?.email ?? "";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-[#0A1628]">Report an issue</h1>
      <p className="mt-1 text-sm text-gray-500">
        Hit a bug or something not working the way you expected? Send it to our team as a complaint — we read every one and reply by email.
      </p>
      <SupportForm name={name} email={email} />
    </div>
  );
}
