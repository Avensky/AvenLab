# Match results

`MatchResultsScreen` is an overlay over the existing world or garage. It renders
the archived `CareerMatch` contract shared with Career, with Awards, Team and
Stats views available for both live results and history.

- `receiveMatchResult(packet)` validates a server record and opens it for its
  local participant. A bounded per-profile match ID set prevents duplicate
  packets from reopening a result after the player leaves or queues again.
- `openStoredMatch(record)` accepts a record or the `career_match` response
  wrapper `{match: record}`. Back restores the exact calling screen/overlay.
  History cannot send leave or queue requests.
- `leaveMatchResults()` waits for `mode_leave`; `playAgainFromResults()` then
  uses the existing mode admission flow. Errors leave the result visible with a
  retry. `closeMatchResults()` only dismisses a live result after leaving.

Wins, team scores, awards and highlight windows come from the server. The UI
does not infer awards or personal-best flags from current career aggregates.
Portraits use each participant's archived appearance, not the viewer's garage.
Play of the Game currently displays its confirmed event window and totals;
cinematic replay capture and ranked MMR are labeled pending.

Run `node --test tests/match-results.test.mjs` from `frontend` for packet bounds,
outcomes, duplicate delivery, saved appearances, modal input ownership, history
restoration and acknowledged leave/requeue behavior.
