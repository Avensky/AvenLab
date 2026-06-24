import { useState } from "react";
import { useUIStore } from "../../store";
import { SignalReconMission } from "./SignalReconMission";
import { GameButton } from "../../components/GameButton";
import { CanBusStatusBadge } from "./CanBusStatusBadge";

const missions = [
  { id: "M01", title: "Door Unlock", target: "door_unlock", status: "READY" },
  { id: "M02", title: "Engine Start", target: "engine_start", status: "READY" },
  { id: "M03", title: "Turn Signals", target: "turn_signals", status: "LOCKED" },
  { id: "M04", title: "RPM Sweep", target: "rpm", status: "LOCKED" },
];

export function SignalRecon() {
  const setScreen = useUIStore((s) => s.setScreen);

  const [selectedMission, setSelectedMission] = useState(missions[0]);
  const [missionStarted, setMissionStarted] = useState(false);
  const [queueMinimized, setQueueMinimized] = useState(false);

  const startMission = () => {
    if (selectedMission.status === "LOCKED") return;

    setMissionStarted(true);
    setQueueMinimized(true);
  };

  return (
    <div className="relative game-ui h-screen w-screen overflow-hidden bg-[#020617] text-green-100">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />

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

          <div className="flex items-center gap-4">
            <CanBusStatusBadge />
            <GameButton
              onPress={() => setScreen("main")}
              className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-100 hover:bg-red-500/20"
            >
              EXIT
            </GameButton>
          </div>
        </header>

        <main
          className={`grid flex-1 gap-4 transition-all ${queueMinimized
            ? "grid-cols-[96px_1fr]"
            : "grid-cols-1 lg:grid-cols-[0.8fr_1.2fr]"
            }`}
        >
          <section
            className={`rounded-2xl border border-green-400/20 bg-slate-950/90 shadow-xl shadow-green-500/10 transition-all ${queueMinimized ? "p-3" : "p-5"
              }`}
          >
            {queueMinimized ? (
              <div className="flex flex-col gap-3">
                <GameButton
                  onPress={() => setQueueMinimized(false)}
                  className="flex h-10 w-full items-center justify-center rounded-lg border border-slate-600 bg-slate-900 font-mono text-xs text-slate-300 hover:bg-slate-800"
                >
                  MAX
                </GameButton>

                {missions.map((mission) => {
                  const selected = selectedMission.id === mission.id;
                  const locked = mission.status === "LOCKED";

                  return (
                    <GameButton
                      key={mission.id}
                      disabled={locked}
                      onPress={() => {
                        setSelectedMission(mission);
                        setMissionStarted(false);
                        setQueueMinimized(false);
                      }}
                      className={`flex h-16 w-full items-center justify-center rounded-xl border font-mono text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-30 ${selected
                        ? "border-green-300 bg-green-500/20 text-green-100"
                        : "border-slate-700 bg-slate-900/80 text-slate-400 hover:bg-slate-800"
                        }`}
                    >
                      {mission.id}
                    </GameButton>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-green-200">
                    Mission Queue
                  </h2>

                  <GameButton
                    onPress={() => setQueueMinimized(true)}
                    className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1 font-mono text-xs text-slate-300 hover:bg-slate-800"
                  >
                    MIN
                  </GameButton>
                </div>

                <div className="space-y-3">
                  {missions.map((mission) => {
                    const selected = selectedMission.id === mission.id;
                    const locked = mission.status === "LOCKED";

                    return (
                      <GameButton
                        key={mission.id}
                        disabled={locked}
                        onPress={() => setSelectedMission(mission)}
                        className={`w-full rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${selected
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
                      </GameButton>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section className="min-h-0 rounded-2xl border border-green-400/20 bg-black/80 font-mono shadow-xl shadow-green-500/10">
            {!missionStarted ? (
              <div className="p-6">
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
                    <li>Record quiet baseline.</li>
                    <li>Perform requested vehicle action.</li>
                    <li>Validate action timing and noise level.</li>
                    <li>Attach label metadata to CAN window.</li>
                    <li>Save session for replay and analysis.</li>
                  </ol>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <GameButton
                    onPress={startMission}
                    disabled={selectedMission.status === "LOCKED"}
                    className="rounded-xl border border-green-300/40 bg-green-500/10 px-5 py-4 font-bold text-green-100 hover:bg-green-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    START MISSION
                  </GameButton>

                  {/* <GameButton className="rounded-xl border border-yellow-300/40 bg-yellow-500/10 px-5 py-4 font-bold text-yellow-100 hover:bg-yellow-400/20">
                    RECORD
                  </GameButton> */}

                  <GameButton className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 px-5 py-4 font-bold text-cyan-100 hover:bg-cyan-400/20">
                    REPLAY
                  </GameButton>

                  {/* <GameButton className="rounded-xl border border-red-300/40 bg-red-500/10 px-5 py-4 font-bold text-red-100 hover:bg-red-400/20">
                    ABORT
                  </GameButton> */}
                </div>
              </div>
            ) : (
              <SignalReconMission mission={selectedMission} />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}