import { usePresenceStore } from "../store/chat/presenceStore";
import { useSocialStore } from "../store/social/socialStore";
import { useChatStore } from "../store/chat/chatStore";
import { useNetworkStore } from "../store/session/networkStore";

type Identity = { id: string; token: string; name: string };
type IdentityScope = "device" | "tab";
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

// A secondary player belongs to this tab. Never overwrite the device's main
// credential when opening another player for local multiplayer testing.
const readStoredIdentity = (storage: () => Storage, key: string): Identity | null => {
  try {
    const value = JSON.parse(storage().getItem(key) ?? "null");
    return typeof value?.id === "string" && typeof value?.token === "string" && value.token.length === 64
      ? {id:value.id,token:value.token,name:typeof value.name === "string" ? value.name : "DRIVER"}
      : null;
  } catch { return null; }
};
const readIdentity = (): {identity:Identity;scope:IdentityScope} | null => {
  const tab = readStoredIdentity(() => window.sessionStorage, `${identityKey}:tab`);
  if (tab) return {identity:tab,scope:"tab"};
  const device = readStoredIdentity(() => localStorage, identityKey);
  return device ? {identity:device,scope:"device"} : null;
};
const saveIdentity = (value: Identity, scope:IdentityScope) => {
  try {
    if (scope === "tab") window.sessionStorage.setItem(`${identityKey}:tab`, JSON.stringify(value));
    else {
      localStorage.setItem(identityKey, JSON.stringify(value));
      window.sessionStorage.removeItem(`${identityKey}:tab`);
    }
  } catch { /* Restricted storage keeps this profile only for this page. */ }
};
let pageIdentity: Identity | null = null;
let pageIdentityScope:IdentityScope = "device";
let connectionGeneration = 0;
let identifying = false;

/** One request owner with bounded pending work. Closing a socket rejects every
 * pending command immediately; old replies cannot resolve a replacement session. */
export function setSocialConnection(next: WebSocket | null) {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error("The game connection closed."));
  }
  pending.clear();
  connection = next;
  connectionGeneration++;
  identifying = false;
  initialized = false;
  pageIdentity = null;
  identityKey = "";
  useSocialStore.getState().reset();
  useChatStore.getState().reset();
  usePresenceStore.getState().reset();
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
async function identifyProfile(name:string|undefined,newProfile:boolean,tabOnly=false) {
  if (identifying) throw new Error("Wait for player profile restoration to finish.");
  const generation=connectionGeneration;
  const saved=readIdentity(),identity=pageIdentity??saved?.identity;
  const scope:IdentityScope=tabOnly?"tab":newProfile?"device":pageIdentity?pageIdentityScope:saved?.scope??"device";
  identifying=true;
  useSocialStore.setState({profileStatus:"restoring",message:tabOnly?"Creating a player for this tab…":"Restoring your player profile…"});
  try {
    const result=await requestSocial("identify",{
      ...(identity&&!newProfile?{token:identity.token}:{}),
      name:name??identity?.name??"DRIVER",
    });
    if(generation!==connectionGeneration) throw new Error("The game connection changed. Try again after reconnecting.");
    const token=typeof result.token==="string"?result.token:!newProfile?identity?.token:undefined;
    if(typeof result.profile_id!=="string"||!token||token.length!==64)
      throw new Error("The server did not confirm the player profile. Retry your saved profile.");
    pageIdentity={id:result.profile_id,token,name:name??identity?.name??"DRIVER"};
    pageIdentityScope=scope;
    saveIdentity(pageIdentity,scope);
    // The confirmed social_state owns readiness; a reply alone is not a view.
  } catch(error) {
    if(generation===connectionGeneration)useSocialStore.setState({profileStatus:"error",message:error instanceof Error?error.message:"Player profile restoration failed."});
    throw error;
  } finally {
    if(generation===connectionGeneration)identifying=false;
  }
}
export function identifySocial(name?:string,newProfile=false) {
  return identifyProfile(name,newProfile);
}
/** Explicitly create another authenticated player without changing the saved
 * main profile. Duplicated tabs may inherit sessionStorage and can use this
 * action again if their copied profile is still connected elsewhere. */
export function createTabProfile() {
  return identifyProfile("DRIVER 2",true,true);
}
export function beginSocialSession(serverId: unknown) {
  if (initialized || typeof serverId !== "string") return;
  initialized = true;
  identityKey = `avenlab-social-profile-v1:${serverId}`;
  useSocialStore.setState({
    available: true,
    profileStatus: "restoring",
    message: "Restoring your player profile…",
  });
  void identifySocial().catch(() => { /* The identity owner reports its own current-session error. */ });
}
export function receiveSocialState(value: unknown) {
  useSocialStore.getState().receive(value);
  const view = useSocialStore.getState().view;
  useChatStore
    .getState()
    .membership(
      view?.profile.id ?? null,
      view?.current_world_id ?? null,
      view?.alpha?.active?.team ?? useNetworkStore.getState().team,
    );
  if (view) usePresenceStore.getState().observe(view);
  const profile = useSocialStore.getState().view?.profile;
  const saved = readIdentity();
  const identity = pageIdentity ?? saved?.identity;
  if (
    profile &&
    identity &&
    profile.id === identity.id &&
    profile.name !== identity.name
  ) {
    pageIdentityScope = pageIdentity ? pageIdentityScope : saved?.scope ?? "device";
    pageIdentity = { ...identity, name: profile.name };
    saveIdentity(pageIdentity,pageIdentityScope);
  }
}
