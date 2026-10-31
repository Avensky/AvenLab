import { useState } from "react";
import { AssistedInput } from "../../components/text/AssistedInput";
import type {
  SocialView,
  WorldInvitation,
} from "../../store/social/socialStore";
import { enterWorld } from "./navigation";
import type { SocialCommand } from "./types";

export function InvitationsPage({
  view,
  command,
}: {
  view: SocialView;
  command: SocialCommand;
}) {
  const [selected, setSelected] = useState<WorldInvitation | null>(null),
    [password, setPassword] = useState("");
  const join = async (invite: WorldInvitation) => {
    if (invite.locked && selected?.id !== invite.id) {
      setSelected(invite);
      setPassword("");
      return;
    }
    const result = await command(
      "world_join",
      { world_id: invite.world_id, password },
      "World joined",
    );
    if (result) {
      setPassword("");
      enterWorld(result);
    }
  };
  return (
    <div className="social-grid">
      <section className="social-card">
        <h2>WORLD INVITATIONS</h2>
        {view.world_invites.map((invite) => (
          <article className="social-invitation" key={invite.id}>
            <strong>{invite.world_name}</strong>
            <p>
              FROM {invite.from.name} ·{" "}
              {invite.locked ? "PASSWORD REQUIRED" : "OPEN INVITATION"}
            </p>
            {selected?.id === invite.id && (
              <AssistedInput
                label="INVITED WORLD PASSWORD"
                type="password"
                value={password}
                onChange={setPassword}
                maxLength={64}
                autoComplete="off"
              />
            )}
            <div className="social-actions">
              <button
                type="button"
                className="menu-control"
                onClick={() => void join(invite)}
              >
                JOIN WORLD
              </button>
              <button
                type="button"
                className="menu-control"
                onClick={() =>
                  void command(
                    "world_invite_dismiss",
                    { invite_id: invite.id },
                    "Invitation dismissed",
                  )
                }
              >
                DISMISS
              </button>
            </div>
          </article>
        ))}
        {!view.world_invites.length && (
          <p>
            No pending world invitations. Invitations expire after 15 minutes.
          </p>
        )}
      </section>
      <section className="social-card">
        <h2>TEAMMATE REQUESTS</h2>
        {view.requests
          .filter((request) => request.incoming)
          .map((request) => (
            <article className="social-person" key={request.player.id}>
              <strong>{request.player.name}</strong>
              <div className="social-actions">
                <button
                  type="button"
                  className="menu-control"
                  onClick={() =>
                    void command(
                      "friend_accept",
                      { target: request.player.id },
                      "Teammate added",
                    )
                  }
                >
                  ACCEPT
                </button>
                <button
                  type="button"
                  className="menu-control"
                  onClick={() =>
                    void command(
                      "friend_decline",
                      { target: request.player.id },
                      "Request declined",
                    )
                  }
                >
                  DECLINE
                </button>
              </div>
            </article>
          ))}
        {!view.requests.some((request) => request.incoming) && (
          <p>No teammate requests.</p>
        )}
        <h2>GROUP INVITATIONS</h2>
        {view.groups
          .filter((group) => !group.joined)
          .map((group) => (
            <article className="social-person" key={group.id}>
              <strong>{group.name}</strong>
              <div className="social-actions">
                <button
                  type="button"
                  className="menu-control"
                  onClick={() =>
                    void command(
                      "group_accept",
                      { group_id: group.id },
                      "Group joined",
                    )
                  }
                >
                  JOIN GROUP
                </button>
                <button
                  type="button"
                  className="menu-control"
                  onClick={() =>
                    void command(
                      "group_decline",
                      { group_id: group.id },
                      "Group invitation declined",
                    )
                  }
                >
                  DECLINE
                </button>
              </div>
            </article>
          ))}
        {!view.groups.some((group) => !group.joined) && (
          <p>No group invitations.</p>
        )}
      </section>
    </div>
  );
}
