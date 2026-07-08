// Single source of truth for the privacy-policy text, shown both on the /privacy page
// and in the first-login consent gate. The authoritative version string lives on the API
// (POLICY_VERSION in api/src/routes/auth.ts); this date is just for display.
export const POLICY_UPDATED = "2 July 2026";

export const PRIVACY_SECTIONS: { h: string; body: string[] }[] = [
  {
    h: "1. What we collect",
    body: [
      "Account details: your name, email, role and the organisation (workspace) you belong to.",
      "Operational lab data you and your team enter: inventory and assets, schedules, service and portal requests, procurement, finance, maintenance, activities, issuances, experiments and documents.",
      "Files you upload: PDFs, images, drawings, certificates and similar attachments.",
      "Basic technical data needed to run the service, such as sign-in timestamps and request logs.",
    ],
  },
  {
    h: "2. How we use it",
    body: [
      "To provide the platform: to store, display and manage your lab's operations for the people you invite.",
      "To send service messages: sign-in details, approval and request notifications, and trial reminders.",
      "To secure the service and diagnose problems.",
      "We do not sell your data, and we do not use it for advertising.",
    ],
  },
  {
    h: "3. Where your data is stored",
    body: [
      "Everything runs on Cloudflare infrastructure (database, file storage and compute) used solely to operate LabSynch.",
      "Each organisation's data is isolated to its own workspace (tenant). You only ever see data for your own workspace.",
    ],
  },
  {
    h: "4. Access control",
    body: [
      "Access is role-based — you only see what your role permits, and account management is restricted to administrators.",
      "Uploaded files are stored privately and served through authenticated links, not public URLs.",
    ],
  },
  {
    h: "5. AI assistant",
    body: [
      "By default the assistant answers only from your own workspace data using a built-in engine — no third-party AI is involved.",
      "An administrator may optionally enable \"Smart AI\" by adding their own API key from a supported provider — Anthropic (Claude), OpenAI (ChatGPT) or Google (Gemini). When enabled, the question you ask and the relevant lab data used to answer it are sent to that chosen provider to generate a reply, billed to the admin's own account. Smart AI is off unless an admin turns it on, and can be turned off at any time.",
    ],
  },
  {
    h: "6. Data retention & deletion",
    body: [
      "Your data is kept for as long as your workspace is active.",
      "Administrators can delete records, and can reset or delete the workspace. When a workspace is deleted, its data is removed from the live database.",
      "If a trial ends without conversion, the workspace is paused; contact us to reactivate or to request deletion.",
    ],
  },
  {
    h: "7. Your rights",
    body: [
      "You can request access to, correction of, or deletion of your personal data.",
      "For most requests, start with your workspace administrator; for anything they can't action, contact us directly.",
    ],
  },
  {
    h: "8. Contact",
    body: [
      "Questions or data requests? Email info@labsynch.com, or use \"Report an issue\" in the account menu.",
    ],
  },
];
