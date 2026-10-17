import { z } from "zod";
import { botMessageInput, botTokenPattern } from "./bots.schemas";

class BotApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function authenticateBot(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bot /, "");
  if (!token || !botTokenPattern.test(token)) throw new BotApiError(401, "Invalid bot token");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: credential, error } = await supabaseAdmin.from("bot_credentials").select("application_id").eq("token_hash", hash).maybeSingle();
  if (error) throw new BotApiError(503, "Bot authentication unavailable");
  if (!credential) throw new BotApiError(401, "Invalid bot token");
  const { data: app } = await supabaseAdmin.from("bot_applications").select("id,owner_id").eq("id", credential.application_id).single();
  if (!app) throw new BotApiError(401, "Bot unavailable");
  return { admin: supabaseAdmin, app };
}

export async function handleBotRequest(request: Request, action: "channels" | "message") {
  try {
    const { admin, app } = await authenticateBot(request);
    if (action === "channels") {
      const serverId = z.string().uuid().parse(new URL(request.url).searchParams.get("server_id"));
      const { data: installation } = await admin.from("bot_installations").select("server_id").eq("application_id", app.id).eq("server_id", serverId).single();
      if (!installation) throw new BotApiError(403, "Bot is not installed in this server");
      const { data, error } = await admin.from("channels").select("id,name,type").eq("server_id", serverId).eq("type", "text").eq("everyone_view", true).eq("everyone_send", true).order("position");
      if (error) throw new BotApiError(503, "Channels unavailable");
      return Response.json({ channels: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const raw = await request.text();
    if (raw.length > 12000) throw new BotApiError(413, "Request too large");
    const input = botMessageInput.parse(JSON.parse(raw));
    const { data: channel } = await admin.from("channels").select("server_id,type,everyone_view,everyone_send").eq("id", input.channel_id).single();
    if (!channel) throw new BotApiError(403, "Channel unavailable");
    const { data: installation } = await admin.from("bot_installations").select("can_send").eq("application_id", app.id).eq("server_id", channel.server_id).single();
    if (!installation?.can_send || channel.type !== "text" || !channel.everyone_view || !channel.everyone_send) throw new BotApiError(403, "Bot cannot send to this channel");
    const { data: message, error } = await admin.from("messages").insert({ channel_id: input.channel_id, content: input.content, user_id: app.owner_id, bot_application_id: app.id }).select("id,channel_id,content,bot_application_id,created_at").single();
    if (error) throw new BotApiError(403, "Message could not be sent");
    return Response.json(message, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BotApiError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Invalid input" }, { status: 400 });
    console.error("Bot API failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Bot service unavailable" }, { status: 503 });
  }
}