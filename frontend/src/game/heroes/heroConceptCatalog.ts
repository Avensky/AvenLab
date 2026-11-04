import type {HeroRole} from '../../store/alpha/alphaStore';

/** Research cards are deliberately separate from HEROES. A concept has no
 * vehicle model, spawn ID, ownership entry or matchmaking role reservation. */
export type VehicleConcept={
 id:string;state:'planned';name:string;shape:'truck'|'suv'|'compact'|'motorcycle'|'submarine';
 role:HeroRole;summary:string;tradeoff:string;requirements:string;tentative?:boolean;
};
export const HERO_CONCEPTS:readonly VehicleConcept[]=[
 {id:'concept-field-truck',state:'planned',name:'FIELD TRUCK',shape:'truck',role:'support',summary:'A mobile supply depot carrying limited repair and fuel reserves for the team.',tradeoff:'Large turning radius and exposed cargo make route planning and an escort valuable.',requirements:'Truck GLB, chassis collider, heavy suspension and supply-transfer gameplay.'},
 {id:'concept-motorcycle',state:'planned',name:'MOTORCYCLE',shape:'motorcycle',role:'dps',summary:'An optional fast scout or interceptor built around movement and precise attacks.',tradeoff:'High mobility with very low protection; collision and rider rules need a separate design.',requirements:'Motorcycle/rider assets, two-wheel balance, recovery and collision physics.',tentative:true},
 {id:'concept-submarine',state:'planned',name:'SUBMARINE',shape:'submarine',role:'support',summary:'An optional later naval concept for underwater scouting and objective support.',tradeoff:'Strong concealment would require limited sensors, air/energy reserves and clear counterplay.',requirements:'Submarine GLB, buoyancy, depth controls and underwater maps.',tentative:true},
];

export type HeroKitConcept={id:string;state:'planned';name:string;role:HeroRole;icon:'repair'|'lock'|'fire';summary:string;ultimate:string;counterplay:string};
export const HERO_KIT_CONCEPTS:readonly HeroKitConcept[]=[
 {id:'concept-area-healer',state:'planned',name:'PIT CREW · AREA REPAIR',role:'support',icon:'repair',summary:'A future healer maintains a small repair radius while nearby allies remain in range. Fuel or a repair reserve pays for actual healing.',ultimate:'SANCTUARY · A proposed brief team damage-immunity window. Its duration, radius, charge cost and objective restrictions still need playtesting.',counterplay:'Break the formation, force the healer to move, or wait out the announced protection. No immunity action is implemented yet.'},
 {id:'concept-hacker',state:'planned',name:'JAMMER · ENGINE DISRUPTION',role:'support',icon:'lock',summary:'A future hacker briefly interrupts a hostile engine after a clear lock-on warning.',ultimate:'BLACKOUT · A proposed short disruption zone; effects and duration remain undecided.',counterplay:'Range and line of sight, an interruptible lock-on, short restart delay, and protection from repeated chain shutdowns are required. Brakes and steering must remain usable.'},
 {id:'concept-interceptor',state:'planned',name:'INTERCEPTOR · PURE OFFENSE',role:'dps',icon:'fire',summary:'A future single-weapon DPS focuses on speed, flanking and damage. An SUV/utility variant could use a short-range spray cone with resource-limited area hits.',ultimate:'OVERDRIVE · A proposed short offensive window with a clear resource and heat cost.',counterplay:'Low armor or limited range, finite ammo/pressure/fuel, heat and exposed recovery periods prevent continuous spray or free speed/damage advantages.'},
];
