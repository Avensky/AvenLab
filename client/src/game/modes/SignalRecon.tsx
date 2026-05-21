import { useState } from "react";
import { useUIStore } from "../../store";

const missions = [
  {
    id: "M01",
    title: "Door Unlock",
    target: "door_unlock",
    status: "READY",
  },
  {
    id: "M02",
    title: "Engine Start",
    target: "engine_start",
    status: "READY",
  },
  {
    id: "M03",
    title: "Turn Signals",
    target: "turn_signals",
    status: "LOCKED",
  },
  {
    id: "M04",
    title: "RPM Sweep",
    target: "rpm",
    status: "LOCKED",
  },
];

export function SignalRecon() {
  const setScreen = useUIStore((s) => s.setScreen);
  const [selectedMission, setSelectedMission] = useState(missions[0]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#020617] text-green-100">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative z-10 flex h-full flex-col p-6">
        <header className="mb-5 flex items-center justify-between border-b border-green-400/20 pb-4">
          <div>
            <p className="text-xs tracking-[0.45em] text-yellow-300">
              NIWC // CAN SIGNAL ACQUISITION
            </p>
            <h1 className="text-4xl font-black text-green-100">
              SIGNAL RECON MODE
            </h1>
          </div>

          <button
            onClick={() => setScreen("main")}
            className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-100 hover:bg-red-500/20"
          >
            EXIT
          </button>
        </header>

        <main className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-2xl border border-green-400/20 bg-slate-950/90 p-5 shadow-xl shadow-green-500/10">
            <h2 className="mb-3 text-xl font-bold text-green-200">
              Mission Queue
            </h2>

            <div className="space-y-3">
              {missions.map((mission) => (
                <button
                  key={mission.id}
                  onClick={() => setSelectedMission(mission)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedMission.id === mission.id
                      ? "border-green-300 bg-green-500/15"
                      : "border-slate-700 bg-slate-900/80 hover:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-yellow-300">
                      {mission.id}
                    </span>
                    <span className="text-xs text-slate-400">
                      {mission.status}
                    </span>
                  </div>

                  <h3 className="mt-1 font-bold text-green-100">
                    {mission.title}
                  </h3>

                  <p className="font-mono text-xs text-slate-500">
                    target: {mission.target}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-green-400/20 bg-black/80 p-5 font-mono shadow-xl shadow-green-500/10">
            <div className="mb-4 flex items-center justify-between border-b border-green-400/20 pb-3">
              <h2 className="text-lg font-bold text-green-200">
                Tactical Terminal
              </h2>
              <span className="text-xs text-yellow-300">
                SESSION: IDLE
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <p className="text-green-400">
                &gt; selected mission: {selectedMission.title}
              </p>
              <p className="text-slate-400">
                &gt; target signal: {selectedMission.target}
              </p>
              <p className="text-slate-400">
                &gt; protocol: baseline → action → validation → label → replay
              </p>
              <p className="text-slate-400">
                &gt; objective: isolate one CAN variable at a time
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-green-400/20 bg-slate-950 p-4">
              <h3 className="mb-2 font-bold text-yellow-300">
                Mission Steps
              </h3>

              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
                <li>Record 3 second quiet baseline.</li>
                <li>Perform requested vehicle action.</li>
                <li>Validate action timing and noise level.</li>
                <li>Attach label metadata to CAN window.</li>
                <li>Save session for replay and analysis.</li>
              </ol>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button className="rounded-xl border border-green-300/40 bg-green-500/10 px-5 py-4 font-bold text-green-100 hover:bg-green-400/20">
                START MISSION
              </button>

              <button className="rounded-xl border border-yellow-300/40 bg-yellow-500/10 px-5 py-4 font-bold text-yellow-100 hover:bg-yellow-400/20">
                RECORD
              </button>

              <button className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-5 py-4 font-bold text-cyan-100 hover:bg-cyan-400/20">
                REPLAY
              </button>

              <button className="rounded-xl border border-red-300/40 bg-red-500/10 px-5 py-4 font-bold text-red-100 hover:bg-red-400/20">
                ABORT
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}