import { useSocialStore } from "../store/social/socialStore";
import { useChatStore } from "../store/chat/chatStore";
import { useNetworkStore } from "../store/session/networkStore";

type Identity = { id: string; token: string; name: string };
type Response = {
  request_id?: string;
  ok?: boolean;
  data?: Record<string, unknown>;
  message?: string;
};
let connection: WebSocket | null = null;
let identityKey = "";
let sequence = 0;
let initialized = false;
const pending = new Map<
  string,
  {
    resolve: (value: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

const readIdentity = (): Identity | null => {
  try {
    const value = JSON.parse(localStorage.getItem(identityKey) ?? "null");
    return typeof value?.id === "string" &&
      typeof value?.token === "string" &&
      value.token.length === 64
      ? value
      : null;
  } catch {
    return null;
  }
};
const saveIdentity = (value: Identity) => {
  try {
    localStorage.setItem(identityKey, JSON.stringify(value));
  } catch {
    /* Private browsing may keep this profile only for this page. */
  }
};
let pageIdentity: Identity | null = null;

/** One request owner with bounded pending work. Closing a socket rejects every
 * pending command immediately; old replies cannot resolve a replacement session. */
export function setSocialConnection(next: WebSocket | null) {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error("The game connection closed."));
  }
  pending.clear();
  connection = next;
  initialized = false;
  pageIdentity = null;
  identityKey = "";
  useSocialStore.getState().reset();
  useChatStore.getState().reset();
}
export function requestSocial(
  action: string,
  fields: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const socket = connection;
  if (!socket || socket.readyState !== WebSocket.OPEN)
    return Promise.reject(new Error("Connect to the game server first."));
  if (pending.size >= 8)
    return Promise.reject(new Error("Wait for the current request to finish."));
  const request_id = `social-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(request_id);
      reject(
        new Error("The server did not respond. Refresh before trying again."),
      );
    }, 12000);
    pending.set(request_id, { resolve, reject, timer });
    try {
      socket.send(
        JSON.stringify({
          type: "social_request",
          ...fields,
          action,
          request_id,
        }),
      );
    } catch {
      clearTimeout(timer);
      pending.delete(request_id);
      reject(new Error("Could not send the request."));
    }
  });
}
export function receiveSocialResult(value: Response) {
  if (typeof value.request_id !== "string") return;
  const request = pending.get(value.request_id);
  if (!request) return;
  pending.delete(value.request_id);
  clearTimeout(request.timer);
  if (value.ok === true) request.resolve(value.data ?? {});
  else
    request.reject(
      new Error(value.message || "The server rejected the request."),
    );
}
export async function identifySocial(name?: string, newProfile = false) {
  const identity = pageIdentity ?? readIdentity();
  const result = await requestSocial("identify", {
    ...(identity && !newProfile ? { token: identity.token } : {}),
    name: name ?? identity?.name ?? "DRIVER",
  });
  const token =
    typeof result.token === "string" ? result.token : identity?.token;
  if (typeof result.profile_id === "string" && token) {
    pageIdentity = {
      id: result.profile_id,
      token,
      name: name ?? identity?.name ?? "DRIVER",
    };
    saveIdentity(pageIdentity);
  }
}
export function beginSocialSession(serverId: unknown) {
  if (initialized || typeof serverId !== "string") return;
  initialized = true;
  identityKey = `avenlab-social-profile-v1:${serverId}`;
  useSocialStore.setState({
    available: true,
    message: "Restoring your player profile…",
  });
  void identifySocial().catch((error) =>
    useSocialStore.setState({ message: (error as Error).message }),
  );
}
export function receiveSocialState(value: unknown) {
  useSocialStore.getState().receive(value);
  const view = useSocialStore.getState().view;
  useChatStore.getState().membership(view?.profile.id ?? null, view?.current_world_id ?? null,
    view?.alpha?.active?.team ?? useNetworkStore.getState().team);
  const profile = useSocialStore.getState().view?.profile;
  const identity = pageIdentity ?? readIdentity();
  if (
    profile &&
    identity &&
    profile.id === identity.id &&
    profile.name !== identity.name
  ) {
    pageIdentity = { ...identity, name: profile.name };
    saveIdentity(pageIdentity);
  }
}
