//! Human-rate ephemeral chat. Identity and team audience come from the socket,
//! never from client-supplied names/world IDs. Physics never locks this state.
use super::*;
use serde::Serialize;
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};

const HISTORY: usize = 50;
const CONTEXTS: usize = 32;
const WINDOW: Duration = Duration::from_secs(5);

#[derive(Clone, Serialize)]
struct ChatMessage {
    id: u64,
    channel: String,
    context: String,
    author_id: String,
    name: String,
    text: String,
    sent_at: u64,
}

#[derive(Default)]
pub(super) struct ChatState {
    next: u64,
    history: HashMap<String, VecDeque<ChatMessage>>,
    order: VecDeque<String>,
    authors: HashMap<String, VecDeque<Instant>>,
    posts: VecDeque<Instant>,
}
impl ChatState {
    fn touch(&mut self, key: &str) {
        self.order.retain(|entry| entry != key);
        self.order.push_back(key.to_string());
        while self.order.len() > CONTEXTS {
            if let Some(old) = self.order.pop_front() {
                self.history.remove(&old);
            }
        }
    }
    fn allow(&mut self, author: &str, now: Instant) -> bool {
        self.authors.retain(|_, times| {
            times.retain(|time| now.duration_since(*time) < WINDOW);
            !times.is_empty()
        });
        self.posts.retain(|time| now.duration_since(*time) < WINDOW);
        if self.posts.len() >= 30
            || self
                .authors
                .get(author)
                .is_some_and(|times| times.len() >= 3)
        {
            return false;
        }
        self.authors
            .entry(author.to_string())
            .or_default()
            .push_back(now);
        self.posts.push_back(now);
        true
    }
    pub(super) fn clear_world(&mut self, world: usize) {
        let prefix = format!("team:{world}:");
        self.history.retain(|key, _| !key.starts_with(&prefix));
        self.order.retain(|key| !key.starts_with(&prefix));
    }
}

impl Server {
    pub(super) async fn handle_chat(&self, player: &str, value: &Value) -> Result<Value, String> {
        let channel = value
            .get("channel")
            .and_then(Value::as_str)
            .unwrap_or("lobby");
        if !matches!(channel, "lobby" | "team") {
            return Err("Choose Lobby or Team chat.".into());
        }
        let data = self.data.lock().await;
        let clients = self.connections.lock().await;
        let client = clients.get(player).ok_or("The connection closed.")?;
        let author = client
            .profile_id
            .as_ref()
            .ok_or("Identify your player profile to use chat.")?;
        let profile = data
            .profiles
            .get(author)
            .ok_or("Your player profile is unavailable.")?;
        let world = client.world_id;
        let team = client.team;
        let context = if channel == "team" {
            format!(
                "team:{}:{}",
                world.ok_or("Join a world before using Team chat.")?,
                team.as_str()
            )
        } else {
            "lobby".to_string()
        };
        let author = author.clone();
        let name = profile.name.clone();
        let targets: Vec<_> = clients
            .values()
            .filter(|peer| {
                peer.profile_id.is_some()
                    && (channel == "lobby" || (peer.world_id == world && peer.team == team))
            })
            .map(|peer| peer.tx.clone())
            .collect();
        drop(clients);
        drop(data);
        let mut chat = self.chat.lock().await;
        chat.touch(&context);
        if value.get("action").and_then(Value::as_str) == Some("chat_history") {
            return Ok(
                json!({"channel":channel,"context":context,"messages":chat.history.get(&context).map(|messages|messages.iter().collect::<Vec<_>>()).unwrap_or_default()}),
            );
        }
        let raw = value
            .get("text")
            .and_then(Value::as_str)
            .ok_or("Write a chat message.")?;
        if raw.len() > 1024 {
            return Err("Chat messages must fit within 280 characters.".into());
        }
        let text = raw
            .chars()
            .filter(|c| !c.is_control())
            .collect::<String>()
            .trim()
            .to_string();
        if text.is_empty() || text.chars().count() > 280 {
            return Err("Write between 1 and 280 characters.".into());
        }
        if !chat.allow(&author, Instant::now()) {
            return Err("Chat is moving too quickly. Wait a few seconds.".into());
        }
        chat.next = chat.next.saturating_add(1);
        let message = ChatMessage {
            id: chat.next,
            channel: channel.to_string(),
            context: context.clone(),
            author_id: author,
            name,
            text,
            sent_at: timestamp(),
        };
        let history = chat.history.entry(context).or_default();
        history.push_back(message.clone());
        while history.len() > HISTORY {
            history.pop_front();
        }
        drop(chat);
        let packet = json!({"type":"chat_message","data":message}).to_string();
        for target in targets {
            let _ = target.send(packet.clone());
        }
        Ok(json!({"message":message}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_expire_and_context_budget_cannot_grow_without_bound() {
        let mut state = ChatState::default();
        let now = Instant::now();
        for _ in 0..3 {
            assert!(state.allow("a", now));
        }
        assert!(!state.allow("a", now));
        assert!(state.allow("a", now + WINDOW));
        for n in 0..100 {
            state.touch(&format!("team:{n}:red"));
        }
        assert_eq!(state.order.len(), CONTEXTS);
        state.clear_world(99);
        assert!(!state.order.iter().any(|entry| entry == "team:99:red"));
    }
}
