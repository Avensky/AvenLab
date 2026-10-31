import { useState } from "react";
import { AssistedInput } from "../../components/text/AssistedInput";
import { mapCatalog } from "../../store/selection/selectionStore";
import { enterWorld } from "./navigation";
import { inviteCodeFromUrl, worldInviteUrl } from "./invitationLinks";
import {
  useSocialStore,
  type SocialView,
  type SocialWorld,
} from "../../store/social/socialStore";
import type { SocialCommand } from "./types";

/** Joining reserves a slot and selects this world's authoritative map. Vehicle
 * selection remains the existing garage flow; no second spawn command owner. */
export function WorldsPage({
  view,
  command,
  onStatus,
}: {
  view: SocialView;
  command: SocialCommand;
  onStatus: (message: string) => void;
}) {
  const [name, setName] = useState("MY WORLD"),
    [map, setMap] = useState(view.maps[0] ?? "road_jump_lab");
  const [password, setPassword] = useState(""),
    [listed, setListed] = useState(false),
    [capacity, setCapacity] = useState(10);
  const [code, setCode] = useState(
      () =>
        useSocialStore.getState().entryCode ||
        inviteCodeFromUrl(window.location.href) ||
        "",
    ),
    [joinPassword, setJoinPassword] = useState("");
  const [selected, setSelected] = useState<SocialWorld | null>(null),
    [deleting, setDeleting] = useState<number | null>(null);
  const current = view.worlds.find(
    (world) => world.id === view.current_world_id,
  );
  const join = async (world?: SocialWorld) => {
    const target = world ?? selected;
    if (
      target?.locked &&
      target.owner_id !== view.profile.id &&
      selected?.id !== target.id
    ) {
      setSelected(target);
      setJoinPassword("");
      return;
    }
    const result = await command(
      "world_join",
      {
        ...(target ? { world_id: target.id } : { code: code.trim() }),
        password: joinPassword,
      },
      "World joined",
    );
    if (result) {
      setJoinPassword("");
      useSocialStore.setState({ entryCode: "" });
      enterWorld(result);
    }
  };
  const create = async () => {
    const created = await command(
      "world_create",
      { name, map, password, listed, max_players: capacity },
      "World saved",
    );
    if (!created) return;
    setPassword("");
    const joined = await command(
      "world_join",
      { world_id: created.world_id },
      "World joined",
    );
    if (joined) enterWorld(joined);
  };
  const share = async (world: SocialWorld) => {
    if (!world.invite_code) return;
    const url = worldInviteUrl(window.location.href, world.invite_code);
    const canShare = typeof navigator.share === "function";
    try {
      if (canShare)
        await navigator.share({
          title: world.name,
          text: world.locked
            ? "Join my AvenLab world. Ask me for the password."
            : "Join my AvenLab world.",
          url,
        });
      else if (navigator.clipboard) await navigator.clipboard.writeText(url);
      else throw new Error("Clipboard unavailable");
      onStatus(canShare ? "Invite ready" : "Invite link copied");
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        onStatus(`Invite code: ${world.invite_code}`);
    }
  };
  return (
    <div className="social-grid">
      <section className="social-card">
        <h2>{current ? `CURRENT WORLD · ${current.name}` : "JOIN A WORLD"}</h2>
        {current && (
          <>
            <p>
              {current.players}/{current.max_players} PLAYERS ·{" "}
              {current.map.replaceAll("_", " ")}
            </p>
            <div className="social-actions">
              <button
                type="button"
                className="menu-control"
                onClick={() => enterWorld({ map: current.map })}
              >
                CONTINUE TO GARAGE
              </button>
              <button
                type="button"
                className="menu-control"
                onClick={() => void command("world_leave", {}, "World left")}
              >
                LEAVE WORLD
              </button>
            </div>
          </>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void join();
          }}
        >
          <AssistedInput
            label="WORLD INVITE CODE"
            value={code}
            onChange={(value) => {
              setCode(value);
              setSelected(null);
            }}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
          />
          <AssistedInput
            label="WORLD PASSWORD"
            type="password"
            value={joinPassword}
            onChange={setJoinPassword}
            maxLength={64}
            autoComplete="off"
          />
          {selected && (
            <p role="status">JOINING {selected.name} · ENTER ITS PASSWORD</p>
          )}
          <button type="submit" className="menu-control">
            {selected ? `JOIN ${selected.name}` : "JOIN BY CODE"}
          </button>
        </form>
        {current?.invite_code && (
          <>
            <p className="social-code">{current.invite_code}</p>
            <button
              type="button"
              className="menu-control"
              onClick={() => void share(current)}
            >
              COPY / SHARE WORLD INVITE
            </button>
            <p className="social-hint">
              Password-protected worlds still require their password.
            </p>
          </>
        )}
      </section>
      <section className="social-card">
        <h2>CREATE A WORLD</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <AssistedInput
            label="WORLD NAME"
            value={name}
            onChange={setName}
            maxLength={40}
          />
          <label>
            MAP
            <select
              aria-label="MAP"
              value={map}
              onChange={(event) => setMap(event.currentTarget.value)}
            >
              {view.maps.map((id) => (
                <option key={id} value={id}>
                  {mapCatalog.find((map) => map.id === id)?.name ?? id}
                </option>
              ))}
            </select>
          </label>
          <div className="social-form-row">
            <label>
              PLAYER LIMIT
              <select
                aria-label="PLAYER LIMIT"
                value={capacity}
                onChange={(event) =>
                  setCapacity(Number(event.currentTarget.value))
                }
              >
                {[2, 4, 6, 8, 10].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <label className="social-check">
              <input
                type="checkbox"
                checked={listed}
                onChange={(event) => setListed(event.currentTarget.checked)}
              />
              SHOW IN WORLD BROWSER
            </label>
          </div>
          <AssistedInput
            label="PASSWORD · OPTIONAL"
            value={password}
            onChange={setPassword}
            type="password"
            maxLength={64}
            autoComplete="new-password"
          />
          <p className="social-hint">
            Unlisted worlds need an invite or code. Add a password for another
            access check.
          </p>
          <button type="submit" className="menu-control">
            CREATE & JOIN
          </button>
        </form>
      </section>
      <section className="social-card social-wide">
        <h2>AVAILABLE & SAVED WORLDS</h2>
        <div className="social-world-list">
          {view.worlds.map((world) => (
            <article key={world.id}>
              <div>
                <strong>{world.name}</strong>
                <small>
                  {mapCatalog.find((map) => map.id === world.map)?.name ??
                    world.map}{" "}
                  · {world.players}/{world.max_players} ·{" "}
                  {world.active ? "ACTIVE" : "SLEEPING"} ·{" "}
                  {world.locked ? "PASSWORD" : "NO PASSWORD"} ·{" "}
                  {world.listed ? "LISTED" : "UNLISTED"}
                </small>
              </div>
              <div className="social-actions">
                <button
                  type="button"
                  className="menu-control"
                  disabled={
                    world.id !== current?.id &&
                    world.players >= world.max_players
                  }
                  onClick={() =>
                    world.id === current?.id
                      ? enterWorld({ map: world.map })
                      : void join(world)
                  }
                >
                  {world.id === current?.id ? "CONTINUE" : "JOIN"}
                </button>
                {world.invite_code && (
                  <button
                    type="button"
                    className="menu-control"
                    onClick={() => void share(world)}
                  >
                    INVITE LINK
                  </button>
                )}
                {world.owner_id === view.profile.id && (
                  <>
                    <button
                      type="button"
                      className="menu-control"
                      onClick={() =>
                        void command(
                          "world_rotate_code",
                          { world_id: world.id },
                          "Old invite code replaced",
                        )
                      }
                    >
                      NEW CODE
                    </button>
                    {deleting === world.id ? (
                      <>
                        <button
                          type="button"
                          className="menu-control"
                          onClick={() =>
                            void command(
                              "world_delete",
                              { world_id: world.id },
                              "World deleted",
                            ).then(() => setDeleting(null))
                          }
                        >
                          CONFIRM DELETE
                        </button>
                        <button
                          type="button"
                          className="menu-control"
                          onClick={() => setDeleting(null)}
                        >
                          CANCEL
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="menu-control"
                        disabled={world.players > 0}
                        onClick={() => setDeleting(world.id)}
                      >
                        DELETE
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
        {!view.worlds.length && (
          <p>No saved worlds yet. Create one or enter an invite code.</p>
        )}
      </section>
    </div>
  );
}
