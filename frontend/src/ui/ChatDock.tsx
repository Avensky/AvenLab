import { useState } from "react";
import { HudGroup } from "./HudGroup";

// The layout reserves real team/game/general channels. A message transport is
// intentionally not simulated: text cannot appear as delivered without a server.
export function ChatDock() {
  const [minimized,setMinimized]=useState(true);
  const [channel,setChannel]=useState<'team'|'game'|'general'>('team');
  return <HudGroup id="chat" title="CHAT" className="chat-dock" defaultCollapsed>
    <button className="chat-minimize" type="button" aria-label={minimized?"Expand chat":"Minimize chat"} aria-expanded={!minimized} onClick={()=>setMinimized(!minimized)}>CHAT {minimized?"⌃":"⌄"}</button>
    {!minimized&&<><nav aria-label="Chat channels">{(['team','game','general'] as const).map(id=><button type="button" key={id} aria-pressed={channel===id} onClick={()=>setChannel(id)}>{id.toUpperCase()}</button>)}</nav>
    <div className="chat-messages" role="log" aria-label={`${channel} messages`}><span>CHAT NOT CONNECTED</span></div>
    <input type="text" aria-label={`${channel} chat message`} placeholder="Chat unavailable" disabled/></>}
  </HudGroup>;
}
