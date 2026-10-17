import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/bots/messages")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleBotRequest } = await import("@/lib/bots.server");
    return handleBotRequest(request, "message");
  } } },
});