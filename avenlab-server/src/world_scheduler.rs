//! Bounded CPU jobs keep one expensive room from blocking sockets or other rooms.
//! One in-flight tick per world; late ticks are skipped, never queued for catch-up.
use std::collections::HashMap;
use crate::server::Runtime;
use tokio::task::{JoinHandle, JoinError};

#[derive(Default)]
pub struct WorldScheduler { pending: HashMap<usize, JoinHandle<usize>> }

impl WorldScheduler {
    pub async fn schedule(&mut self, worlds: Vec<(usize, Runtime)>) -> Result<usize, JoinError> {
        let done: Vec<_> = self.pending.iter().filter_map(|(&id, task)| task.is_finished().then_some(id)).collect();
        let mut bytes=0;
        for id in done {
            // is_finished guarantees these awaits cannot wait on another world.
            bytes += self.pending.remove(&id).unwrap().await?;
        }
        for (id, world) in worlds {
            if self.pending.contains_key(&id) { continue; }
            // Do not enqueue work behind a busy admission/editor operation.
            // The next scheduler pulse retries it; every other room can advance.
            let Ok(mut room) = world.try_lock_owned() else { continue; };
            self.pending.insert(id, tokio::task::spawn_blocking(move || room.tick(0.0)));
        }
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::{Mutex,watch};
    use crate::world_sessions::WorldRuntime;
    use std::time::Duration;

    #[tokio::test]
    async fn a_busy_world_does_not_stall_other_worlds_or_accumulate_jobs() {
        let mut room=WorldRuntime::new(2,"streaming_endless_city").unwrap();
        let (tx,_rx)=crate::outbox::channel();let (frame,_frames)=watch::channel(None);let (_,input)=watch::channel(None);
        room.join("driver",tx,frame,input,None,10);room.spawn("driver","brz").unwrap();
        let fast=Arc::new(Mutex::new(room));
        let slow=Arc::new(Mutex::new(WorldRuntime::new(1,"streaming_endless_city").unwrap()));
        let held=slow.lock().await;
        let mut scheduler=WorldScheduler::default();
        tokio::time::timeout(Duration::from_secs(5),async {
            loop {
                scheduler.schedule(vec![(1,slow.clone()),(2,fast.clone())]).await.unwrap();
                assert!(scheduler.pending.len()<=1);
                if fast.lock().await.game.tick>=3 {break;}
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        }).await.expect("unrelated physics keeps advancing while the first world stays locked");
        assert_eq!(held.game.tick,0);
        drop(held);
        // A room removed/replaced while its job runs cannot create a second
        // concurrent job under the same ID or retain an unbounded work queue.
        let (release,waiting)=std::sync::mpsc::channel();
        scheduler.pending.insert(1,tokio::task::spawn_blocking(move || {let _=waiting.recv();0}));
        let task=scheduler.pending[&1].id();
        for _ in 0..3 {
            scheduler.schedule(vec![(1,slow.clone()),(2,fast.clone())]).await.unwrap();
            assert_eq!(scheduler.pending[&1].id(),task);
            assert!(scheduler.pending.len()<=2);
        }
        release.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(5),async {
            while !scheduler.pending.is_empty() {
                scheduler.schedule(Vec::new()).await.unwrap();
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        }).await.unwrap();
    }
}
