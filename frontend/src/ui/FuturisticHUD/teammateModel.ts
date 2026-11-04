import { HEROES, modeTeamSize } from '../../store/alpha/alphaStore';
import { useNetworkStore } from '../../store/session/networkStore';
import { useSocialStore } from '../../store/social/socialStore';
import type { HeroAppearance } from '../../vehicles/cosmetics/heroLoadouts';
import { HUD_STALE_MS } from '../../store/telemetry/vehicleTelemetryStore';
import { combatHealth } from './resourceModel';

/** Only values displayed by a squad card belong here. Pose and cumulative
 * damage/fuel/session totals must not invalidate a portrait every sample. */
export type TeammateCard = {
  id: string;
  profileId: string | null;
  name: string;
  team: 'red' | 'blue';
  hero: string | null;
  appearance: HeroAppearance | null;
  waiting: boolean;
  status: 'active' | 'selecting' | 'ready' | 'reconnecting' | 'delayed' | 'defeated';
  health: ReturnType<typeof combatHealth>;
};
export function readTeammates(now = performance.now()): TeammateCard[] {
  const network = useNetworkStore.getState(), me = network.getMe(), view = useSocialStore.getState().view;
  if (!network.connected || !me || (me.team !== 'red' && me.team !== 'blue') || (network.room_id !== null && network.room_id !== me.room_id)) return [];
  const received = network.snapshot?.received_at_ms;
  const fresh = received !== undefined && Number.isFinite(received) && now >= received && now - received <= HUD_STALE_MS;
  const members = view?.worlds.find(world => world.id === me.room_id)?.members ?? [];
  const roster = (view?.alpha?.roster ?? []).filter(card => card.world_id === me.room_id && card.team === me.team && card.id !== view?.profile.id);
  const membersByPlayer = new Map(members.map(member => [member.player_id, member]));
  const cardsByProfile = new Map(roster.map(card => [card.id, card]));
  const present = new Set<string>();
  const rows: TeammateCard[] = [];
  for (const entity of network.snapshot?.entities ?? []) {
    if (entity.id === me.id || entity.room_id !== me.room_id || entity.team !== me.team) continue;
    const member = membersByPlayer.get(entity.id), profileId = member?.profile_id ?? null;
    const card = profileId ? cardsByProfile.get(profileId) : undefined;
    if (profileId) present.add(profileId);
    const hero = HEROES.find(hero => hero.id === card?.hero && hero.vehicle === entity.vehicle_id) ?? HEROES.find(hero => hero.id === entity.vehicle_id);
    const health = fresh ? combatHealth(entity) : null;
    if (health) {health.hp = Math.ceil(health.hp); health.protection = health.protection > 0 ? 1 : 0;}
    rows.push({id: entity.id, profileId, name: member?.name ?? card?.name ?? 'UNKNOWN PLAYER', team: me.team,
      hero: hero?.id ?? null, appearance: entity.appearance ?? card?.appearance ?? null,
      waiting: false, status: card?.reconnecting ? 'reconnecting' : !fresh ? 'delayed' : health?.defeated ? 'defeated' : 'active', health});
  }
  // Admission, rather than spatial proximity, keeps selecting/reconnecting
  // teammates visible even when their physics body is temporarily absent.
  for (const card of roster) {
    if (present.has(card.id)) continue;
    const hero = HEROES.find(hero => hero.id === (card.hero || card.showcase_hero));
    rows.push({id: `profile:${card.id}`, profileId: card.id, name: card.name, team: me.team,
      hero: hero?.id ?? null, appearance: card.appearance ?? null, waiting: true,
      status: card.reconnecting ? 'reconnecting' : card.hero ? 'ready' : 'selecting', health: null});
  }
  const active = view?.alpha?.active;
  const count = modeTeamSize(active?.mode ?? network.snapshot?.match_state?.mode ?? '', active?.team_size ?? network.snapshot?.match_state?.team_size) - 1;
  return rows.sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, count);
}
const sameAppearance = (a: HeroAppearance | null, b: HeroAppearance | null) => a === b || !!a && !!b &&
  a.body === b.body && a.finish === b.finish && a.seats === b.seats && a.skin === b.skin;
export function sameTeammateCard(a: TeammateCard, b: TeammateCard) {
  return a.id === b.id && a.profileId === b.profileId && a.name === b.name && a.team === b.team && a.hero === b.hero &&
    a.waiting === b.waiting && a.status === b.status && sameAppearance(a.appearance, b.appearance) &&
    (a.health === b.health || !!a.health && !!b.health && a.health.hp === b.health.hp && a.health.max === b.health.max && a.health.defeated === b.health.defeated && a.health.protection === b.health.protection);
}
export function retainTeammateCards(previous: TeammateCard[], next: TeammateCard[]) {
  const byId = new Map(previous.map(card => [card.profileId ?? card.id, card]));
  const stable = next.map(card => {
    const old = byId.get(card.profileId ?? card.id);
    return old && sameTeammateCard(old, card) ? old : card;
  });
  return stable.length === previous.length && stable.every((card, i) => card === previous[i]) ? previous : stable;
}
