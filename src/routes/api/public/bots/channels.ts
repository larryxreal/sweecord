import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/bots/channels")({
  server: { handlers: { GET: async ({ request }) => {
    const { handleBotRequest } = await import("@/lib/bots.server");
    return handleBotRequest(request, "channels");
  } } },
});