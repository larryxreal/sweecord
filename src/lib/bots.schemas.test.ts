import { describe, it as test } from "node:test";
import { strictEqual } from "node:assert";
import { applicationInput, botMessageInput, botTokenPattern, installationInput } from "./bots.schemas";

const id = "11111111-1111-4111-8111-111111111111";
const expect = (value: boolean) => ({ toBe: (expected: boolean) => strictEqual(value, expected) });
describe("bot API input rules", () => {
  test("accepts 2000 characters but rejects 2001", () => {
    expect(botMessageInput.safeParse({ channel_id: id, content: "a".repeat(2000) }).success).toBe(true);
    expect(botMessageInput.safeParse({ channel_id: id, content: "a".repeat(2001) }).success).toBe(false);
  });
  test("rejects blank messages after trimming", () => {
    expect(botMessageInput.safeParse({ channel_id: id, content: "  \n " }).success).toBe(false);
  });
  test("requires a UUID channel rather than an invite code", () => {
    expect(botMessageInput.safeParse({ channel_id: "invite-code", content: "Merhaba" }).success).toBe(false);
  });
  test("requires explicit installation send permission", () => {
    expect(installationInput.safeParse({ applicationId: id, serverId: id }).success).toBe(false);
    expect(installationInput.parse({ applicationId: id, serverId: id, canSend: false }).canSend).toBe(false);
  });
  test("application names must contain 2 to 40 trimmed characters", () => {
    expect(applicationInput.safeParse({ name: " a ", description: "" }).success).toBe(false);
    expect(applicationInput.safeParse({ name: "a".repeat(41), description: "" }).success).toBe(false);
    expect(applicationInput.safeParse({ name: "Bot", description: "" }).success).toBe(true);
  });
  test("bot tokens require the issued prefix and 64 hexadecimal characters", () => {
    expect(botTokenPattern.test("swc_bot_" + "a".repeat(64))).toBe(true);
    expect(botTokenPattern.test("swc_bot_" + "a".repeat(63))).toBe(false);
    expect(botTokenPattern.test("Bearer " + "a".repeat(64))).toBe(false);
  });
});