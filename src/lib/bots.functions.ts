import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applicationInput, applicationIdInput, installationInput } from "./bots.schemas";

export const getDeveloperPortal = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: apps, error } = await context.supabase.from("bot_applications").select("*").eq("owner_id", context.userId).order("created_at", { ascending: false });
  if (error) throw new Error("Uygulamalar yüklenemedi");
  const { data: servers, error: serverError } = await context.supabase.from("servers").select("id,name").eq("owner_id", context.userId);
  if (serverError) throw new Error("Sunucular yüklenemedi");
  const ids = (apps ?? []).map(a => a.id);
  const { data: installations, error: installError } = ids.length ? await context.supabase.from("bot_installations").select("*").in("application_id", ids) : { data: [], error: null };
  if (installError) throw new Error("Bot sunucuları yüklenemedi");
  return { apps: apps ?? [], servers: servers ?? [], installations: installations ?? [] };
});

export const createBotApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => applicationInput.parse(input)).handler(async ({ data, context }) => {
  const { data: profile } = await context.supabase.from("profiles").select("id").eq("id", context.userId).single();
  if (!profile) throw new Error("Önce SweeCord profilini oluştur");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: app, error } = await supabaseAdmin.from("bot_applications").insert({ ...data, owner_id: context.userId }).select("*").single();
  if (error || !app) throw new Error("Uygulama oluşturulamadı");
  return app;
});

export const updateBotApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => applicationInput.merge(applicationIdInput).parse(input)).handler(async ({ data, context }) => {
  const { data: app } = await context.supabase.from("bot_applications").select("id").eq("id", data.applicationId).eq("owner_id", context.userId).single();
  if (!app) throw new Error("Bu uygulamayı yönetemezsin");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("bot_applications").update({ name: data.name, description: data.description }).eq("id", app.id);
  if (error) throw new Error("Uygulama kaydedilemedi");
  return { ok: true };
});

export const resetBotToken = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => applicationIdInput.parse(input)).handler(async ({ data, context }) => {
  const { data: app } = await context.supabase.from("bot_applications").select("id").eq("id", data.applicationId).eq("owner_id", context.userId).single();
  if (!app) throw new Error("Bu uygulamayı yönetemezsin");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = "swc_bot_" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const token_hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("bot_credentials").upsert({ application_id: app.id, token_hash, updated_at: new Date().toISOString() });
  if (error) throw new Error("Anahtar oluşturulamadı");
  return { token };
});

export const installBot = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => installationInput.parse(input)).handler(async ({ data, context }) => {
  const { data: app } = await context.supabase.from("bot_applications").select("id").eq("id", data.applicationId).eq("owner_id", context.userId).single();
  const { data: server } = await context.supabase.from("servers").select("id").eq("id", data.serverId).eq("owner_id", context.userId).single();
  if (!app || !server) throw new Error("Yalnızca kendi botunu sahip olduğun sunucuya ekleyebilirsin");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("bot_installations").upsert({ application_id: app.id, server_id: server.id, installed_by: context.userId, can_send: data.canSend });
  if (error) throw new Error("Bot sunucuya eklenemedi");
  return { ok: true };
});

export const removeBotInstallation = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => installationInput.omit({ canSend: true }).parse(input)).handler(async ({ data, context }) => {
  const { data: app } = await context.supabase.from("bot_applications").select("id").eq("id", data.applicationId).eq("owner_id", context.userId).single();
  const { data: server } = await context.supabase.from("servers").select("id").eq("id", data.serverId).eq("owner_id", context.userId).single();
  if (!app && !server) throw new Error("Bu botu kaldıramazsın");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("bot_installations").delete().eq("application_id", data.applicationId).eq("server_id", data.serverId);
  if (error) throw new Error("Bot kaldırılamadı");
  return { ok: true };
});

export const deleteBotApplication = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => applicationIdInput.parse(input)).handler(async ({ data, context }) => {
  const { data: app } = await context.supabase.from("bot_applications").select("id").eq("id", data.applicationId).eq("owner_id", context.userId).single();
  if (!app) throw new Error("Bu uygulamayı yönetemezsin");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("bot_applications").delete().eq("id", app.id);
  if (error) throw new Error("Uygulama silinemedi");
  return { ok: true };
});