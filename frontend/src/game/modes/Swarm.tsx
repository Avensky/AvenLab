import { useUIStore } from "../../store";
import {useState} from 'react';
import {useAlphaStore} from '../../store/alpha/alphaStore';

const vehicles = [
  { id: "drone-01", type: "DRONE", status: "PATROL", color: "text-cyan-300" },
  { id: "car-01", type: "GROUND", status: "CONVOY", color: "text-yellow-300" },
  { id: "heli-01", type: "HELI", status: "ORBIT", color: "text-red-300" },
  { id: "boat-01", type: "BOAT", status: "HARBOR", color: "text-blue-300" },
  { id: "plane-01", type: "PLANE", status: "STANDBY", color: "text-slate-300" },
];

export function Swarm() {
  const setScreen = useUIStore((s) => s.setScreen);
  const [tab,setTab]=useState<'registry'|'boats'>('registry');
  const openNavalTrial=()=>{
    useAlphaStore.getState().chooseMode('sandbox');
    setScreen('mode_select');
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#020617] text-cyan-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.14),transparent_45%)]" />
      <div className="relative z-10 flex h-full flex-col p-6">
        <header className="mb-5 flex items-center justify-between border-b border-cyan-400/20 pb-4">
          <div>
            <p className="text-xs tracking-[0.45em] text-yellow-300">
              AVENLAB // MULTI-ASSET CONTROL
            </p>
            <h1 className="text-4xl font-black text-cyan-100">
              SWARM DEMO
            </h1>
          </div>

          <button
            onClick={() => setScreen("main")}
            className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-100 hover:bg-red-500/20"
          >
            EXIT
          </button>
        </header>

        <main className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-5 shadow-xl shadow-cyan-500/10">
            <h2 className="mb-3 text-xl font-bold text-cyan-200">
              Mission Map
            </h2>

            <div className="relative h-full min-h-[420px] overflow-hidden rounded-xl border border-cyan-400/20 bg-[#06111f]">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.06)_1px,transparent_1px)] bg-[size:36px_36px]" />

              <div className="absolute left-[20%] top-[45%] h-4 w-4 rounded-full bg-yellow-300 shadow-lg shadow-yellow-300/50" />
              <div className="absolute left-[38%] top-[30%] h-3 w-3 rounded-full bg-cyan-300 shadow-lg shadow-cyan-300/50" />
              <div className="absolute left-[60%] top-[42%] h-3 w-3 rounded-full bg-red-300 shadow-lg shadow-red-300/50" />
              <div className="absolute left-[72%] top-[65%] h-3 w-3 rounded-full bg-blue-300 shadow-lg shadow-blue-300/50" />
              <div className="absolute left-[48%] top-[18%] h-3 w-3 rounded-full bg-slate-200 shadow-lg shadow-slate-200/50" />

              <div className="absolute bottom-4 left-4 rounded border border-cyan-400/20 bg-black/50 px-3 py-2 text-xs text-slate-300">
                BLUE TEAM BASE // STATIC OPS MAP
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-5 shadow-xl shadow-cyan-500/10">
            <div className="mb-4 flex gap-2" role="tablist" aria-label="Swarm platforms">
              <button role="tab" aria-selected={tab==='registry'} onClick={()=>setTab('registry')} className={`border px-3 py-2 text-xs font-bold ${tab==='registry'?'border-cyan-300 bg-cyan-700/30':'border-slate-700'}`}>REGISTRY</button>
              <button role="tab" aria-selected={tab==='boats'} onClick={()=>setTab('boats')} className={`border px-3 py-2 text-xs font-bold ${tab==='boats'?'border-cyan-300 bg-cyan-700/30':'border-slate-700'}`}>BOATS</button>
            </div>
            {tab==='boats'?<div role="tabpanel" className="space-y-3">
              <img src="/images/heroes/hawaii-rescue.webp" alt="USS Hawaii rescue destroyer" className="h-40 w-full object-contain"/>
              <h2 className="text-xl font-black text-cyan-100">USS HAWAII · RESCUE CRUISER</h2>
              <p className="text-sm text-slate-300">Playable sea trial in Sandbox and World Editor. Water buoyancy, propeller thrust and rudder turning are server-simulated.</p>
              <p className="text-xs uppercase text-amber-300">Autonomous route, helicopter sorties, drones and live targeting: not deployed yet.</p>
              <button onClick={openNavalTrial} className="w-full border border-cyan-300/50 bg-cyan-500/15 px-4 py-3 font-bold text-cyan-100">OPEN NAVAL SANDBOX</button>
            </div>:<div role="tabpanel">
            <h2 className="mb-3 text-xl font-bold text-cyan-200">Asset Registry</h2>

            <div className="space-y-3">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl border border-slate-700 bg-slate-900/80 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-black ${v.color}`}>{v.type}</span>
                    <span className="text-xs text-slate-400">{v.status}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    id: {v.id}
                  </p>
                </div>
              ))}
            </div>

            <button disabled title="Server-controlled NPC formations are in development" className="mt-5 w-full cursor-not-allowed border border-cyan-300/20 bg-cyan-500/5 px-5 py-4 font-bold text-slate-400">
              FORMATION DEPLOYMENT · IN DEVELOPMENT
            </button>
            </div>}
          </section>
        </main>
      </div>
    </div>
  );
}
