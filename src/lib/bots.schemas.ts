import { z } from "zod";

export const applicationInput = z.object({ name: z.string().trim().min(2).max(40), description: z.string().trim().max(500) });
export const applicationIdInput = z.object({ applicationId: z.string().uuid() });
export const installationInput = applicationIdInput.extend({ serverId: z.string().uuid(), canSend: z.boolean() });
export const botMessageInput = z.object({ channel_id: z.string().uuid(), content: z.string().trim().min(1).max(2000) });
export const botTokenPattern = /^swc_bot_[a-f0-9]{64}$/;