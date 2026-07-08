import { auth } from "@/auth";
import { PageHeader } from "@/lib/ui";
import { AgentChat } from "@/components/agent-chat";

export default async function AgentPage() {
  const session = await auth();
  return (
    <div>
      <PageHeader title="AI Assistant" subtitle="Ask about inventory, schedules, documents and forms" />
      <AgentChat token={session?.apiToken ?? ""} />
    </div>
  );
}
