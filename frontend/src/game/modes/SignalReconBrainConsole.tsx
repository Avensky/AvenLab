import { useMemo, useState } from "react";
import { GameButton } from "../../components/GameButton";

export type BrainCandidate = {
    can_id: number;
    can_id_hex: string;
    frame_count: number;
    frequency_hz: number | null;
    change_count: number;
    byte_change_counts: Record<string, number>;
    entropy: number;
    correlation_score: number;
    confidence: number;
    likely_marker_types: string[];
    notes: string;
};

export type BrainAnalysisResult = {
    ok: boolean;
    session_id: string;
    frames_analyzed: number;
    markers: number;
    candidates: BrainCandidate[];
    heatmap: Record<
        string,
        {
            can_id: number;
            byte_change_counts: Record<string, number>;
            change_count: number;
            frame_count: number;
            frequency_hz: number | null;
        }
    >;
    llm_model: string | null;
    llm_available: boolean;
    llm_error: string | null;
    analysis: string | null;
    persisted: boolean;
};

type BrainTab = "summary" | "candidates" | "heatmap" | "llm" | "logs";

type SignalReconBrainConsoleProps = {
    open: boolean;
    analyzing: boolean;
    error: string | null;
    analysis: BrainAnalysisResult | null;
    logs: string[];
    sessionId: string | null;
    missionCode: string;
    missionTitle: string;
    onClose: () => void;
    onAnalyze: () => void;
};

const TABS: Array<{ id: BrainTab; label: string }> = [
    { id: "summary", label: "SUMMARY" },
    { id: "candidates", label: "IDS" },
    { id: "heatmap", label: "HEAT" },
    { id: "llm", label: "LLM" },
    { id: "logs", label: "LOG" },
];

function percent(value: number | null | undefined) {
    if (typeof value !== "number" || Number.isNaN(value)) return "0%";
    return `${Math.round(value * 100)}%`;
}

function fixed(value: number | null | undefined, digits = 2) {
    if (typeof value !== "number" || Number.isNaN(value)) return "—";
    return value.toFixed(digits);
}

function shortSessionId(sessionId: string | null) {
    if (!sessionId) return "not started";
    if (sessionId.length <= 14) return sessionId;
    return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

function candidateTone(confidence: number) {
    if (confidence >= 0.75) return "border-green-300/50 bg-green-500/10 text-green-100";
    if (confidence >= 0.45) return "border-yellow-300/50 bg-yellow-500/10 text-yellow-100";
    return "border-slate-600 bg-slate-900/80 text-slate-300";
}

function byteCells(byteCounts: Record<string, number>) {
    const max = Math.max(1, ...Object.values(byteCounts));

    return Array.from({ length: 8 }, (_, index) => {
        const count = byteCounts[String(index)] ?? 0;
        const opacity = Math.max(0.12, count / max);

        return (
            <div
                key={index}
                className="rounded border border-green-300/20 px-1.5 py-1 text-center"
                style={{ backgroundColor: `rgba(34,197,94,${opacity * 0.35})` }}
                title={`byte ${index}: ${count} changes`}
            >
                <div className="text-[9px] text-slate-500">B{index}</div>
                <div className="text-[11px] font-black text-green-100">{count}</div>
            </div>
        );
    });
}

export function SignalReconBrainConsole({
    open,
    analyzing,
    error,
    analysis,
    logs,
    sessionId,
    missionCode,
    missionTitle,
    onClose,
    onAnalyze,
}: SignalReconBrainConsoleProps) {
    const [activeTab, setActiveTab] = useState<BrainTab>("summary");

    const topCandidates = useMemo(
        () => [...(analysis?.candidates ?? [])].sort((a, b) => b.confidence - a.confidence).slice(0, 12),
        [analysis],
    );

    const topCandidate = topCandidates[0] ?? null;
    const heatRows = useMemo(
        () =>
            Object.entries(analysis?.heatmap ?? {})
                .sort(([, a], [, b]) => b.change_count - a.change_count)
                .slice(0, 16),
        [analysis],
    );

    if (!open) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4">
            <div className="flex h-[88dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-green-300/30 bg-slate-950/95 font-mono text-green-100 shadow-2xl shadow-green-500/10 sm:h-[78dvh]">
                <div className="shrink-0 border-b border-green-400/20 px-3 py-2 sm:px-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] tracking-[0.32em] text-yellow-300 sm:text-xs">
                                AVENLAB // PI BRAIN
                            </p>
                            <h2 className="truncate text-lg font-black text-green-100 sm:text-2xl">
                                MISSION ANALYSIS
                            </h2>
                            <p className="truncate text-[11px] text-slate-400 sm:text-xs">
                                {missionCode} · {missionTitle} · {shortSessionId(sessionId)}
                            </p>
                        </div>

                        <div className="flex shrink-0 gap-2">
                            <GameButton
                                onPress={onAnalyze}
                                disabled={analyzing || !sessionId}
                                className="rounded-lg border border-yellow-300/40 bg-yellow-500/10 px-2 py-1 text-[10px] font-bold text-yellow-100 hover:bg-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-2 sm:text-xs"
                            >
                                {analyzing ? "ANALYZING" : "RE-RUN"}
                            </GameButton>
                            <GameButton
                                onPress={onClose}
                                className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-100 hover:bg-slate-800 sm:px-3 sm:py-2 sm:text-xs"
                            >
                                CLOSE
                            </GameButton>
                        </div>
                    </div>

                    <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                        {TABS.map((tab) => (
                            <GameButton
                                key={tab.id}
                                onPress={() => setActiveTab(tab.id)}
                                className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold transition sm:text-xs ${activeTab === tab.id
                                    ? "border-green-300 bg-green-500/20 text-green-100"
                                    : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"
                                    }`}
                            >
                                {tab.label}
                            </GameButton>
                        ))}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                    {error && (
                        <div className="mb-3 rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-100">
                            {error}
                        </div>
                    )}

                    {analyzing && (
                        <div className="mb-3 rounded-xl border border-yellow-300/40 bg-yellow-500/10 p-3 text-sm text-yellow-100">
                            &gt; analyzing CAN deltas, marker windows, byte volatility, and LLM report...
                        </div>
                    )}

                    {activeTab === "summary" && (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-4">
                                <p className="text-xs text-yellow-300">TOP HYPOTHESIS</p>
                                {topCandidate ? (
                                    <div className="mt-2 grid gap-3 sm:grid-cols-[0.7fr_1.3fr]">
                                        <div className={`rounded-xl border p-4 ${candidateTone(topCandidate.confidence)}`}>
                                            <p className="text-4xl font-black">{percent(topCandidate.confidence)}</p>
                                            <p className="text-sm">probability / confidence</p>
                                            <p className="mt-3 text-2xl font-black">{topCandidate.can_id_hex}</p>
                                        </div>
                                        <div className="space-y-2 text-sm text-slate-300">
                                            <p>
                                                <span className="text-slate-500">frames:</span> {topCandidate.frame_count}
                                            </p>
                                            <p>
                                                <span className="text-slate-500">changes:</span> {topCandidate.change_count}
                                            </p>
                                            <p>
                                                <span className="text-slate-500">marker score:</span> {fixed(topCandidate.correlation_score, 3)}
                                            </p>
                                            <p>
                                                <span className="text-slate-500">likely markers:</span>{" "}
                                                {topCandidate.likely_marker_types.join(", ") || "none"}
                                            </p>
                                            <p className="text-cyan-200">{topCandidate.notes}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-slate-500">
                                        No candidates yet. Run a mission, then analyze the session.
                                    </p>
                                )}
                            </div>

                            <div className="grid gap-2 text-sm sm:grid-cols-3">
                                <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3">
                                    <p className="text-slate-500">frames</p>
                                    <p className="text-2xl font-black">{analysis?.frames_analyzed ?? 0}</p>
                                </div>
                                <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3">
                                    <p className="text-slate-500">markers</p>
                                    <p className="text-2xl font-black">{analysis?.markers ?? 0}</p>
                                </div>
                                <div className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3">
                                    <p className="text-slate-500">LLM</p>
                                    <p className="text-2xl font-black">{analysis?.llm_available ? "ON" : "OFF"}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "candidates" && (
                        <div className="space-y-2">
                            {topCandidates.map((candidate) => (
                                <div key={candidate.can_id_hex} className={`rounded-xl border p-3 ${candidateTone(candidate.confidence)}`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xl font-black">{candidate.can_id_hex}</p>
                                            <p className="text-[11px] text-slate-400">
                                                hz {fixed(candidate.frequency_hz, 2)} · entropy {fixed(candidate.entropy, 2)} · changes {candidate.change_count}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-black">{percent(candidate.confidence)}</p>
                                            <p className="text-[10px] text-slate-500">confidence</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-8 gap-1">{byteCells(candidate.byte_change_counts)}</div>
                                    <p className="mt-2 text-[11px] text-slate-400">
                                        markers: {candidate.likely_marker_types.join(", ") || "none"} · {candidate.notes}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === "heatmap" && (
                        <div className="space-y-2">
                            {heatRows.map(([canId, row]) => (
                                <div key={canId} className="rounded-xl border border-green-400/20 bg-slate-900/80 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="font-black text-green-100">{canId}</p>
                                        <p className="text-[11px] text-slate-500">
                                            changes {row.change_count} · frames {row.frame_count} · hz {fixed(row.frequency_hz, 2)}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-8 gap-1">{byteCells(row.byte_change_counts)}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === "llm" && (
                        <div className="whitespace-pre-wrap rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm leading-relaxed text-cyan-50">
                            {analysis?.analysis || analysis?.llm_error || "No LLM report yet. If Ollama is offline, candidate probabilities still work."}
                        </div>
                    )}

                    {activeTab === "logs" && (
                        <div className="space-y-1 rounded-xl border border-green-400/20 bg-black/60 p-4 text-sm">
                            {logs.length ? (
                                logs.map((line, index) => (
                                    <p key={`${line}-${index}`} className="text-green-300">
                                        &gt; {line}
                                    </p>
                                ))
                            ) : (
                                <p className="text-slate-500">&gt; waiting for mission analysis...</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
