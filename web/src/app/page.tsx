import Link from "next/link";

const GITHUB = "https://github.com/Asifmecheri999/Lab-Hive";

const NAV = [
  { label: "Modules", href: "#modules" },
  { label: "Open source", href: "#open" },
];

const STATS = [
  { n: "6", l: "Labs managed" },
  { n: "400+", l: "Students & staff" },
  { n: "Real-time", l: "Schedule updates" },
];

const MODULES = [
  { icon: "📦", title: "Inventory & Assets", desc: "Full asset register with photos, compliance, maintenance, calibration and documents." },
  { icon: "🏛️", title: "Facilities", desc: "Lab furniture, fixtures, HVAC and floor plans per laboratory." },
  { icon: "🧪", title: "Experiments", desc: "Experiment definitions with required equipment, consumables and documents." },
  { icon: "🗓️", title: "Scheduling", desc: "Weekly timetable and semester plan with clash detection and free-slot visibility." },
  { icon: "🛠️", title: "Service Requests", desc: "3D print, laser cut, CNC — submit, approve, and track to completion." },
  { icon: "🦺", title: "Safety", desc: "Risk assessments, SOPs, PPE requests and incident reporting." },
  { icon: "🧾", title: "Procurement", desc: "CAPEX/OPEX requests with quotes, invoices and an approval chain." },
  { icon: "📊", title: "CAPEX / OPEX", desc: "Budget planning with committed vs delivered spend at a glance." },
  { icon: "🏢", title: "Vendors", desc: "Approved supplier register with contacts and quote history." },
  { icon: "🔧", title: "Maintenance", desc: "Service logs and recurring schedules with overdue alerts." },
  { icon: "📚", title: "Documents", desc: "Searchable SOPs, manuals, forms and policies — version controlled." },
  { icon: "🤖", title: "AI Assistant", desc: "Ask in plain English — instant answers and links from your own lab data." },
];

const LABS = [
  { name: "Electronics Lab", meta: "Capacity 24 · 8 stations · Building A, Floor 2", status: "Free until 13:00", tone: "free", art: "from-[#0d2436] to-[#0A1628]" },
  { name: "Mechanical Lab", meta: "Capacity 20 · CNC, 3D printers · Building B, Floor 1", status: "In session until 15:00", tone: "busy", art: "from-[#2a1c08] to-[#0A1628]" },
  { name: "AI & Computing Lab", meta: "Capacity 30 · GPU workstations · Building C, Floor 3", status: "Free all day", tone: "free", art: "from-[#1a1230] to-[#0A1628]" },
];

const AGENT_FEATURES = [
  { icon: "🔗", title: "Smart link routing", desc: "Finds the exact form or page you need and sends the direct link." },
  { icon: "📦", title: "Live inventory answers", desc: "Check equipment availability and consumable stock in real time." },
  { icon: "🗓️", title: "Schedule lookups", desc: "Knows which labs are free, who's teaching, and when your session is." },
  { icon: "📄", title: "Document retrieval", desc: "Finds and links the right SOP, risk assessment, or manual instantly." },
];

const OPEN_FACTS = [
  { k: "Cost", v: "$0 — free, nothing held back" },
  { k: "License", v: "MIT — use it, change it, ship it" },
  { k: "Your data", v: "Self-host and it stays in your account" },
  { k: "Built for", v: "Research, teaching & engineering labs" },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "LabSynch",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Free, open-source lab management — inventory, scheduling, safety, service requests, procurement, maintenance, documents and an AI assistant, in one portal for research and university labs.",
  url: "https://labsynch.com",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free and open source" },
  license: "https://opensource.org/licenses/MIT",
  publisher: { "@type": "Organization", name: "LabSynch", url: "https://labsynch.com" },
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0A1628]/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-lg font-bold">
            <span className="h-2.5 w-2.5 rounded-full bg-[#00C9A7]" />
            <span>Lab<span className="text-[#00C9A7]">Synch</span></span>
          </div>
          <nav className="flex items-center gap-5">
            {NAV.map((n) => (
              <Link key={n.label} href={n.href} className="hidden text-sm text-gray-300 transition hover:text-white md:block">{n.label}</Link>
            ))}
            <a href={GITHUB} className="hidden text-sm text-gray-300 transition hover:text-white md:block">GitHub ↗</a>
            <Link href="/login" className="hidden text-sm font-semibold text-gray-300 transition hover:text-white sm:block">Sign in</Link>
            <Link href="/contact" className="rounded-lg bg-[#00C9A7] px-4 py-2 text-sm font-semibold text-[#0A1628] transition hover:brightness-95">Get free access</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#00C9A7]/15 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-10 h-[28rem] w-[28rem] rounded-full bg-[#00C9A7]/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1800px] items-center gap-12 px-6 py-20 lg:grid-cols-2">
          {/* Left copy */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#00C9A7]/30 bg-[#00C9A7]/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-[#00C9A7]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00C9A7]" /> Free · open source · lab operations
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.1] sm:text-6xl">
              One portal for<br />every <span className="bg-gradient-to-r from-[#00C9A7] to-[#5eead4] bg-clip-text text-transparent">lab operation</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-gray-300">
              Inventory, scheduling, safety, resource planning and an AI assistant — all in one place for students, faculty and lab staff. Free to use, and open source.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-xl bg-[#00C9A7] px-7 py-3.5 text-sm font-semibold text-[#0A1628] shadow-lg shadow-[#00C9A7]/20 transition hover:brightness-95">✦ Get free access</Link>
              <a href={GITHUB} className="rounded-xl border border-white/20 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10">★ View on GitHub</a>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00C9A7]" /> Free &amp; open source · MIT licensed · self-host or use the instance I run
            </p>
            <div className="mt-14 grid max-w-md grid-cols-3 gap-6">
              {STATS.map((s) => (
                <div key={s.l}>
                  <div className="text-2xl font-bold text-white">{s.n}</div>
                  <div className="mt-1 text-xs text-gray-400">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right visual */}
          <div className="relative hidden h-[26rem] lg:block">
            <div className="absolute inset-0 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent" />
            <svg viewBox="0 0 400 320" className="absolute inset-0 h-full w-full opacity-70">
              <g stroke="#00C9A7" strokeOpacity="0.35" strokeWidth="1.5" fill="none">
                <path d="M70 180 L160 90 L300 70" />
                <path d="M70 180 L150 230 L300 250" />
                <path d="M160 90 L300 250" />
                <path d="M300 70 L300 250" />
              </g>
              <g fill="#00C9A7">
                <circle cx="70" cy="180" r="6" />
                <circle cx="160" cy="90" r="6" />
                <circle cx="150" cy="230" r="6" />
                <circle cx="300" cy="70" r="7" />
                <circle cx="300" cy="250" r="7" />
              </g>
            </svg>
            <div className="absolute left-6 top-28 w-44 rounded-xl border border-[#F5A623]/40 bg-[#0A1628]/90 p-3 shadow-xl">
              <div className="text-xs font-semibold text-white">EE201 Session</div>
              <div className="mt-1 text-[10px] text-gray-400">Mon · 09:00–10:30 · Dr. A. Mansour · Gr A</div>
              <span className="mt-2 inline-block rounded bg-[#F5A623]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#F5A623]">SCHEDULED</span>
            </div>
            <div className="absolute right-5 top-16 w-44 rounded-xl border border-[#00C9A7]/40 bg-[#0A1628]/90 p-3 shadow-xl">
              <div className="text-xs font-semibold text-white">Centrifuge A3</div>
              <div className="mt-1 text-[10px] text-gray-400">Lab B · Available now</div>
              <span className="mt-2 inline-block rounded bg-[#00C9A7]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[#00C9A7]">✓ AVAILABLE</span>
            </div>
            <div className="absolute bottom-8 right-12 w-44 rounded-xl border border-white/15 bg-[#0A1628]/90 p-3 shadow-xl">
              <div className="text-xs font-semibold text-white">3 low-stock items</div>
              <div className="mt-1 text-[10px] text-gray-400">Nitrile gloves · PCB blanks · Ethanol 70%</div>
            </div>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="bg-gray-50 py-20 text-[#0A1628]">
        <div className="mx-auto max-w-[1800px] px-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#00C9A7]">Platform modules</p>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Everything the lab needs</h2>
          <p className="mt-3 max-w-xl text-gray-500">Twelve integrated modules that replace scattered spreadsheets, emails, and paper forms.</p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div key={m.title} className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-[#00C9A7]/40 hover:shadow-xl">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0A1628]/5 text-xl transition group-hover:bg-[#00C9A7]/15">{m.icon}</div>
                <h3 className="mt-4 text-lg font-semibold">{m.title}</h3>
                <p className="mt-1.5 text-sm text-gray-600">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lab availability */}
      <section className="bg-white py-20 text-[#0A1628]">
        <div className="mx-auto max-w-[1800px] px-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#00C9A7]">Lab availability</p>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Check your lab right now</h2>
          <p className="mt-3 max-w-xl text-gray-500">Live status for every lab — who's in, when they're free, what equipment is available.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {LABS.map((lab) => (
              <div key={lab.name} className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm transition hover:shadow-lg">
                <div className={`flex h-36 items-center justify-center bg-gradient-to-br ${lab.art} text-sm font-medium text-white/60`}>{lab.name}</div>
                <div className="p-5">
                  <h3 className="font-semibold">{lab.name}</h3>
                  <p className="mt-1 text-xs text-gray-500">{lab.meta}</p>
                  <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${lab.tone === "free" ? "bg-[#00C9A7]/10 text-[#0a8d75]" : "bg-[#F5A623]/10 text-[#b9760a]"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${lab.tone === "free" ? "bg-[#00C9A7]" : "bg-[#F5A623]"}`} />{lab.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI agent */}
      <section className="bg-[#0A1628] py-20">
        <div className="mx-auto grid max-w-[1800px] items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#00C9A7]">AI agent</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Ask the lab anything</h2>
            <p className="mt-3 max-w-md text-gray-300">The LabSynch agent is connected to live inventory, schedules, documents and forms. Ask in plain English — it routes you to the right place instantly.</p>
            <div className="mt-8 space-y-3">
              {AGENT_FEATURES.map((f) => (
                <div key={f.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#00C9A7]/15 text-base">{f.icon}</div>
                  <div>
                    <div className="text-sm font-semibold text-white">{f.title}</div>
                    <div className="mt-0.5 text-xs text-gray-400">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat mockup */}
          <div className="rounded-3xl border border-white/10 bg-[#0d1c2e] p-5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00C9A7] text-sm font-bold text-[#0A1628]">L</div>
              <div>
                <div className="text-sm font-semibold text-white">LabSynch Assistant</div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#00C9A7]"><span className="h-1.5 w-1.5 rounded-full bg-[#00C9A7]" />Online</div>
              </div>
            </div>
            <div className="space-y-3 py-4 text-sm">
              <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm bg-[#00C9A7]/15 px-4 py-2 text-gray-100">Is the centrifuge available in Lab B right now?</div>
              <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-white/5 px-4 py-2 text-gray-200">
                Yes — Centrifuge A3 in Lab B is available right now. Lab B has no session until 13:00 today. You can book it here:
                <span className="mt-2 block w-fit rounded-lg bg-[#00C9A7]/15 px-3 py-1 text-xs font-semibold text-[#00C9A7]">→ Book Centrifuge A3</span>
              </div>
              <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm bg-[#00C9A7]/15 px-4 py-2 text-gray-100">I need the risk assessment for the laser cutter</div>
              <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-white/5 px-4 py-2 text-gray-200">
                Found it. RA-LC-2024 is the current approved version for the CO₂ laser cutter in Mechanical Lab.
                <span className="mt-2 block w-fit rounded-lg bg-[#00C9A7]/15 px-3 py-1 text-xs font-semibold text-[#00C9A7]">→ Download risk assessment</span>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-white/5 pt-4">
              <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-500">Ask about labs, inventory, schedules…</div>
              <Link href="/login" className="rounded-lg bg-[#00C9A7] px-4 py-2 text-xs font-semibold text-[#0A1628]">Ask</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Open source + maker */}
      <section id="open" className="bg-gray-50 py-20 text-[#0A1628]">
        <div className="mx-auto grid max-w-[1800px] items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-[#00C9A7]">Free &amp; open source</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Built by a lab engineer. Free for every lab.</h2>
            <p className="mt-4 max-w-xl text-lg text-gray-600">
              For over a decade I&apos;ve managed and run engineering laboratories. I got tired of holding it all together with a SharePoint page and a dozen spreadsheets — so I built LabSynch to make the work easier. It did. So I&apos;m sharing it, free.
            </p>
            <p className="mt-3 max-w-xl text-gray-500">No pricing, no sales call, no lock-in. Get access and use the instance I host, or take the code and run your own.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className="rounded-xl bg-[#00C9A7] px-7 py-3.5 text-sm font-semibold text-[#0A1628] transition hover:brightness-95">Get free access →</Link>
              <a href={GITHUB} className="rounded-xl border border-[#0A1628]/15 px-7 py-3.5 text-sm font-semibold text-[#0A1628] transition hover:bg-[#0A1628]/5">★ Get the code on GitHub</a>
            </div>
          </div>
          <div className="grid overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm sm:grid-cols-2">
            {OPEN_FACTS.map((f, i) => (
              <div key={f.k} className={`p-5 ${i % 2 === 0 ? "sm:border-r" : ""} ${i < 2 ? "border-b" : ""} border-gray-100`}>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#00C9A7]">{f.k}</div>
                <div className="mt-1 text-sm font-semibold text-[#0A1628]">{f.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1800px] px-6 py-20">
        <div className="rounded-3xl bg-gradient-to-r from-[#00C9A7] to-[#5eead4] px-8 py-12 text-center text-[#0A1628]">
          <h2 className="text-2xl font-bold sm:text-3xl">Free, open, and yours to run.</h2>
          <p className="mt-2 text-[#0A1628]/70">Get access to the instance I host, or take the code on GitHub — no pricing, no lock-in.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="inline-block rounded-xl bg-[#0A1628] px-7 py-3.5 text-sm font-semibold text-white transition hover:brightness-110">Get free access</Link>
            <a href={GITHUB} className="inline-block rounded-xl border border-[#0A1628]/25 px-7 py-3.5 text-sm font-semibold text-[#0A1628] transition hover:bg-[#0A1628]/5">★ View on GitHub</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-sm text-gray-500">
        <p className="mx-auto max-w-2xl px-6 text-xs leading-relaxed">
          LabSynch is free and provided <b className="text-gray-400">as-is</b>, with no warranty. It&apos;s a tool one person built and shares to help other labs — expect the occasional rough edge, and please keep your own backups of anything important. Found a bug or have an idea? Email <a href="mailto:info@labsynch.com" className="text-gray-400 hover:text-white">info@labsynch.com</a> — I read every message.
        </p>
        <p className="mt-4">LabSynch · Free &amp; open source (MIT) · <a href={GITHUB} className="text-gray-400 hover:text-white">GitHub</a> · Built by someone who has run engineering &amp; research labs for over a decade</p>
      </footer>
    </div>
  );
}
