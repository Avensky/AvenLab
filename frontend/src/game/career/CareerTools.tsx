import {useRef,useState} from 'react';
import {useSocialStore} from '../../store/social/socialStore';
import {usePreferencesStore} from '../../store/preferences/preferencesStore';
import {vehicleCatalog} from '../../store/selection/selectionStore';
import {requestSocial} from '../../net/socialClient';
import type {CareerTab} from './careerViewStore';

const goals=[['First capture','Return an enemy flag to your base.'],['Supply line','Complete a team resupply during a match.'],['Efficient operator','Finish an objective with fuel in reserve.'],['Keep your cool','Complete a match without overheating.']];

/** Keep the existing server-authorized voucher and favorite tools accessible
 * beside career records. Browsing statistics never changes a loadout. */
export function CareerTools({tab}:{tab:CareerTab}) {
 const view=useSocialStore(state=>state.view),p=view?.profile.progression;
 const favorites=usePreferencesStore(state=>state.favoriteVehicles),toggleFavorite=usePreferencesStore(state=>state.toggleFavorite);
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),pending=useRef(false);
 const skinAction=async(skin:string,owned:boolean)=>{
  if(pending.current)return;pending.current=true;setBusy(true);setStatus('');
  try{await requestSocial(owned?'skin_equip':'skin_redeem',{skin});setStatus(owned?'Skin selection saved':'Skin voucher redeemed');}
  catch(error){setStatus(error instanceof Error?error.message:'Could not update the skin voucher.');}
  finally{pending.current=false;setBusy(false);}
 };
 if(tab==='progression')return <section className="career-tools"><p className="career-eyebrow">PLAYER PROGRESSION</p><h2>Your next milestone</h2><p>Competitive tiers follow verified wins. Driver levels run 1–100, then advance prestige. Training awards no XP or ranked wins.</p><dl className="career-progression">
  <div><dt>Competitive tier</dt><dd>{p?`${p.tier} · ${p.competitive_wins} wins`:'—'}</dd></div>
  <div><dt>Driver level / prestige</dt><dd>{p?`LV ${p.level}/100 · PRESTIGE ${p.prestige}`:'—'}</dd></div>
  <div><dt>Next level</dt><dd>{p?`${p.xp} / ${p.required_xp} XP`:'—'}{p&&<progress aria-label="Next level progress" value={p.xp} max={p.required_xp}/>}</dd></div>
  <div><dt>Quickplay wins</dt><dd>{p?.quickplay_wins??'—'}</dd></div>
  <div><dt>Milestone credits</dt><dd>{p?`${p.credits} · NEXT LV ${p.next_milestone}`:'—'}</dd></div>
 </dl>{!p&&<p>Connect your player profile to view progression.</p>}</section>;
 if(tab==='favorites')return <section className="career-tools"><p className="career-eyebrow">YOUR GARAGE</p><h2>Favorite vehicles</h2><p>Keep a shortlist. Favorites do not change your main hero or vehicle physics.</p><div className="career-tool-list" data-controller-row data-controller-columns="1">{vehicleCatalog.map(vehicle=><button type="button" key={vehicle.id} className="career-tool-row" data-menu-row={vehicle.id} aria-pressed={favorites.includes(vehicle.id)} onClick={()=>toggleFavorite(vehicle.id)}><span><strong>{vehicle.name}</strong><small>{vehicle.role.toUpperCase()} · {vehicle.description}</small></span><span>{favorites.includes(vehicle.id)?'★ Favorite':'☆ Add favorite'}</span></button>)}</div></section>;
 if(tab==='customize')return <section className="career-tools"><p className="career-eyebrow">MILESTONE REWARDS</p><h2>Skin vouchers <small>{p?.credits??'—'} credits</small></h2><p>Redeem credits for alpha skin vouchers. Ownership and the selected voucher are saved to your player on the server. Hero paint and material choices are available in Heroes.</p><div className="career-tool-list" data-controller-row data-controller-columns="1">{(view?.alpha?.skins??[]).map(skin=>{const owned=!!p?.owned.includes(skin.id),selected=p?.equipped===skin.id;return <button type="button" key={skin.id} className="career-tool-row" data-menu-row={skin.id} disabled={busy||!p||selected||(!owned&&p.credits<skin.cost)} onClick={()=>void skinAction(skin.id,owned)}><span><strong>{skin.name}</strong><small>{owned?'Owned voucher':`${skin.cost} milestone credits`}</small></span><span>{selected?'SELECTED':owned?'CHOOSE':`${skin.cost} CREDITS`}</span></button>;})}</div>{!view?.alpha?.skins.length&&<p>Connect your player profile to view available vouchers.</p>}<p role="status" aria-live="polite">{busy?'SAVING…':status}</p></section>;
 if(tab==='achievements')return <section className="career-tools"><p className="career-eyebrow">COMING LATER</p><h2>Achievements</h2><p>These goals are planned. They are not tracked, earned or claimable rewards.</p><div className="career-tool-list">{goals.map(([label,description])=><div key={label} className="career-tool-row"><span><strong>{label}</strong><small>{description}</small></span><span>NOT TRACKED</span></div>)}</div></section>;
 return <section className="career-empty"><span aria-hidden="true">↗</span><h2>Leaderboard</h2><p>Ranked standings are pending. Your verified match records remain available in Statistics and History.</p></section>;
}
