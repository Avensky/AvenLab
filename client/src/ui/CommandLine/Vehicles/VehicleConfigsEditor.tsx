import axios, { AxiosError } from "axios";
import { useEffect, useState } from "react";

/** A recursive JSON type for parsed payloads */
type JSONValue = string | number | boolean | null | { [k: string]: JSONValue } | JSONValue[];

/** Row as returned by your API */
type ConfigRow = {
  id: number;
  name: string;
  physics_json: JSONValue | null;
  can_ids_json: JSONValue | null;
  is_active: boolean;
};

/** Editor form is stringly-typed (raw JSON text) + a boolean */
type FormState = {
  name: string;
  physics_json: string; // raw text, parsed on save
  can_ids_json: string; // raw text, parsed on save
  is_active: boolean;
};

function toErrorMessage(e: unknown): string {
  const ax = e as AxiosError<{ error?: string }>;
  return ax?.response?.data?.error || ax?.message || "Request failed";
}

export default function VehicleConfigsEditor({ vehicleId }: { vehicleId: number | null }) {
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editConfigId, setEditConfigId] = useState<number | null>(null);

  // Editor form (Create or Update)
  const [form, setForm] = useState<FormState>({
    name: "default",
    physics_json: "{}",
    can_ids_json: "{}",
    is_active: false,
  });

  const [overrideText, setOverrideText] = useState<string>(""); // JSON text
  const [overrideLoading, setOverrideLoading] = useState(false);

  const toPretty = (v: JSONValue | null): string =>
    v == null ? "{}" : typeof v === "string" ? v : JSON.stringify(v, null, 2);

  /** Prefill editor with a specific config row */
  function loadConfigIntoForm(c: ConfigRow | null) {
    if (!c) return;
    setEditConfigId(c.id);
    setForm({
      name: c.name ?? "default",
      physics_json: toPretty(c.physics_json ?? null),
      can_ids_json: toPretty(c.can_ids_json ?? null),
      is_active: !!c.is_active,
    });
  }

  /** Fetch configs + override, then prefill with active (or first) if nothing is loaded yet */
  async function refreshConfigsAndPrefill(vId: number) {
    setLoading(true);
    setError(null);
    try {
      const cfg = await axios.get(`/api/v1/vehicles/${vId}/configs`);
      const list: ConfigRow[] = cfg.data?.configs || [];
      setConfigs(list);

      const active = list.find((x) => x.is_active) || list[0] || null;
      if (!editConfigId || !list.some((x) => x.id === editConfigId)) {
        loadConfigIntoForm(active);
      }

      const ov = await axios.get(`/api/v1/vehicles/${vId}/override`);
      const raw: JSONValue | undefined = ov.data?.override?.override_json;
      setOverrideText(raw !== undefined ? JSON.stringify(raw, null, 2) : "");
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!vehicleId) return;
    void refreshConfigsAndPrefill(vehicleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  /** Save the currently loaded config using the editor form */
  async function updateLoadedConfig() {
    if (!editConfigId) {
      setError("No config loaded to update.");
      return;
    }
    try {
      const payload = {
        name: form.name,
        physics_json: JSON.parse(form.physics_json || "{}") as JSONValue,
        can_ids_json: JSON.parse(form.can_ids_json || "{}") as JSONValue,
        is_active: !!form.is_active,
      };
      const res = await axios.put(`/api/v1/vehicle-configs/${editConfigId}`, payload);
      const updated: ConfigRow = res.data.config;
      setConfigs((prev) => prev.map((c) => (c.id === editConfigId ? updated : c)));
      loadConfigIntoForm(updated); // keep editor in sync
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  }

  async function createConfig() {
    if (!vehicleId) return;
    try {
      setError(null);
      const payload = {
        name: form.name,
        physics_json: JSON.parse(form.physics_json || "{}") as JSONValue,
        can_ids_json: JSON.parse(form.can_ids_json || "{}") as JSONValue,
        is_active: !!form.is_active,
      };
      const res = await axios.post(`/api/v1/vehicles/${vehicleId}/configs`, payload);
      const created: ConfigRow = res.data.config;
      setConfigs((prev) => [created, ...prev]);
      loadConfigIntoForm(created);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  }

  async function activateConfig(id: number) {
    if (!vehicleId) return;
    try {
      await axios.post(`/api/v1/vehicles/${vehicleId}/config/activate`, { configId: id });
      const cfg = await axios.get(`/api/v1/vehicles/${vehicleId}/configs`);
      const list: ConfigRow[] = cfg.data?.configs || [];
      setConfigs(list);
      if (editConfigId && !list.some((x) => x.id === editConfigId)) {
        // if current edit was removed/changed, reload the active one
        loadConfigIntoForm(list.find((x) => x.is_active) || list[0] || null);
      }
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  }

  async function saveOverride() {
    if (!vehicleId) return;
    try {
      setOverrideLoading(true);
      setError(null);
      const json = overrideText.trim() ? (JSON.parse(overrideText) as JSONValue) : {};
      await axios.put(`/api/v1/vehicles/${vehicleId}/override`, { override_json: json });
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    } finally {
      setOverrideLoading(false);
    }
  }

  async function clearOverride() {
    if (!vehicleId) return;
    try {
      await axios.delete(`/api/v1/vehicles/${vehicleId}/override`);
      setOverrideText("");
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  }

  // Inline rename helper
  function updateConfigInline(row: ConfigRow, name: string) {
    void updateConfig(row, { name });
  }

  function updateLoadedConfigFromPromptNameOnly(
    row: ConfigRow,
    fn: (row: ConfigRow, name: string) => void
  ) {
    const next = prompt("Rename to:", row.name);
    if (next != null) fn(row, next);
  }

  // Backwards-compatible updater with typed partial
  async function updateConfig(
    row: ConfigRow,
    partial: Partial<Pick<FormState, "name" | "physics_json" | "can_ids_json" | "is_active">>
  ) {
    try {
      const payload: {
        name?: string;
        physics_json?: JSONValue;
        can_ids_json?: JSONValue;
        is_active?: boolean;
      } = {};

      if (partial.name !== undefined) payload.name = partial.name;
      if (partial.physics_json !== undefined)
        payload.physics_json = JSON.parse(partial.physics_json) as JSONValue;
      if (partial.can_ids_json !== undefined)
        payload.can_ids_json = JSON.parse(partial.can_ids_json) as JSONValue;
      if (partial.is_active !== undefined) payload.is_active = !!partial.is_active;

      const res = await axios.put(`/api/v1/vehicle-configs/${row.id}`, payload);
      const updated: ConfigRow = res.data.config;
      setConfigs((prev) => prev.map((c) => (c.id === row.id ? updated : c)));

      if (editConfigId === row.id) loadConfigIntoForm(updated);
    } catch (e: unknown) {
      setError(toErrorMessage(e));
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* left: list + inline edit */}
      <div className="bg-black/20 border border-gray-700 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Configs</h3>
          {loading && <span className="text-xs text-gray-400">Loading…</span>}
        </div>

        {/* create/update form (prefilled when a config is loaded) */}
        <div className="border border-gray-700 rounded p-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              {editConfigId ? (
                <span>
                  Editing config <b>#{editConfigId}</b>
                </span>
              ) : (
                <span>New config</span>
              )}
            </div>
            {editConfigId && (
              <button
                className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                onClick={() => {
                  const c = configs.find((x) => x.id === editConfigId) || null;
                  if (c) loadConfigIntoForm(c);
                }}
              >
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="col-span-1">
              Name
              <input
                className="w-full bg-black/30 border border-gray-700 rounded px-2 py-1"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="col-span-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <span className="text-sm">Active</span>
            </label>

            <label className="col-span-2">
              physics_json
              <textarea
                className="w-full font-mono text-xs min-h-24 bg-black/30 border border-gray-700 rounded px-2 py-1"
                value={form.physics_json}
                onChange={(e) => setForm((f) => ({ ...f, physics_json: e.target.value }))}
              />
            </label>
            <label className="col-span-2">
              can_ids_json
              <textarea
                className="w-full font-mono text-xs min-h-20 bg-black/30 border border-gray-700 rounded px-2 py-1"
                value={form.can_ids_json}
                onChange={(e) => setForm((f) => ({ ...f, can_ids_json: e.target.value }))}
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={createConfig}
              className="px-3 py-1 rounded bg-green-600 hover:bg-green-500 text-sm font-semibold"
            >
              Create
            </button>
            <button
              onClick={updateLoadedConfig}
              disabled={!editConfigId}
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-sm font-semibold disabled:opacity-50"
            >
              Save Changes
            </button>
          </div>
        </div>

        {/* list */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-300">
              <tr className="border-b border-gray-700">
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">Active</th>
                <th className="py-1 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id} className="border-b border-gray-800">
                  <td className="py-1 pr-2">{c.name}</td>
                  <td className="py-1 pr-2">{c.is_active ? "✔" : "—"}</td>
                  <td className="py-1 pr-2 flex gap-2">
                    <button
                      className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600"
                      onClick={() => loadConfigIntoForm(c)}
                    >
                      Edit
                    </button>
                    <button
                      className="px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-600"
                      onClick={() => activateConfig(c.id)}
                    >
                      Activate
                    </button>
                    <button
                      className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                      onClick={() =>
                        updateLoadedConfigFromPromptNameOnly(c, updateConfigInline)
                      }
                    >
                      Rename
                    </button>
                  </td>
                </tr>
              ))}
              {(!configs || !configs.length) && (
                <tr>
                  <td colSpan={3} className="py-2 text-center text-gray-400">
                    No configs yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}
      </div>

      {/* right: override editor */}
      <div className="bg-black/20 border border-gray-700 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Override (gamemaster)</h3>
          <div className="flex gap-2">
            <button
              className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
              onClick={saveOverride}
              disabled={overrideLoading}
            >
              {overrideLoading ? "Saving…" : "Save"}
            </button>
            <button
              className="text-xs px-2 py-0.5 rounded bg-red-700 hover:bg-red-600"
              onClick={clearOverride}
            >
              Clear
            </button>
          </div>
        </div>
        <textarea
          className="w-full font-mono text-xs min-h-64 bg-black/30 border border-gray-700 rounded px-2 py-1"
          value={overrideText}
          onChange={(e) => setOverrideText(e.target.value)}
          placeholder='{"maxForce": 500}'
        />
      </div>
    </div>
  );
}
