//! Server-owned capture-the-flag rules. Inputs are world-local body observations;
//! transports, profiles and client claims never determine score or the winner.
use crate::spawn::Team;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

pub const ROUND_DURATION_S: f32 = 15.0 * 60.0;
pub const CAPTURES_TO_WIN: u32 = 3;
pub const FLAG_RADIUS: f32 = 3.0;
pub const CARRIER_SPEED_FACTOR: f32 = 0.8;
pub const CARRIER_DAMAGE_FACTOR: f32 = 1.2;
/// A short event tail survives snapshot coalescing without unbounded payloads.
const FLAG_EVENT_HISTORY_LIMIT: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CtfPhase { Waiting, Running, Ended }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FlagStatus { Home, Carried, Dropped }
#[derive(Debug, Clone, Default, Serialize)]
pub struct CtfScores { pub red: u32, pub blue: u32 }
impl CtfScores {
    fn add(&mut self, team: Team) -> u32 { let score=match team {Team::Red=>&mut self.red,Team::Blue=>&mut self.blue};*score+=1;*score }
}
#[derive(Debug, Clone, Serialize)]
pub struct CtfFlag {
    pub team: Team,
    pub base: [f32;3],
    pub position: [f32;3],
    pub status: FlagStatus,
    pub carrier: Option<String>,
    pub return_remaining_s: f32,
}
impl CtfFlag {
    fn home(team:Team,base:[f32;3])->Self {Self{team,base,position:base,status:FlagStatus::Home,carrier:None,return_remaining_s:0.0}}
    fn return_home(&mut self){self.position=self.base;self.status=FlagStatus::Home;self.carrier=None;self.return_remaining_s=0.0;}
    fn drop(&mut self){self.status=FlagStatus::Dropped;self.carrier=None;self.return_remaining_s=0.0;}
}
#[derive(Debug, Clone)]
pub struct CtfPlayer {pub player_id:String,pub team:Team,pub position:[f32;3],pub alive:bool,pub resetting:bool,pub grounded:bool,pub vehicle_id:Option<String>}
#[derive(Debug, Clone, Default, Serialize)]
pub struct CtfObjectiveStats {pub captures:u32,pub flag_returns:u32,pub pickups:u32,pub carry_time_s:f32}
#[derive(Debug, Clone, Serialize)]
pub struct CtfCaptureEvent {pub player_id:String,pub team:Team,pub elapsed_s:f32}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CtfFlagEventKind { PickedUp, Dropped, Returned, Captured }
#[derive(Debug, Clone, Serialize)]
pub struct CtfFlagEvent {
    pub seq:u64,pub kind:CtfFlagEventKind,pub flag_team:Team,
    pub player_id:Option<String>,pub elapsed_s:f32,
}
#[derive(Debug, Clone, Serialize)]
pub struct CtfCompletion {
    pub match_id:String,pub mode:String,pub team_size:usize,pub training:bool,pub duration_s:f32,
    pub scores:CtfScores,pub winner:Option<Team>,
    pub objectives:HashMap<String,CtfObjectiveStats>,pub capture_events:Vec<CtfCaptureEvent>,
}
#[derive(Debug, Clone, Serialize)]
pub struct CtfView {
    pub match_id:String,pub mode:String,pub team_size:usize,pub training:bool,pub phase:CtfPhase,
    pub elapsed_s:f32,pub remaining_s:f32,pub duration_s:f32,pub captures_to_win:u32,
    pub scores:CtfScores,pub flags:[CtfFlag;2],pub winner:Option<Team>,
    pub events:Vec<CtfFlagEvent>,
}
#[derive(Debug, Clone)]
pub struct CtfRound {
    pub match_id:String,pub mode:String,pub team_size:usize,pub training:bool,pub phase:CtfPhase,
    pub elapsed_s:f32,pub duration_s:f32,pub bases:[[f32;3];2],pub flags:[CtfFlag;2],
    pub scores:CtfScores,
    objectives:HashMap<String,CtfObjectiveStats>,capture_events:Vec<CtfCaptureEvent>,
    previous:HashMap<String,CtfPlayer>,last_safe:HashMap<String,[f32;3]>,last_capture:Option<Team>,completion:Option<CtfCompletion>,
    events:Vec<CtfFlagEvent>,event_sequence:u64,
}
fn index(team:Team)->usize {match team{Team::Red=>0,Team::Blue=>1}}
fn near(a:[f32;3],b:[f32;3])->bool {let x=a[0]-b[0];let z=a[2]-b[2];x*x+z*z<=FLAG_RADIUS*FLAG_RADIUS&&(a[1]-b[1]).abs()<=4.0}
/// Earliest contact with the pickup cylinder during a completed physics step.
/// Horizontal and vertical intervals must overlap; proximity on another floor
/// is not contact, and a fast step cannot tunnel straight through an objective.
fn contact_time(from:[f32;3],to:[f32;3],flag:[f32;3])->Option<f32>{
    if !finite(from)||!finite(to)||!finite(flag){return None;}
    let x=from[0]-flag[0];let z=from[2]-flag[2];let dx=to[0]-from[0];let dz=to[2]-from[2];
    let a=dx*dx+dz*dz;let c=x*x+z*z-FLAG_RADIUS*FLAG_RADIUS;
    let (mut enter,mut exit)=if a<=f32::EPSILON{if c>0.0{return None;}(0.0,1.0)}else{
        let b=2.0*(x*dx+z*dz);let d=b*b-4.0*a*c;if d<0.0{return None;}
        let root=d.sqrt();(((-b-root)/(2.0*a)).max(0.0),((-b+root)/(2.0*a)).min(1.0))
    };
    let y=from[1]-flag[1];let dy=to[1]-from[1];
    if dy.abs()<=f32::EPSILON{if y.abs()>4.0{return None;}}else{
        let a=(-4.0-y)/dy;let b=(4.0-y)/dy;enter=enter.max(a.min(b));exit=exit.min(a.max(b));
    }
    (enter<=exit&&enter<=1.0&&exit>=0.0).then_some(enter.max(0.0))
}
fn finite(p:[f32;3])->bool {p.iter().all(|v|v.is_finite())}
fn teleported(a:[f32;3],b:[f32;3])->bool {a.iter().zip(b).map(|(x,y)|(x-y)*(x-y)).sum::<f32>()>144.0}
impl CtfRound {
    pub fn new(mode:&str,training:bool,bases:[[f32;3];2])->Result<Self,String>{
        if !bases.iter().all(|p|finite(*p))||near(bases[0],bases[1]) {return Err("CTF requires two distinct authored team bases.".into());}
        let dx=bases[0][0]-bases[1][0];let dz=bases[0][2]-bases[1][2];
        if dx*dx+dz*dz<144.0{return Err("CTF team bases must be at least 12 metres apart.".into());}
        Ok(Self{match_id:uuid::Uuid::new_v4().to_string(),mode:mode.into(),team_size:if mode=="skirmish" {3}else{5},training,phase:CtfPhase::Waiting,elapsed_s:0.0,duration_s:ROUND_DURATION_S,bases,flags:[CtfFlag::home(Team::Red,bases[0]),CtfFlag::home(Team::Blue,bases[1])],scores:CtfScores::default(),objectives:HashMap::new(),capture_events:Vec::new(),previous:HashMap::new(),last_safe:HashMap::new(),last_capture:None,completion:None,events:Vec::new(),event_sequence:0})
    }
    pub fn start(&mut self,players:&[CtfPlayer])->Result<(),String>{
        if self.phase!=CtfPhase::Waiting{return Err("This round has already started.".into());}
        if ![Team::Red,Team::Blue].iter().all(|team|players.iter().any(|p|p.team==*team&&p.alive&&finite(p.position))){return Err("Both teams need a spawned vehicle.".into());}
        // Warmup contact is playable, but its flags and statistics never enter
        // the scored round. The world has already reset vehicles and inputs.
        self.flags=[CtfFlag::home(Team::Red,self.bases[0]),CtfFlag::home(Team::Blue,self.bases[1])];
        self.objectives.clear();self.capture_events.clear();self.events.clear();self.scores=CtfScores::default();self.last_capture=None;self.completion=None;self.elapsed_s=0.0;
        self.previous=players.iter().map(|p|(p.player_id.clone(),p.clone())).collect();
        self.last_safe=players.iter().filter(|p|p.alive&&p.grounded&&finite(p.position)).map(|p|(p.player_id.clone(),p.position)).collect();
        for p in players{self.objectives.entry(p.player_id.clone()).or_default();}
        self.phase=CtfPhase::Running;Ok(())
    }
    pub fn view(&self)->CtfView{CtfView{match_id:self.match_id.clone(),mode:self.mode.clone(),team_size:self.team_size,training:self.training,phase:self.phase,elapsed_s:self.elapsed_s,remaining_s:(self.duration_s-self.elapsed_s).max(0.0),duration_s:self.duration_s,captures_to_win:CAPTURES_TO_WIN,scores:self.scores.clone(),flags:self.flags.clone(),winner:self.completion.as_ref().and_then(|c|c.winner),events:self.events.clone()}}
    pub fn carriers(&self)->HashSet<String>{self.flags.iter().filter_map(|f|f.carrier.clone()).collect()}
    pub fn completion(&self)->Option<&CtfCompletion>{self.completion.as_ref()}
    /// Leaving drops immediately at the last observed location, before body removal.
    pub fn remove_player(&mut self,id:&str){
        let mut dropped=Vec::new();
        for flag in &mut self.flags{if flag.carrier.as_deref()==Some(id){flag.position=self.last_safe.get(id).copied().unwrap_or(flag.base);flag.drop();dropped.push(flag.team);}}
        for team in dropped{self.record_flag_event(CtfFlagEventKind::Dropped,team,Some(id.to_owned()));}
        self.previous.remove(id);self.last_safe.remove(id);
    }
    fn record_flag_event(&mut self,kind:CtfFlagEventKind,flag_team:Team,player_id:Option<String>){
        self.event_sequence=self.event_sequence.saturating_add(1);
        self.events.push(CtfFlagEvent{seq:self.event_sequence,kind,flag_team,player_id,elapsed_s:self.elapsed_s});
        if self.events.len()>FLAG_EVENT_HISTORY_LIMIT{self.events.remove(0);}
    }
    fn finish(&mut self,winner:Option<Team>){
        if self.phase!=CtfPhase::Running{return;}
        self.phase=CtfPhase::Ended;
        self.completion=Some(CtfCompletion{match_id:self.match_id.clone(),mode:self.mode.clone(),team_size:self.team_size,training:self.training,duration_s:self.elapsed_s,scores:self.scores.clone(),winner,objectives:self.objectives.clone(),capture_events:self.capture_events.clone()});
    }
    pub fn tick(&mut self,dt:f32,players:&[CtfPlayer]){
        if self.phase==CtfPhase::Ended||!dt.is_finite()||dt<=0.0{return;}
        let scored=self.phase==CtfPhase::Running;
        let dt=dt.min(0.1).min(if scored{(self.duration_s-self.elapsed_s).max(0.0)}else{0.1});
        if scored{self.elapsed_s+=dt;}
        let mut ordered:Vec<_>=players.iter().collect();ordered.sort_by(|a,b|a.player_id.cmp(&b.player_id));
        let mut invalid=HashSet::new();
        for p in &ordered{
            if scored{self.objectives.entry(p.player_id.clone()).or_default();}
            let below_safe=self.last_safe.get(&p.player_id).is_some_and(|safe|p.position[1]<safe[1]-8.0);
            if !p.alive||p.resetting||!finite(p.position)||below_safe||self.previous.get(&p.player_id).is_some_and(|old|old.vehicle_id!=p.vehicle_id||teleported(old.position,p.position)){invalid.insert(p.player_id.clone());}
            else if p.grounded{self.last_safe.insert(p.player_id.clone(),p.position);}
        }
        let mut dropped=Vec::new();
        for flag in &mut self.flags{
            // A dropped objective waits for physical contact. Returning a flag
            // on an unattended timer would bypass the rescue/defend contest.
            if let Some(id)=flag.carrier.clone(){
                if let Some(p)=ordered.iter().find(|p|p.player_id==id).filter(|_|!invalid.contains(&id)){
                    flag.position=p.position;
                    if scored{self.objectives.entry(id).or_default().carry_time_s+=dt;}
                }else{
                    // Water/abyss deaths leave the objective at the carrier's
                    // last grounded point, rather than stranding it below map.
                    flag.position=self.last_safe.get(&id).copied().unwrap_or(flag.base);flag.drop();dropped.push((flag.team,id));
                }
            }
        }
        for (team,id) in dropped{self.record_flag_event(CtfFlagEventKind::Dropped,team,Some(id));}
        for flag_index in 0..self.flags.len(){
            let flag=&self.flags[flag_index];
            if flag.status==FlagStatus::Carried{continue;}
            let mut touches:Vec<_>=ordered.iter().filter_map(|p|{
                if invalid.contains(&p.player_id)||(p.team==flag.team&&flag.status!=FlagStatus::Dropped)||
                    (p.team!=flag.team&&self.flags.iter().any(|f|f.carrier.as_deref()==Some(&p.player_id))){return None;}
                let previous=self.previous.get(&p.player_id).map(|p|p.position).unwrap_or(p.position);
                contact_time(previous,p.position,flag.position).map(|time|(time,*p))
            }).collect();
            // Interpolate first entry during this simulation step. UUID is only
            // a deterministic tie-break for genuinely simultaneous contact.
            touches.sort_by(|(ta,a),(tb,b)|ta.total_cmp(tb).then_with(||a.player_id.cmp(&b.player_id)));
            let Some((_,player))=touches.first()else{continue;};
            let flag=&mut self.flags[flag_index];
            if player.team==flag.team{
                flag.return_home();if scored{self.objectives.entry(player.player_id.clone()).or_default().flag_returns+=1;}
            }else{
                flag.status=FlagStatus::Carried;flag.carrier=Some(player.player_id.clone());flag.position=player.position;flag.return_remaining_s=0.0;
                if scored{self.objectives.entry(player.player_id.clone()).or_default().pickups+=1;}
            }
            let team=flag.team;let kind=if player.team==team{CtfFlagEventKind::Returned}else{CtfFlagEventKind::PickedUp};
            self.record_flag_event(kind,team,Some(player.player_id.clone()));
        }
        if scored{for p in &ordered{
            let own=index(p.team);let enemy=1-own;
            if !invalid.contains(&p.player_id)&&self.flags[own].status==FlagStatus::Home&&self.flags[enemy].carrier.as_deref()==Some(&p.player_id)&&near(p.position,self.bases[own]){
                self.flags[enemy].return_home();self.objectives.entry(p.player_id.clone()).or_default().captures+=1;
                self.capture_events.push(CtfCaptureEvent{player_id:p.player_id.clone(),team:p.team,elapsed_s:self.elapsed_s});self.last_capture=Some(p.team);
                self.record_flag_event(CtfFlagEventKind::Captured,self.flags[enemy].team,Some(p.player_id.clone()));
                if self.scores.add(p.team)>=CAPTURES_TO_WIN{self.finish(Some(p.team));break;}
            }
        }}
        self.previous=players.iter().map(|p|(p.player_id.clone(),p.clone())).collect();
        if scored&&self.phase==CtfPhase::Running&&self.elapsed_s>=self.duration_s{
            let winner=match self.scores.red.cmp(&self.scores.blue){std::cmp::Ordering::Greater=>Some(Team::Red),std::cmp::Ordering::Less=>Some(Team::Blue),std::cmp::Ordering::Equal=>self.last_capture};self.finish(winner);
        }
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    fn player(id:&str,team:Team,x:f32)->CtfPlayer{CtfPlayer{player_id:id.into(),team,position:[x,1.0,0.0],alive:true,resetting:false,grounded:true,vehicle_id:Some("brz".into())}}
    fn setup()->(CtfRound,Vec<CtfPlayer>){let mut r=CtfRound::new("quickplay",false,[[0.0,1.0,0.0],[30.0,1.0,0.0]]).unwrap();let p=vec![player("r",Team::Red,0.0),player("b",Team::Blue,30.0)];r.start(&p).unwrap();(r,p)}
    fn move_to(r:&mut CtfRound,p:&mut [CtfPlayer],i:usize,x:f32){while (p[i].position[0]-x).abs()>0.001{p[i].position[0]+=(x-p[i].position[0]).clamp(-5.0,5.0);r.tick(0.1,p);}}
    #[test]fn captures_three_then_completion_is_immutable(){let(mut r,mut p)=setup();p[1].position[2]=10.0;for _ in 0..3{move_to(&mut r,&mut p,0,30.0);assert_eq!(r.flags[1].carrier.as_deref(),Some("r"));move_to(&mut r,&mut p,0,0.0);}assert_eq!(r.phase,CtfPhase::Ended);assert_eq!(r.completion().unwrap().winner,Some(Team::Red));let end=r.elapsed_s;r.tick(0.1,&p);assert_eq!(r.elapsed_s,end);assert_eq!(r.scores.red,3);assert_eq!(r.completion().unwrap().objectives["r"].captures,3);}
    #[test]fn death_reset_model_change_and_teleport_drop_without_capture(){for cause in 0..4{let(mut r,mut p)=setup();p[1].position[2]=10.0;move_to(&mut r,&mut p,0,30.0);match cause{0=>p[0].alive=false,1=>p[0].resetting=true,2=>p[0].vehicle_id=Some("tank".into()),_=>p[0].position=[0.0,1.0,0.0]};r.tick(0.1,&p);assert_eq!(r.flags[1].status,FlagStatus::Dropped);assert_eq!(r.flags[1].position[0],30.0);assert_eq!(r.scores.red,0);}}
    #[test]fn friendly_touch_returns_but_unattended_drop_waits(){let(mut r,mut p)=setup();p[1].position[2]=10.0;move_to(&mut r,&mut p,0,30.0);move_to(&mut r,&mut p,0,20.0);r.remove_player("r");assert_eq!(r.flags[1].status,FlagStatus::Dropped);p.remove(0);p[0].position=[20.0,1.0,5.0];r.tick(0.1,&p);p[0].position=[20.0,1.0,0.0];r.tick(0.1,&p);assert_eq!(r.flags[1].status,FlagStatus::Home);assert_eq!(r.objectives["b"].flag_returns,1);
        p[0].position=[0.0,1.0,0.0];r.tick(0.1,&p);r.tick(0.1,&p);assert_eq!(r.flags[0].status,FlagStatus::Carried);r.remove_player("b");for _ in 0..301{r.tick(0.1,&[]);}assert_eq!(r.flags[0].status,FlagStatus::Dropped);assert_eq!(r.flags[0].return_remaining_s,0.0);}
    #[test]fn cannot_capture_with_own_flag_away(){let(mut r,mut p)=setup();move_to(&mut r,&mut p,0,30.0);move_to(&mut r,&mut p,1,0.0);move_to(&mut r,&mut p,0,0.0);assert_eq!(r.scores.red,0);assert_eq!(r.flags[1].carrier.as_deref(),Some("r"));}
    #[test]
    fn capture_requires_contact_with_own_base_not_the_enemy_base_or_its_approach(){
        let(mut round,mut players)=setup();players[1].position[2]=10.0;
        move_to(&mut round,&mut players,0,30.0);
        assert_eq!(round.flags[1].carrier.as_deref(),Some("r"));
        round.tick(0.1,&players);
        assert_eq!(round.scores.red,0,"taking the enemy flag at its base does not capture it");
        move_to(&mut round,&mut players,0,FLAG_RADIUS+0.001);
        assert_eq!(round.scores.red,0,"the carrier must enter its own capture radius");
        players[0].position[0]=FLAG_RADIUS;round.tick(0.1,&players);
        assert_eq!(round.scores.red,1);
        assert_eq!(round.flags[1].status,FlagStatus::Home);
        assert_eq!(round.capture_events.len(),1);
        round.tick(0.1,&players);
        assert_eq!(round.scores.red,1,"remaining at base cannot score the same flag twice");
    }
    #[test]
    fn dropped_own_flag_blocks_waiting_carrier_until_a_teammate_physically_returns_it(){
        let(mut round,mut players)=setup();players[1].position[2]=10.0;
        move_to(&mut round,&mut players,0,30.0);
        move_to(&mut round,&mut players,1,0.0);
        players[1].position[2]=0.0;round.tick(0.1,&players);
        assert_eq!(round.flags[0].carrier.as_deref(),Some("b"));
        move_to(&mut round,&mut players,1,15.0);
        players[1].position[2]=10.0;round.tick(0.1,&players);
        players[1].alive=false;round.tick(0.1,&players);
        assert_eq!(round.flags[0].status,FlagStatus::Dropped);
        assert_eq!(round.flags[0].position,[15.0,1.0,10.0]);
        move_to(&mut round,&mut players,0,0.0);
        assert_eq!(round.scores.red,0,"an own flag lying away from base cannot enable capture");
        assert_eq!(round.flags[1].carrier.as_deref(),Some("r"));
        assert!(round.capture_events.is_empty());
        let mut returner=player("returner",Team::Red,15.0);returner.position[2]=10.0;
        players.push(returner);round.tick(0.1,&players);
        assert_eq!(round.flags[0].status,FlagStatus::Home);
        assert_eq!(round.objectives["returner"].flag_returns,1);
        assert_eq!(round.scores.red,1,"returning the home flag enables the carrier already waiting at base");
        assert_eq!(round.objectives["r"].captures,1);
        assert_eq!(round.flags[1].status,FlagStatus::Home);
        round.tick(0.1,&players);assert_eq!(round.scores.red,1);assert_eq!(round.capture_events.len(),1);
        let events=round.view().events;
        assert_eq!(events.iter().map(|e|e.kind).collect::<Vec<_>>(),vec![CtfFlagEventKind::PickedUp,CtfFlagEventKind::PickedUp,CtfFlagEventKind::Dropped,CtfFlagEventKind::Returned,CtfFlagEventKind::Captured]);
        assert_eq!(events.iter().map(|e|e.seq).collect::<Vec<_>>(),vec![1,2,3,4,5]);
        assert_eq!(events[2].flag_team,Team::Red);assert_eq!(events[2].player_id.as_deref(),Some("b"));
        assert_eq!(events[3].player_id.as_deref(),Some("returner"));
        assert_eq!(events[4].flag_team,Team::Blue);assert_eq!(events[4].player_id.as_deref(),Some("r"));
    }
    #[test]
    fn flag_event_tail_is_bounded_and_start_clears_warmup_without_reusing_sequence_numbers(){
        let mut round=CtfRound::new("quickplay",false,[[0.0,1.0,0.0],[30.0,1.0,0.0]]).unwrap();
        let mut players=vec![player("first",Team::Red,30.0)];
        for _ in 0..20{
            round.tick(0.1,&players);round.remove_player("first");round.remove_player("first");
        }
        let events=round.view().events;
        assert_eq!(events.len(),FLAG_EVENT_HISTORY_LIMIT);assert_eq!(events.first().unwrap().seq,25);assert_eq!(events.last().unwrap().seq,40);
        assert!(events.iter().all(|event|event.elapsed_s==0.0));assert_eq!(round.scores.red,0);
        let mut opponent=player("opponent",Team::Blue,30.0);opponent.position[2]=10.0;players.push(opponent);
        round.start(&players).unwrap();assert!(round.view().events.is_empty(),"a round reset is not a physical flag return");
        round.tick(0.1,&players);
        let events=round.view().events;assert_eq!(events.len(),1);assert_eq!(events[0].seq,41);assert_eq!(events[0].kind,CtfFlagEventKind::PickedUp);
        assert_eq!(events[0].player_id.as_deref(),Some("first"));assert_eq!(events[0].flag_team,Team::Blue);
        let json=serde_json::to_value(&events[0]).unwrap();assert_eq!(json["kind"],"picked_up");assert_eq!(json["flag_team"],"blue");assert_eq!(json["seq"],41);
    }
    #[test]fn timeout_draw_and_last_capture_tiebreak(){let(mut r,p)=setup();r.duration_s=0.1;r.tick(0.1,&p);assert_eq!(r.completion().unwrap().winner,None);let(mut r,p)=setup();r.scores=CtfScores{red:1,blue:1};r.last_capture=Some(Team::Blue);r.duration_s=0.1;r.tick(0.1,&p);assert_eq!(r.completion().unwrap().winner,Some(Team::Blue));}
    #[test]fn first_warmup_entrant_can_carry_without_scoring_then_start_resets_everything(){
        let mut round=CtfRound::new("quickplay",false,[[0.0,1.0,0.0],[30.0,1.0,0.0]]).unwrap();
        let mut players=vec![player("first",Team::Red,0.0)];
        move_to(&mut round,&mut players,0,30.0);assert_eq!(round.flags[1].carrier.as_deref(),Some("first"));
        move_to(&mut round,&mut players,0,0.0);assert_eq!(round.scores.red,0);assert_eq!(round.phase,CtfPhase::Waiting);
        assert_eq!(round.elapsed_s,0.0);assert!(round.objectives.is_empty());assert!(round.completion().is_none());
        players.push(player("opponent",Team::Blue,30.0));round.start(&players).unwrap();
        assert_eq!(round.flags[1].status,FlagStatus::Home);assert!(round.carriers().is_empty());assert_eq!(round.objectives["first"].pickups,0);
    }
    #[test]fn earliest_contact_wins_instead_of_uuid_order_and_dropped_defender_priority(){
        let mut round=CtfRound::new("quickplay",false,[[0.0,1.0,0.0],[30.0,1.0,0.0]]).unwrap();
        let mut players=vec![player("a-later",Team::Red,21.0),player("z-first",Team::Red,25.0),player("blue",Team::Blue,30.0)];players[2].position[2]=10.0;
        round.start(&players).unwrap();players[0].position[0]=30.0;players[1].position[0]=30.0;round.tick(0.1,&players);
        assert_eq!(round.flags[1].carrier.as_deref(),Some("z-first"));
        let mut round=CtfRound::new("quickplay",false,[[0.0,1.0,0.0],[30.0,1.0,0.0]]).unwrap();
        let mut players=vec![player("z-attacker",Team::Red,10.0),player("a-defender",Team::Blue,8.0)];round.start(&players).unwrap();
        round.flags[1].position=[15.0,1.0,0.0];round.flags[1].drop();for p in &mut players{p.position[0]=15.0;}round.tick(0.1,&players);
        assert_eq!(round.flags[1].carrier.as_deref(),Some("z-attacker"));assert_eq!(round.objectives["a-defender"].flag_returns,0);
    }
    #[test]fn dropped_flag_requires_actual_owner_contact_and_hazards_use_last_ground(){
        let(mut round,mut players)=setup();players[1].position[2]=10.0;move_to(&mut round,&mut players,0,30.0);move_to(&mut round,&mut players,0,20.0);
        players[0].grounded=false;players[0].position=[18.0,-10.0,0.0];round.tick(0.1,&players);
        assert_eq!(round.flags[1].status,FlagStatus::Dropped);assert_eq!(round.flags[1].position,[20.0,1.0,0.0]);
        for _ in 0..301{round.tick(0.1,&[]);}assert_eq!(round.flags[1].status,FlagStatus::Dropped);
        players[1].position=[23.001,1.0,0.0];round.tick(0.1,&players);assert_eq!(round.flags[1].status,FlagStatus::Dropped);
        players[1].position=[23.0,1.0,0.0];round.tick(0.1,&players);assert_eq!(round.flags[1].status,FlagStatus::Home);assert_eq!(round.objectives["b"].flag_returns,1);
    }
    #[test]fn other_world_and_invalid_positions_cannot_pick_up(){let(mut r,mut p)=setup();p[0].position=[f32::NAN,1.0,0.0];r.tick(0.1,&p);assert!(r.carriers().is_empty());r.tick(0.1,&[]);assert!(r.carriers().is_empty());}
}
