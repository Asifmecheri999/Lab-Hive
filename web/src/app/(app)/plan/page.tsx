import { auth } from "@/auth";

export default async function Page() {
  const s = await auth();
  const plan = s?.user?.plan ?? "";
  const label = plan ? `${plan.charAt(0).toUpperCase()}${plan.slice(1).toLowerCase()}` : "—";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-[#0A1628]">Plan details</h1>
      <p className="mt-1 text-sm text-gray-500">Your current LabSynch subscription.</p>

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="bg-[#0A1628] px-6 py-5 text-white">
          <p className="text-xs uppercase tracking-wider text-gray-400">Current plan</p>
          <p className="mt-1 text-2xl font-bold">You are on the {label} plan.</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600">All LabSynch modules are included on your plan — inventory, scheduling, requests, procurement, maintenance, the document hub and the assistant. To change plan or discuss limits, contact your administrator.</p>
        </div>
      </div>
    </div>
  );
}
