import {AttackIcon} from '../../combat/AttackIcon';
import {HERO_CONCEPTS,HERO_KIT_CONCEPTS,type VehicleConcept} from './heroConceptCatalog';

function ConceptSilhouette({shape}:{shape:VehicleConcept['shape']}){
 return <svg className="hero-concept-silhouette" viewBox="0 0 160 90" aria-hidden="true">
  {shape==='submarine'?<><path d="M23 48c0-14 15-22 48-22h38c22 0 30 12 30 22s-8 22-30 22H71c-33 0-48-8-48-22Z"/><path d="M70 26V15h23v11m-11-11V9h14M139 48l12-10v20Z"/></>:shape==='motorcycle'?<><circle cx="39" cy="65" r="18"/><circle cx="123" cy="65" r="18"/><path d="m39 65 28-34 17 34H39l36-19h42m6 19-18-43h-14m-32 9h23"/></>:<>
   <path d={shape==='truck'?'M15 57V22h79v35m0-24h28l22 21v12H15V57Z':shape==='suv'?'M15 57 30 27h74l25 21 17 9v12H15Z':'M19 58 41 37h59l26 14 15 7v11H19Z'}/>
   <circle cx="43" cy="67" r="12"/><circle cx="119" cy="67" r="12"/>
   <path d={shape==='truck'?'M106 39h13l14 14h-27Z':shape==='suv'?'M36 34h26v18H27m44-18h27l21 18H71Z':'M46 43h22v14H33m43-14h20l19 14H76Z'}/>
  </>}
 </svg>;
}

/** Read-only design reference. No card is a hero picker, unlock or spawn action. */
export function HeroConceptGallery(){
 return <main className="hero-concept-gallery" aria-label="Planned hero concepts">
  <header><small>DESIGN PREVIEW</small><h1>FUTURE VEHICLES & KITS</h1><p>These concepts need assets, physics and gameplay testing before deployment. The live roster remains unchanged.</p></header>
  <section aria-labelledby="vehicle-concepts-title"><h2 id="vehicle-concepts-title">VEHICLE FOUNDATIONS</h2><div className="hero-concept-grid">{HERO_CONCEPTS.map(concept=><article key={concept.id} data-vehicle-concept={concept.id} data-planned="true">
   <div className="hero-concept-art"><ConceptSilhouette shape={concept.shape}/><span>NEEDS ASSET & PHYSICS</span></div>
   <small>{concept.role.toUpperCase()} · {concept.tentative?'OPTIONAL CONCEPT':'PLANNED'}</small><h3>{concept.name}</h3><p>{concept.summary}</p><p><strong>TRADEOFF · </strong>{concept.tradeoff}</p><p className="hero-concept-needs">{concept.requirements}</p>
  </article>)}</div></section>
  <section aria-labelledby="kit-concepts-title"><h2 id="kit-concepts-title">PLANNED HERO KITS</h2><div className="hero-concept-kit-grid">{HERO_KIT_CONCEPTS.map(concept=><article key={concept.id} data-kit-concept={concept.id} data-planned="true">
   <header><span className="hero-ability-icon"><AttackIcon kind={concept.icon}/></span><div><small>{concept.role.toUpperCase()} · PLANNED</small><h3>{concept.name}</h3></div></header><p>{concept.summary}</p><p><strong>ULTIMATE CONCEPT · </strong>{concept.ultimate}</p><p className="hero-concept-needs">{concept.counterplay}</p>
  </article>)}</div></section>
 </main>;
}
