import { PRIVACY_SECTIONS, POLICY_UPDATED } from "@/lib/privacy-policy";

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl pb-10">
      <h1 className="text-2xl font-bold text-[#0A1628]">Privacy Policy</h1>
      <p className="mt-1 text-sm text-gray-500">How LabSynch collects, uses and protects your data. Last updated {POLICY_UPDATED}.</p>

      <div className="mt-6 space-y-5 rounded-2xl bg-white p-6 text-sm leading-relaxed text-gray-600 shadow-sm ring-1 ring-black/5">
        <p>
          LabSynch is a lab-operations platform. This policy explains what we collect, how we use it, and the choices you
          have. It applies to everyone who uses a LabSynch workspace.
        </p>

        {PRIVACY_SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="text-sm font-semibold text-[#0A1628]">{s.h}</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {s.body.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
