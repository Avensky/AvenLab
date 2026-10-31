import { requestSocial } from "./socialClient";
import { useChatStore, type ChatChannel } from "../store/chat/chatStore";

function context(channel: ChatChannel) {
  const state = useChatStore.getState();
  if (!state.profile) throw Error("Connect your player profile to use chat.");
  const key = channel === "lobby" ? "lobby" : state.teamContext;
  if (!key) throw Error("Join a world before using Team chat.");
  return { profile: state.profile, key };
}
export async function loadChatHistory(channel: ChatChannel) {
  const before = context(channel);
  const result = await requestSocial("chat_history", { channel });
  const state = useChatStore.getState();
  if (
    state.profile === before.profile &&
    (channel === "lobby" || state.teamContext === before.key) &&
    result.context === before.key &&
    Array.isArray(result.messages)
  )
    state.mergeHistory(before.key, result.messages);
}
export async function sendChat(channel: ChatChannel, text: string) {
  const before = context(channel);
  const result = await requestSocial("chat_send", { channel, text });
  const state = useChatStore.getState();
  if (
    state.profile === before.profile &&
    (channel === "lobby" || state.teamContext === before.key)
  )
    state.receive(result.message);
}
