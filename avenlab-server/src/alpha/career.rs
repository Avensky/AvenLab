//! Persistent, server-authored career records. Full immutable match archives live
//! beside social.json; profile summaries stay bounded and migrate by defaults.
use super::{Mode, appearance::HeroAppearance};
use serde::{Deserialize, Serialize};
use sha2::{Digest,Sha256};
use std::{collections::{BTreeMap,BTreeSet},fs::{self,OpenOptions},io::Write,path::{Path,PathBuf}};

const RECENT_LIMIT:usize=50;
const MAX_PARTICIPANTS:usize=32;
const MAX_ARCHIVES:usize=16384;
const MAX_RECORD_BYTES:u64=512*1024;
const MAX_INDEX_BYTES:u64=8*1024*1024;
const MAX_STAT_AMOUNT:f64=1_000_000_000_000.0;

#[derive(Clone,Debug,Default,PartialEq,Serialize,Deserialize)]
#[serde(default)]
pub struct CareerStats {
    pub kills:u64,pub deaths:u64,pub assists:u64,
    pub damage_dealt:f64,pub healing_done:f64,pub self_healing:f64,
    pub gas_burned_liters:f64,pub gas_gained_liters:f64,
    pub resurrections:u64,pub respawns:u64,pub captures:u64,pub flag_returns:u64,
    pub play_time_s:f64,pub best_kill_streak:u32,
}
impl CareerStats {
    fn validate(&self)->Result<(),String>{
        if [self.damage_dealt,self.healing_done,self.self_healing,self.gas_burned_liters,self.gas_gained_liters,self.play_time_s].iter().any(|n|!n.is_finite()||*n<0.0||*n>MAX_STAT_AMOUNT){return Err("Career statistics must be finite and within session limits.".into());}
        if [self.kills,self.deaths,self.assists,self.resurrections,self.respawns,self.captures,self.flag_returns].iter().any(|n|*n>1_000_000_000)||self.best_kill_streak as u64>self.kills{return Err("Career counters exceed session limits.".into());}
        if self.self_healing>self.healing_done+0.001{return Err("Self healing cannot exceed total healing.".into());}Ok(())
    }
    pub fn add_assign(&mut self,other:&Self){
        macro_rules! count {($($field:ident),*)=>{$(self.$field=self.$field.saturating_add(other.$field);)*};}
        count!(kills,deaths,assists,resurrections,respawns,captures,flag_returns);
        macro_rules! amount {($($field:ident),*)=>{$(self.$field=(self.$field+other.$field).min(f64::MAX);)*};}
        amount!(damage_dealt,healing_done,self_healing,gas_burned_liters,gas_gained_liters,play_time_s);
        self.best_kill_streak=self.best_kill_streak.max(other.best_kill_streak);
    }
    fn maxima(&mut self,other:&Self){
        macro_rules! max {($($field:ident),*)=>{$(self.$field=self.$field.max(other.$field);)*};}
        max!(kills,deaths,assists,resurrections,respawns,captures,flag_returns,damage_dealt,healing_done,self_healing,gas_burned_liters,gas_gained_liters,play_time_s,best_kill_streak);
    }
}
#[derive(Clone,Copy,Debug,PartialEq,Eq,Serialize,Deserialize)]
#[serde(rename_all="snake_case")]
pub enum CareerAward{Mvp,Svp,PlayOfTheGame,TopSupport}
#[derive(Clone,Copy,Debug,PartialEq,Eq,Serialize,Deserialize)]
#[serde(rename_all="snake_case")]
pub enum CareerOutcome{Win,Loss,Draw,Completed,Abandoned}
#[derive(Clone,Debug,Default,PartialEq,Serialize,Deserialize)]
#[serde(default)]
pub struct CareerParticipant {
    pub profile_id:String,pub name:String,pub team:Option<String>,pub hero:String,
    pub appearance:HeroAppearance,pub stats:CareerStats,pub abandoned:bool,pub awards:Vec<CareerAward>,
}
#[derive(Clone,Debug,Default,PartialEq,Serialize,Deserialize)]
#[serde(default)]
pub struct PlayOfGame {
    pub profile_id:String,pub start_s:f64,pub end_s:f64,pub score:f64,
    pub kills:u32,pub captures:u32,pub damage:f64,
    pub replay_available:bool,
}
#[derive(Clone,Debug,PartialEq,Serialize,Deserialize)]
#[serde(default)]
pub struct CareerMatch {
    pub match_id:String,pub world_id:usize,pub mode:Mode,pub team_size:Option<usize>,pub map:String,
    pub ended_at:u64,pub duration_s:f64,pub training:bool,pub progression_eligible:bool,
    pub winner:Option<String>,pub score:[u32;2],pub participants:Vec<CareerParticipant>,
    pub play_of_game:Option<PlayOfGame>,
}
impl Default for CareerMatch {
    fn default()->Self{Self{match_id:String::new(),world_id:0,mode:Mode::Quickplay,team_size:None,map:String::new(),ended_at:0,duration_s:0.0,training:false,progression_eligible:false,winner:None,score:[0,0],participants:Vec::new(),play_of_game:None}}
}
impl CareerMatch {
    pub fn effective_team_size(&self)->usize {self.team_size.unwrap_or_else(||self.mode.team_size())}
    pub fn mode_key(&self)->&'static str{if self.training{"training"}else{mode_key(self.mode)}}
    pub fn outcome_for(&self,participant:&CareerParticipant)->CareerOutcome{
        if self.mode.bucket()!=0{return if participant.abandoned{CareerOutcome::Abandoned}else{CareerOutcome::Completed};}
        if participant.abandoned{return CareerOutcome::Loss;}
        match (&self.winner,&participant.team){(Some(winner),Some(team))=>if winner==team{CareerOutcome::Win}else{CareerOutcome::Loss},_=>CareerOutcome::Draw}
    }
    pub fn validate(&self)->Result<(),String>{
        valid_identifier(&self.match_id)?;
        if self.team_size.is_some_and(|size|if self.mode.bucket()==0 {![3,5].contains(&size)}else{size!=1}) {return Err("Invalid career match size.".into());}
        if self.map.len()>128||self.map.chars().any(char::is_control){return Err("Invalid career map identifier.".into());}
        if !self.duration_s.is_finite()||self.duration_s<0.0||self.duration_s>7.0*86400.0{return Err("Invalid career match duration.".into());}
        if self.participants.is_empty()||self.participants.len()>MAX_PARTICIPANTS{return Err("Invalid career participant count.".into());}
        if self.winner.as_deref().is_some_and(|team|team!="red"&&team!="blue"){return Err("Invalid winning team.".into());}
        if self.progression_eligible&&(self.training||self.mode.bucket()!=0){return Err("Practice results cannot grant progression.".into());}
        let mut seen=BTreeSet::new();
        for p in &self.participants{
            valid_identifier(&p.profile_id)?;valid_identifier(&p.hero)?;
            if !seen.insert(&p.profile_id){return Err("A career participant cannot appear twice.".into());}
            if p.name.is_empty()||p.name.chars().count()>64||p.name.chars().any(char::is_control){return Err("Invalid career player name.".into());}
            if p.team.as_deref().is_some_and(|team|team!="red"&&team!="blue"){return Err("Invalid participant team.".into());}
            p.stats.validate()?;
            let mut awards=BTreeSet::new();for award in &p.awards{if !awards.insert(format!("{award:?}")){return Err("Duplicate career award.".into());}}
        }
        if let Some(moment)=&self.play_of_game{
            if !seen.contains(&moment.profile_id)||[moment.start_s,moment.end_s,moment.score,moment.damage].iter().any(|n|!n.is_finite()||*n<0.0)||moment.end_s<moment.start_s||moment.end_s>self.duration_s+0.1||moment.score<=0.0{return Err("Invalid Play of the Game moment.".into());}
            let player=self.participants.iter().find(|p|p.profile_id==moment.profile_id).unwrap();
            let damage_tolerance=(player.stats.damage_dealt*0.00001).max(0.01);
            if player.abandoned||moment.kills as u64>player.stats.kills||moment.captures as u64>player.stats.captures||moment.damage>player.stats.damage_dealt+damage_tolerance{return Err("A Play of the Game window cannot exceed its recorded player totals.".into());}
            if moment.replay_available{return Err("A replay cannot be claimed without an implemented recorder.".into());}
        }Ok(())
    }
}
pub fn mode_key(mode:Mode)->&'static str{match mode{Mode::Quickplay=>"quickplay",Mode::Competitive=>"competitive",Mode::Skirmish=>"skirmish",Mode::Sandbox=>"sandbox",Mode::Editor=>"editor"}}
fn valid_identifier(value:&str)->Result<(),String>{if value.is_empty()||value.len()>128||!value.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-:.".contains(&c)){Err("Invalid career identifier.".into())}else{Ok(())}}

#[derive(Clone,Debug)]
pub struct CareerEvent{pub at_s:f64,pub profile_id:String,pub kills:u32,pub captures:u32,pub damage:f64}
fn contribution(p:&CareerParticipant)->f64{p.stats.captures as f64*1000.0+p.stats.flag_returns as f64*100.0+p.stats.kills as f64*100.0+p.stats.assists as f64*40.0+p.stats.damage_dealt*0.1+(p.stats.healing_done-p.stats.self_healing).max(0.0)*0.2}
/// Objective contribution, combat and ally healing decide awards, with stable
/// profile-ID tie breaking. Self-healing alone never farms an award.
pub fn award_match(record:&mut CareerMatch,events:&[CareerEvent]){
    for p in &mut record.participants{p.awards.clear();}
    record.play_of_game=None;
    if record.mode.bucket()!=0{return;}
    let eligible=|p:&&CareerParticipant|!p.abandoned;
    let leader=|team:&str|record.participants.iter().filter(eligible).filter(|p|p.team.as_deref()==Some(team)&&contribution(p)>0.0).max_by(|a,b|contribution(a).total_cmp(&contribution(b)).then_with(||b.profile_id.cmp(&a.profile_id))).map(|p|p.profile_id.clone());
    let mut grants:Vec<(String,CareerAward)>=Vec::new();
    if let Some(winner)=record.winner.as_deref(){
        if let Some(id)=leader(winner){grants.push((id,CareerAward::Mvp));}
        if let Some(id)=leader(if winner=="red"{"blue"}else{"red"}){grants.push((id,CareerAward::Svp));}
    }
    if let Some(p)=record.participants.iter().filter(eligible).filter(|p|p.stats.healing_done>p.stats.self_healing).max_by(|a,b|(a.stats.healing_done-a.stats.self_healing).total_cmp(&(b.stats.healing_done-b.stats.self_healing)).then_with(||b.profile_id.cmp(&a.profile_id))){grants.push((p.profile_id.clone(),CareerAward::TopSupport));}
    let mut events:Vec<_>=events.iter().filter(|e|e.at_s.is_finite()&&e.at_s>=0.0&&e.at_s<=record.duration_s&&e.damage.is_finite()&&e.damage>=0.0&&e.damage<=MAX_STAT_AMOUNT&&record.participants.iter().any(|p|p.profile_id==e.profile_id&&!p.abandoned)).take(4096).collect();
    events.sort_by(|a,b|a.at_s.total_cmp(&b.at_s).then_with(||a.profile_id.cmp(&b.profile_id)));
    let mut best:Option<PlayOfGame>=None;
    for event in &events{
        let start=(event.at_s-10.0).max(0.0);let mut candidate=PlayOfGame{profile_id:event.profile_id.clone(),start_s:start,end_s:event.at_s,..Default::default()};
        for e in events.iter().filter(|e|e.profile_id==event.profile_id&&e.at_s>=start&&e.at_s<=event.at_s){candidate.kills=candidate.kills.saturating_add(e.kills);candidate.captures=candidate.captures.saturating_add(e.captures);candidate.damage+=e.damage;}
        candidate.score=candidate.kills as f64*100.0+candidate.captures as f64*1000.0+candidate.damage*0.1;
        if candidate.score>0.0&&best.as_ref().is_none_or(|b|candidate.score>b.score||(candidate.score==b.score&&(candidate.end_s<b.end_s||(candidate.end_s==b.end_s&&candidate.profile_id<b.profile_id)))){best=Some(candidate);}
    }
    if let Some(moment)=best{grants.push((moment.profile_id.clone(),CareerAward::PlayOfTheGame));record.play_of_game=Some(moment);}
    for (id,award) in grants{if let Some(p)=record.participants.iter_mut().find(|p|p.profile_id==id){p.awards.push(award);}}
}

#[derive(Clone,Debug,Default,PartialEq,Serialize,Deserialize)]
#[serde(default)]
pub struct CareerBucket {
    pub sessions:u64,pub matches:u64,pub wins:u64,pub losses:u64,pub draws:u64,pub abandoned:u64,
    pub totals:CareerStats,pub best:CareerStats,
    pub mvp:u64,pub svp:u64,pub play_of_the_game:u64,pub top_support:u64,
}
impl CareerBucket{
    fn record(&mut self,record:&CareerMatch,p:&CareerParticipant){
        self.sessions=self.sessions.saturating_add(1);if record.mode.bucket()==0{self.matches=self.matches.saturating_add(1);}
        match record.outcome_for(p){CareerOutcome::Win=>self.wins=self.wins.saturating_add(1),CareerOutcome::Loss=>self.losses=self.losses.saturating_add(1),CareerOutcome::Draw=>self.draws=self.draws.saturating_add(1),_=>{}}
        if p.abandoned{self.abandoned=self.abandoned.saturating_add(1);}
        self.totals.add_assign(&p.stats);self.best.maxima(&p.stats);
        for award in &p.awards{match award{CareerAward::Mvp=>self.mvp=self.mvp.saturating_add(1),CareerAward::Svp=>self.svp=self.svp.saturating_add(1),CareerAward::PlayOfTheGame=>self.play_of_the_game=self.play_of_the_game.saturating_add(1),CareerAward::TopSupport=>self.top_support=self.top_support.saturating_add(1)}}
    }
}
#[derive(Clone,Debug,PartialEq,Serialize,Deserialize)]
pub struct CareerHistoryEntry{
    pub match_id:String,pub mode:Mode,#[serde(default)]pub team_size:Option<usize>,pub map:String,pub ended_at:u64,pub duration_s:f64,pub training:bool,
    pub outcome:CareerOutcome,pub hero:String,pub team:Option<String>,pub stats:CareerStats,pub awards:Vec<CareerAward>,pub abandoned:bool,
}
impl CareerHistoryEntry{
    pub fn from_match(record:&CareerMatch,profile_id:&str)->Option<Self>{let p=record.participants.iter().find(|p|p.profile_id==profile_id)?;Some(Self{match_id:record.match_id.clone(),mode:record.mode,team_size:Some(record.effective_team_size()),map:record.map.clone(),ended_at:record.ended_at,duration_s:record.duration_s,training:record.training,outcome:record.outcome_for(p),hero:p.hero.clone(),team:p.team.clone(),stats:p.stats.clone(),awards:p.awards.clone(),abandoned:p.abandoned})}
}
#[derive(Clone,Debug,PartialEq,Serialize,Deserialize)]
#[serde(default)]
pub struct CareerSummary{
    pub version:u8,pub summary:CareerBucket,pub by_mode:BTreeMap<String,CareerBucket>,pub by_hero:BTreeMap<String,CareerBucket>,pub by_mode_hero:BTreeMap<String,BTreeMap<String,CareerBucket>>,pub recent:Vec<CareerHistoryEntry>,
}
impl Default for CareerSummary{fn default()->Self{Self{version:1,summary:CareerBucket::default(),by_mode:BTreeMap::new(),by_hero:BTreeMap::new(),by_mode_hero:BTreeMap::new(),recent:Vec::new()}}}
impl CareerSummary{
    /// The persistent global completed-results ledger is the final once-only
    /// owner. Recent IDs additionally make retries harmless within this view.
    pub fn record(&mut self,record:&CareerMatch,profile_id:&str)->Result<bool,String>{
        record.validate()?;if self.recent.iter().any(|r|r.match_id==record.match_id){return Ok(false);}
        let p=record.participants.iter().find(|p|p.profile_id==profile_id).ok_or("This profile did not participate in that match.")?;
        self.summary.record(record,p);self.by_mode.entry(record.mode_key().into()).or_default().record(record,p);self.by_hero.entry(p.hero.clone()).or_default().record(record,p);self.by_mode_hero.entry(record.mode_key().into()).or_default().entry(p.hero.clone()).or_default().record(record,p);
        self.recent.insert(0,CareerHistoryEntry::from_match(record,profile_id).unwrap());self.recent.truncate(RECENT_LIMIT);Ok(true)
    }
}

#[derive(Clone,Debug,PartialEq,Serialize,Deserialize)]
pub struct HistoryPage{pub matches:Vec<CareerHistoryEntry>,pub next_cursor:Option<String>}
#[derive(Clone,Debug,PartialEq,Serialize,Deserialize)]
struct ArchiveRef{match_id:String,ended_at:u64,mode:String,hero:String}
fn digest(value:&str)->String{format!("{:x}",Sha256::digest(value.as_bytes()))}
fn archive_root(social_path:&Path)->PathBuf{social_path.with_file_name(format!("{}.matches",social_path.file_name().unwrap_or_default().to_string_lossy()))}
fn safe_directory(path:&Path)->Result<(),String>{if let Ok(m)=fs::symlink_metadata(path){if m.file_type().is_symlink()||!m.is_dir(){return Err("Invalid career archive directory.".into());}}fs::create_dir_all(path).map_err(|e|format!("Cannot create career archive: {e}"))}
fn read_json<T:serde::de::DeserializeOwned>(path:&Path,max:u64)->Result<T,String>{let m=fs::symlink_metadata(path).map_err(|e|format!("Cannot inspect career archive: {e}"))?;if !m.is_file()||m.file_type().is_symlink()||m.len()>max{return Err("Invalid or oversized career archive.".into());}serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|e|format!("Invalid career archive JSON: {e}"))}
fn atomic_json<T:Serialize>(path:&Path,value:&T)->Result<(),String>{
    let bytes=serde_json::to_vec(value).map_err(|e|e.to_string())?;let temp=path.with_extension(format!("{}.tmp",uuid::Uuid::new_v4().simple()));
    let result=(||{let mut f=OpenOptions::new().create_new(true).write(true).open(&temp).map_err(|e|e.to_string())?;f.write_all(&bytes).and_then(|_|f.sync_all()).map_err(|e|e.to_string())?;fs::rename(&temp,path).map_err(|e|e.to_string())})();let _=fs::remove_file(&temp);result
}
/// Archive before committing the social ledger/aggregate. Reads accept the
/// committed ID set, so a crash between files cannot expose a partial result.
pub fn write_match_archive(social_path:&Path,record:&CareerMatch)->Result<(),String>{
    record.validate()?;let root=archive_root(social_path);safe_directory(&root)?;let records=root.join("records");let indexes=root.join("players");safe_directory(&records)?;safe_directory(&indexes)?;
    let mut canonical=record.clone();canonical.participants.sort_by(|a,b|a.profile_id.cmp(&b.profile_id));let path=records.join(format!("{}.json",digest(&record.match_id)));
    let exists=path.exists();
    if exists{let existing:CareerMatch=read_json(&path,MAX_RECORD_BYTES)?;if existing!=canonical{return Err("A different result already uses this match identifier.".into());}}
    if serde_json::to_vec(&canonical).map_err(|e|e.to_string())?.len()>MAX_RECORD_BYTES as usize{return Err("Career match archive is too large.".into());}
    // Validate every participant index before creating a durable terminal
    // record. Capacity failures must not strand an uncommittable transaction.
    let mut updates=Vec::new();
    for p in &canonical.participants{let index_path=indexes.join(format!("{}.json",digest(&p.profile_id)));let mut index:Vec<ArchiveRef>=if index_path.exists(){read_json(&index_path,MAX_INDEX_BYTES)?}else{Vec::new()};
        if !index.iter().any(|r|r.match_id==record.match_id){if index.len()>=MAX_ARCHIVES{return Err("Career archive index needs maintenance before adding more results.".into());}index.push(ArchiveRef{match_id:record.match_id.clone(),ended_at:record.ended_at,mode:record.mode_key().into(),hero:p.hero.clone()});index.sort_by(|a,b|b.ended_at.cmp(&a.ended_at).then_with(||b.match_id.cmp(&a.match_id)));if serde_json::to_vec(&index).map_err(|e|e.to_string())?.len()>MAX_INDEX_BYTES as usize{return Err("Career archive index needs maintenance before adding more results.".into());}updates.push((index_path,index));}
    }
    if !exists{atomic_json(&path,&canonical)?;}
    for (index_path,index) in updates{atomic_json(&index_path,&index)?;}
    Ok(())
}
pub fn read_match_archive(social_path:&Path,match_id:&str)->Result<CareerMatch,String>{valid_identifier(match_id)?;let record:CareerMatch=read_json(&archive_root(social_path).join("records").join(format!("{}.json",digest(match_id))),MAX_RECORD_BYTES)?;record.validate()?;if record.match_id!=match_id{return Err("Career archive ID mismatch.".into());}Ok(record)}
pub fn read_history(social_path:&Path,profile_id:&str,cursor:Option<&str>,limit:usize,completed:&BTreeSet<String>)->Result<HistoryPage,String>{read_history_filtered(social_path,profile_id,cursor,limit,None,None,completed)}
pub fn read_history_filtered(social_path:&Path,profile_id:&str,cursor:Option<&str>,limit:usize,mode:Option<&str>,hero:Option<&str>,completed:&BTreeSet<String>)->Result<HistoryPage,String>{
    valid_identifier(profile_id)?;if !(1..=50).contains(&limit){return Err("Choose 1–50 career records per page.".into());}if mode.is_some_and(|m|!["quickplay","competitive","skirmish","sandbox","editor","training"].contains(&m)){return Err("Unknown career mode filter.".into());}if let Some(hero)=hero{valid_identifier(hero)?;}
    let path=archive_root(social_path).join("players").join(format!("{}.json",digest(profile_id)));let mut index:Vec<ArchiveRef>=if path.exists(){read_json(&path,MAX_INDEX_BYTES)?}else{Vec::new()};
    index.retain(|r|completed.contains(&r.match_id)&&mode.is_none_or(|mode|r.mode==mode)&&hero.is_none_or(|hero|r.hero==hero));
    let offset=if let Some(cursor)=cursor{if cursor.len()!=67||!cursor.starts_with("v1:")||!cursor[3..].bytes().all(|c|c.is_ascii_hexdigit()){return Err("Invalid career history cursor.".into());}index.iter().position(|r|digest(&r.match_id)==cursor[3..]).map(|i|i+1).ok_or("Career history cursor does not belong to this filtered player history.")?}else{0};
    let selected:Vec<_>=index.iter().skip(offset).take(limit).collect();let mut matches=Vec::with_capacity(selected.len());for entry in &selected{let record=read_match_archive(social_path,&entry.match_id)?;matches.push(CareerHistoryEntry::from_match(&record,profile_id).ok_or("Career index participant mismatch.")?);}
    let next_cursor=if offset+selected.len()<index.len(){selected.last().map(|r|format!("v1:{}",digest(&r.match_id)))}else{None};Ok(HistoryPage{matches,next_cursor})
}
/// The bridge replays these server-owned terminal transactions after startup.
/// Temporary files and already-committed IDs are excluded; invalid files fail
/// closed instead of awarding invented data or silently losing a result.
pub fn pending_archives(social_path:&Path,completed:&BTreeSet<String>)->Result<Vec<CareerMatch>,String>{
    let path=archive_root(social_path).join("records");if !path.exists(){return Ok(Vec::new());}let mut pending=Vec::new();let mut seen=0;
    for entry in fs::read_dir(&path).map_err(|e|e.to_string())?{let entry=entry.map_err(|e|e.to_string())?;let name=entry.file_name();let name=name.to_string_lossy();if !name.ends_with(".json"){continue;}seen+=1;if seen>MAX_ARCHIVES{return Err("Career archive needs maintenance before recovery.".into());}if name.len()!=69||!name.as_bytes()[..64].iter().all(u8::is_ascii_hexdigit){return Err("Invalid career archive filename.".into());}let record:CareerMatch=read_json(&entry.path(),MAX_RECORD_BYTES)?;record.validate()?;if name[..64]!=digest(&record.match_id){return Err("Career recovery ID mismatch.".into());}if !completed.contains(&record.match_id){pending.push(record);}}
    pending.sort_by(|a,b|a.ended_at.cmp(&b.ended_at).then_with(||a.match_id.cmp(&b.match_id)));Ok(pending)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn participant(id:&str,team:&str,hero:&str)->CareerParticipant {
        CareerParticipant {profile_id:id.into(),name:format!("Player {id}"),team:Some(team.into()),hero:hero.into(),..Default::default()}
    }
    fn record(id:&str)->CareerMatch {
        CareerMatch {match_id:id.into(),map:"coastal-district".into(),ended_at:100,duration_s:60.0,winner:Some("red".into()),participants:vec![participant("one","red","tank"),participant("two","blue","brz")],..Default::default()}
    }
    struct ArchiveDir(PathBuf);
    impl ArchiveDir {
        fn new()->Self {let path=std::env::temp_dir().join(format!("avenlab-career-{}",uuid::Uuid::new_v4().simple()));fs::create_dir_all(&path).unwrap();Self(path)}
        fn social(&self)->PathBuf{self.0.join("social.json")}
    }
    impl Drop for ArchiveDir {fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}

    #[test]
    fn legacy_progression_gains_empty_career_without_fabricating_past_matches() {
        let p:super::super::progression::Progression=serde_json::from_str(r#"{"level":3,"xp":50,"matches":7,"competitive_wins":4}"#).unwrap();
        assert_eq!((p.level,p.xp,p.matches,p.competitive_wins),(3,50,7,4));
        assert_eq!(p.career, CareerSummary::default());
        assert_eq!(p.view()["career"]["version"],1);
    }

    #[test]
    fn exact_mode_hero_totals_bests_and_recent_retries_are_independent() {
        let mut career=CareerSummary::default();let mut first=record("a");
        first.participants[0].stats=CareerStats{kills:4,damage_dealt:800.0,best_kill_streak:3,..Default::default()};
        assert!(career.record(&first,"one").unwrap());assert!(!career.record(&first,"one").unwrap());
        let mut next=record("b");next.mode=Mode::Competitive;next.winner=Some("blue".into());next.participants[0].hero="brz".into();next.participants[0].stats=CareerStats{kills:2,damage_dealt:1200.0,best_kill_streak:2,..Default::default()};
        career.record(&next,"one").unwrap();
        assert_eq!((career.summary.matches,career.summary.wins,career.summary.losses),(2,1,1));
        assert_eq!((career.summary.totals.kills,career.summary.best.kills,career.summary.best.damage_dealt,career.summary.totals.best_kill_streak),(6,4,1200.0,3));
        assert_eq!(career.by_mode["quickplay"].totals.damage_dealt,800.0);
        assert_eq!(career.by_hero["brz"].totals.kills,2);
        assert_eq!(career.by_mode_hero["competitive"]["brz"].losses,1);
        assert!(!career.by_mode_hero["competitive"].contains_key("tank"));
        assert!(career.record(&next,"stranger").is_ok(),"a seen match retry cannot mutate any profile");
    }

    #[test]
    fn draws_leavers_and_practice_have_truthful_outcomes() {
        let mut game=record("draw");game.winner=None;
        assert_eq!(game.outcome_for(&game.participants[0]),CareerOutcome::Draw);
        game.participants[0].abandoned=true;
        assert_eq!(game.outcome_for(&game.participants[0]),CareerOutcome::Loss);
        let mut career=CareerSummary::default();career.record(&game,"one").unwrap();
        assert_eq!((career.summary.losses,career.summary.abandoned),(1,1));
        game.match_id="sandbox".into();game.mode=Mode::Sandbox;game.participants[0].abandoned=false;
        assert_eq!(game.outcome_for(&game.participants[0]),CareerOutcome::Completed);
        career.record(&game,"one").unwrap();assert_eq!(career.by_mode["sandbox"].matches,0);assert_eq!(career.by_mode["sandbox"].wins,0);
        game.participants[0].abandoned=true;assert_eq!(game.outcome_for(&game.participants[0]),CareerOutcome::Abandoned);
    }

    #[test]
    fn training_retains_real_records_in_its_bucket_without_progression_eligibility() {
        let mut game=record("training");game.training=true;game.participants[0].stats.captures=1;
        award_match(&mut game,&[]);assert!(game.participants[0].awards.contains(&CareerAward::Mvp));
        let mut career=CareerSummary::default();career.record(&game,"one").unwrap();
        assert_eq!(career.by_mode["training"].wins,1);assert!(!career.by_mode.contains_key("quickplay"));
        assert_eq!(career.summary.sessions,1);assert_eq!(career.by_mode_hero["training"]["tank"].mvp,1);
        game.progression_eligible=true;assert!(game.validate().is_err());
    }

    #[test]
    fn awards_reward_objectives_and_ally_support_with_stable_ties() {
        let mut game=record("awards");game.participants.push(participant("three","red","healer"));
        game.participants[0].stats.damage_dealt=5000.0;
        game.participants[2].stats.captures=1;
        game.participants[2].stats.healing_done=200.0;game.participants[2].stats.self_healing=10.0;
        game.participants[1].stats.healing_done=10000.0;game.participants[1].stats.self_healing=10000.0;
        award_match(&mut game,&[]);
        assert!(game.participants[2].awards.contains(&CareerAward::Mvp));assert!(game.participants[2].awards.contains(&CareerAward::TopSupport));
        assert!(game.participants[1].awards.is_empty(),"self healing alone cannot earn support or SVP");
        game.participants[0].stats.captures=1;game.participants[0].stats.damage_dealt=0.0;game.participants[2].stats.healing_done=0.0;game.participants[2].stats.self_healing=0.0;
        award_match(&mut game,&[]);assert!(game.participants[0].awards.contains(&CareerAward::Mvp));
        game.participants[0].abandoned=true;award_match(&mut game,&[]);assert!(game.participants[0].awards.is_empty());
    }

    #[test]
    fn zero_draw_and_practice_do_not_invent_winner_awards() {
        let mut game=record("zero");award_match(&mut game,&[]);assert!(game.participants.iter().all(|p|p.awards.is_empty()));
        game.winner=None;game.participants[0].stats.kills=1;award_match(&mut game,&[]);assert!(game.participants.iter().all(|p|!p.awards.contains(&CareerAward::Mvp)&&!p.awards.contains(&CareerAward::Svp)));
        game.mode=Mode::Editor;award_match(&mut game,&[]);assert!(game.participants.iter().all(|p|p.awards.is_empty()));
    }

    #[test]
    fn play_of_game_is_a_real_bounded_event_window_with_no_fake_replay() {
        let mut game=record("moment");game.participants[0].stats.kills=3;game.participants[0].stats.damage_dealt=1500.0;
        let events=[1.0,5.0,20.0].map(|at_s|CareerEvent{at_s,profile_id:"one".into(),kills:1,captures:0,damage:500.0});
        award_match(&mut game,&events);let moment=game.play_of_game.as_ref().unwrap();
        assert_eq!((moment.start_s,moment.end_s,moment.kills,moment.damage),(0.0,5.0,2,1000.0));assert!(!moment.replay_available);assert!(game.validate().is_ok());
        game.play_of_game.as_mut().unwrap().replay_available=true;assert!(game.validate().is_err());
    }

    #[test]
    fn malformed_counts_floats_names_and_duplicate_participants_fail_before_aggregation() {
        let mut career=CareerSummary::default();let original=career.clone();let mut game=record("invalid");
        for amount in [f64::NAN,f64::INFINITY,-1.0,MAX_STAT_AMOUNT+1.0] {game.participants[0].stats.damage_dealt=amount;assert!(career.record(&game,"one").is_err());assert_eq!(career,original);}
        game=record("invalid");game.participants[0].stats.best_kill_streak=1;assert!(game.validate().is_err());
        game=record("invalid");game.participants[0].name="bad\nname".into();assert!(game.validate().is_err());
        game=record("invalid");game.participants.push(game.participants[0].clone());assert!(game.validate().is_err());
    }

    #[test]
    fn immutable_archives_are_idempotent_and_hidden_until_committed() {
        let dir=ArchiveDir::new();let social=dir.social();let game=record("archive");let empty=BTreeSet::new();
        write_match_archive(&social,&game).unwrap();write_match_archive(&social,&game).unwrap();
        assert!(read_history(&social,"one",None,10,&empty).unwrap().matches.is_empty());assert_eq!(pending_archives(&social,&empty).unwrap().len(),1);
        let committed=BTreeSet::from([game.match_id.clone()]);assert!(pending_archives(&social,&committed).unwrap().is_empty());
        assert_eq!(read_history(&social,"one",None,10,&committed).unwrap().matches[0].outcome,CareerOutcome::Win);
        let mut conflict=game.clone();conflict.winner=Some("blue".into());assert!(write_match_archive(&social,&conflict).is_err());
        assert_eq!(read_match_archive(&social,"archive").unwrap().winner,Some("red".into()));
        fs::remove_file(archive_root(&social).join("players").join(format!("{}.json",digest("one")))).unwrap();
        write_match_archive(&social,&game).unwrap();assert_eq!(read_history(&social,"one",None,10,&committed).unwrap().matches.len(),1,"archive retry repairs partially written indices");
    }

    #[test]
    fn index_capacity_rejects_before_creating_an_uncommittable_archive() {
        let dir=ArchiveDir::new();let social=dir.social();let players=archive_root(&social).join("players");fs::create_dir_all(&players).unwrap();
        let full:Vec<_>=(0..MAX_ARCHIVES).map(|n|ArchiveRef{match_id:format!("old-{n}"),ended_at:n as u64,mode:"quickplay".into(),hero:"tank".into()}).collect();
        atomic_json(&players.join(format!("{}.json",digest("one"))),&full).unwrap();
        let game=record("over-capacity");assert!(write_match_archive(&social,&game).unwrap_err().contains("needs maintenance"));
        assert!(!archive_root(&social).join("records").join(format!("{}.json",digest(&game.match_id))).exists());
        assert!(pending_archives(&social,&BTreeSet::new()).unwrap().is_empty());
    }

    #[test]
    fn full_history_survives_recent_limit_and_filters_before_pagination() {
        let dir=ArchiveDir::new();let social=dir.social();let mut career=CareerSummary::default();let mut committed=BTreeSet::new();
        for n in 0..55 {let mut game=record(&format!("match-{n:03}"));game.ended_at=n;game.training=n%2==0;career.record(&game,"one").unwrap();write_match_archive(&social,&game).unwrap();committed.insert(game.match_id);}
        assert_eq!(career.recent.len(),50);assert_eq!(career.summary.matches,55);
        let first=read_history(&social,"one",None,50,&committed).unwrap();assert_eq!(first.matches.len(),50);
        let second=read_history(&social,"one",first.next_cursor.as_deref(),50,&committed).unwrap();assert_eq!(second.matches.len(),5);assert!(second.next_cursor.is_none());assert_eq!(second.matches.last().unwrap().match_id,"match-000");
        let filtered=read_history_filtered(&social,"one",None,50,Some("training"),Some("tank"),&committed).unwrap();assert_eq!(filtered.matches.len(),28);assert!(filtered.matches.iter().all(|m|m.training));
        assert!(read_history(&social,"two",first.next_cursor.as_deref(),50,&committed).is_ok(),"shared match cursor is valid for its other participant");
        assert!(read_history(&social,"stranger",first.next_cursor.as_deref(),50,&committed).is_err());
        for cursor in ["../social.json","v1:../bad",&format!("v1:{}","a".repeat(64))] {assert!(read_history(&social,"one",Some(cursor),10,&committed).is_err());}
        assert!(read_history(&social,"one",None,51,&committed).is_err());
    }
}
