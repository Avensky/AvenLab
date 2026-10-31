import { useState } from "react";
import { AssistedInput } from "../../components/text/AssistedInput";
import type { SocialView } from "../../store/social/socialStore";
import type { SocialCommand } from "./types";

export function TeammatesPage({
  view,
  command,
}: {
  view: SocialView;
  command: SocialCommand;
}) {
  const [search, setSearch] = useState(""),
    [playerCode, setPlayerCode] = useState("");
  const pending = new Set(
    view.requests
      .filter((request) => !request.incoming)
      .map((request) => request.player.id),
  );
  const current = view.worlds.find(
    (world) => world.id === view.current_world_id,
  );
  return (
    <div className="social-grid">
      <section className="social-card">
        <h2>TEAMMATES</h2>
        <p className="social-hint">
          Teammate requests require acceptance. Social groups let you invite a
          crew together.
        </p>
        {view.teammates.map((person) => (
          <article className="social-person" key={person.id}>
            <div>
              <strong>{person.name}</strong>
              <small>
                {person.online ? "ONLINE" : "OFFLINE"}
                {person.team ? ` · TEAM ${person.team.toUpperCase()}` : ""}
              </small>
            </div>
            <div className="social-actions">
              {current && (
                <button
                  type="button"
                  className="menu-control"
                  onClick={() =>
                    void command(
                      "world_invite",
                      { world_id: current.id, target: person.id },
                      "World invitation sent",
                    )
                  }
                >
                  INVITE TO WORLD
                </button>
              )}
              <button
                type="button"
                className="menu-control"
                onClick={() =>
                  void command(
                    "friend_remove",
                    { target: person.id },
                    "Teammate removed",
                  )
                }
              >
                REMOVE
              </button>
            </div>
          </article>
        ))}
        {!view.teammates.length && (
          <p>Your accepted teammates will appear here.</p>
        )}
        {view.requests
          .filter((request) => !request.incoming)
          .map((request) => (
            <article className="social-person" key={request.player.id}>
              <span>{request.player.name} · REQUEST SENT</span>
              <button
                type="button"
                className="menu-control"
                onClick={() =>
                  void command(
                    "friend_cancel",
                    { target: request.player.id },
                    "Request cancelled",
                  )
                }
              >
                CANCEL REQUEST
              </button>
            </article>
          ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void command(
              "friend_request",
              { target: playerCode.trim() },
              "Teammate request sent",
            );
          }}
        >
          <AssistedInput
            label="ADD BY PLAYER CODE"
            value={playerCode}
            onChange={setPlayerCode}
            maxLength={32}
            spellCheck={false}
          />
          <button type="submit" className="menu-control">
            SEND REQUEST
          </button>
        </form>
      </section>
      <section className="social-card">
        <h2>PLAYERS ONLINE</h2>
        <AssistedInput
          label="FIND PLAYER"
          value={search}
          onChange={setSearch}
          maxLength={24}
        />
        {view.players
          .filter((person) =>
            person.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((person) => (
            <article className="social-person" key={person.id}>
              <div>
                <strong>{person.name}</strong>
                <small>
                  {person.id.slice(0, 8)}
                  {person.team ? ` · ${person.team.toUpperCase()}` : ""}
                </small>
              </div>
              <button
                type="button"
                className="menu-control"
                disabled={
                  pending.has(person.id) ||
                  view.teammates.some((friend) => friend.id === person.id)
                }
                onClick={() =>
                  void command(
                    "friend_request",
                    { target: person.id },
                    "Teammate request sent",
                  )
                }
              >
                {pending.has(person.id)
                  ? "REQUEST SENT"
                  : view.teammates.some((friend) => friend.id === person.id)
                    ? "TEAMMATE"
                    : "ADD TEAMMATE"}
              </button>
            </article>
          ))}
        {!view.players.length && <p>No other players are online.</p>}
      </section>
    </div>
  );
}

export function GroupsPage({
  view,
  command,
}: {
  view: SocialView;
  command: SocialCommand;
}) {
  const [name, setName] = useState("MY CREW"),
    [selected, setSelected] = useState<Record<string, string>>({});
  return (
    <div className="social-grid">
      <section className="social-card">
        <h2>CREATE SOCIAL GROUP</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void command("group_create", { name }, "Social group created");
          }}
        >
          <AssistedInput
            label="GROUP NAME"
            value={name}
            onChange={setName}
            maxLength={32}
          />
          <button type="submit" className="menu-control">
            CREATE GROUP
          </button>
        </form>
        <p className="social-hint">
          Up to 10 members. Joining a world prefers the team of a group member
          already there, when that team has room.
        </p>
      </section>
      {view.groups
        .filter((group) => group.joined)
        .map((group) => (
          <section className="social-card" key={group.id}>
            <h2>
              {group.name} · {group.members.length}/10
            </h2>
            <p>
              {group.owner_id === view.profile.id
                ? "YOU ARE THE LEADER"
                : "SOCIAL GROUP"}
            </p>
            {group.members.map((person) => (
              <article className="social-person" key={person.id}>
                <div>
                  <strong>
                    {person.name}
                    {person.id === group.owner_id ? " · LEADER" : ""}
                  </strong>
                  <small>{person.online ? "ONLINE" : "OFFLINE"}</small>
                </div>
                {group.owner_id === view.profile.id &&
                  person.id !== view.profile.id && (
                    <button
                      type="button"
                      className="menu-control"
                      onClick={() =>
                        void command(
                          "group_remove",
                          { group_id: group.id, target: person.id },
                          "Member removed",
                        )
                      }
                    >
                      REMOVE
                    </button>
                  )}
              </article>
            ))}
            {group.owner_id === view.profile.id && (
              <>
                <label>
                  INVITE TEAMMATE
                  <select
                    aria-label="INVITE TEAMMATE"
                    value={selected[group.id] ?? ""}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSelected((values) => ({
                        ...values,
                        [group.id]: value,
                      }));
                    }}
                  >
                    <option value="">CHOOSE TEAMMATE</option>
                    {view.teammates
                      .filter(
                        (person) =>
                          !group.members.some(
                            (member) => member.id === person.id,
                          ) &&
                          !group.invited.some(
                            (member) => member.id === person.id,
                          ),
                      )
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="menu-control"
                  disabled={!selected[group.id]}
                  onClick={() =>
                    void command(
                      "group_invite",
                      { group_id: group.id, target: selected[group.id] },
                      "Group invitation sent",
                    )
                  }
                >
                  SEND GROUP INVITE
                </button>
                {group.invited.map((person) => (
                  <article className="social-person" key={person.id}>
                    <span>{person.name} · INVITED</span>
                    <button
                      type="button"
                      className="menu-control"
                      onClick={() =>
                        void command(
                          "group_remove",
                          { group_id: group.id, target: person.id },
                          "Invitation cancelled",
                        )
                      }
                    >
                      CANCEL INVITE
                    </button>
                  </article>
                ))}
              </>
            )}
            <div className="social-actions">
              {view.current_world_id !== null && (
                <button
                  type="button"
                  className="menu-control"
                  onClick={() =>
                    void command(
                      "world_invite",
                      { world_id: view.current_world_id, group_id: group.id },
                      "World invitations sent to group",
                    )
                  }
                >
                  INVITE GROUP TO WORLD
                </button>
              )}
              <button
                type="button"
                className="menu-control"
                onClick={() =>
                  void command(
                    "group_leave",
                    { group_id: group.id },
                    "Group left",
                  )
                }
              >
                LEAVE GROUP
              </button>
            </div>
          </section>
        ))}
    </div>
  );
}
