import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  created_at: string;
};

export type Server = {
  id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
};

export type Channel = {
  id: string;
  server_id: string;
  category_id: string | null;
  name: string;
  position: number;
  type: string;
  everyone_view: boolean;
  everyone_send: boolean;
  everyone_connect: boolean;
  everyone_attach: boolean;
  created_at: string;
};

export type ChannelCategory = {
  id: string;
  server_id: string;
  name: string;
  position: number;
};

export type ChannelRolePerm = {
  id: string;
  channel_id: string;
  role_id: string;
  can_view: boolean;
  can_send: boolean;
  can_connect: boolean;
  can_attach: boolean;
};

export type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  audio_url: string | null;
  image_url?: string | null;
  created_at: string;
};

export type DirectMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  audio_url: string | null;
  image_url?: string | null;
  created_at: string;
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Upload to the private media bucket and return a long-lived signed URL. */
export async function uploadMedia(path: string, file: Blob): Promise<string> {
  const { error } = await supabase.storage.from("media").upload(path, file, {
    upsert: true,
    ...(file.type ? { contentType: file.type } : {}),
  });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr || !data) throw signErr ?? new Error("Bağlantı oluşturulamadı");
  return data.signedUrl;
}

export async function uploadServerImage(serverId: string, kind: "icon" | "banner", file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Sadece PNG, JPG, WEBP veya GIF");
  if (file.size > 8 * 1024 * 1024) throw new Error("Dosya en fazla 8 MB olabilir");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  return uploadMedia(`servers/${serverId}/${kind}-${Date.now()}.${ext}`, file);
}

export async function uploadVoice(userId: string, blob: Blob): Promise<string> {
  const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
  return uploadMedia(`voice/${userId}/${Date.now()}.${ext}`, blob);
}

export async function uploadChatImage(userId: string, file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Sadece PNG, JPG, WEBP veya GIF");
  if (file.size > 8 * 1024 * 1024) throw new Error("Dosya en fazla 8 MB olabilir");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  return uploadMedia(`images/${userId}/${Date.now()}.${ext}`, file);
}

export function initials(name: string): string {
  const clean = (name || "?").trim();
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

export function slugifyUsername(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 24);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Bugün ${time}` : `${d.toLocaleDateString("tr-TR")} ${time}`;
}

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, TEN_YEARS);
  if (signErr || !data) throw signErr ?? new Error("Bağlantı oluşturulamadı");
  return data.signedUrl;
}

export type RolePermKey =
  | "manage_server"
  | "manage_roles"
  | "manage_channels"
  | "manage_messages"
  | "kick_members"
  | "create_invite"
  | "connect_voice";

export type ServerRole = {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
} & Record<RolePermKey, boolean>;

export type MyPerms = Record<RolePermKey, boolean> & { isOwner: boolean; topPosition: number | null };

/** Effective server permissions for a user; owner gets everything. */
export function computePerms(isOwner: boolean, mine: ServerRole[]): MyPerms {
  const has = (k: RolePermKey) => isOwner || mine.some((r) => r[k]);
  return {
    isOwner,
    manage_server: has("manage_server"),
    manage_roles: has("manage_roles"),
    manage_channels: has("manage_channels"),
    manage_messages: has("manage_messages"),
    kick_members: has("kick_members"),
    create_invite: has("create_invite"),
    connect_voice: has("connect_voice"),
    topPosition: mine.length ? Math.min(...mine.map((r) => r.position)) : null,
  };
}

/** Mirrors the database channel_access() rule. */
export function channelAllowed(
  c: Channel,
  kind: "view" | "send" | "attach" | "connect",
  perms: MyPerms,
  roleIds: string[],
  overrides: ChannelRolePerm[],
): boolean {
  if (perms.manage_channels) return true;
  const ev = c.everyone_view;
  const everyone =
    kind === "send" ? ev && c.everyone_send
    : kind === "attach" ? ev && c.everyone_send && c.everyone_attach
    : kind === "connect" ? ev && c.everyone_connect
    : ev;
  if (everyone) return true;
  const mine = overrides.filter((p) => p.channel_id === c.id && roleIds.includes(p.role_id));
  const role = mine.some((p) =>
    kind === "send" ? p.can_view && p.can_send
    : kind === "attach" ? p.can_view && p.can_send && p.can_attach
    : kind === "connect" ? p.can_view && p.can_connect
    : p.can_view,
  );
  if (role) return true;
  return kind === "connect" && perms.connect_voice && channelAllowed(c, "view", perms, roleIds, overrides);
}

export type ServerMember = {
  user_id: string;
  role: string;
  role_ids: string[];
  profiles: Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "status">;
};
