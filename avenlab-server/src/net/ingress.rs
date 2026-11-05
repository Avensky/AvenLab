//! Bound work before decoding. A small fixed token budget covers ordinary
//! 60 Hz input and short bursts without retaining a timestamp per packet.
use std::time::Instant;

const MESSAGES_PER_SECOND: f64 = 240.0;
const MESSAGE_BURST: f64 = 480.0;
const BYTES_PER_SECOND: f64 = 256.0 * 1024.0;
const BYTE_BURST: f64 = 2.0 * 1024.0 * 1024.0;

pub(super) struct IngressBudget {
    last: Instant,
    messages: f64,
    bytes: f64,
}

impl IngressBudget {
    pub(super) fn new(now: Instant) -> Self {
        Self { last: now, messages: MESSAGE_BURST, bytes: BYTE_BURST }
    }

    pub(super) fn allow(&mut self, size: usize, now: Instant) -> bool {
        let elapsed = now.saturating_duration_since(self.last).as_secs_f64();
        self.last = now;
        self.messages = (self.messages + elapsed * MESSAGES_PER_SECOND).min(MESSAGE_BURST);
        self.bytes = (self.bytes + elapsed * BYTES_PER_SECOND).min(BYTE_BURST);
        if self.messages < 1.0 || self.bytes < size as f64 { return false; }
        self.messages -= 1.0;
        self.bytes -= size as f64;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn normal_input_and_editor_messages_fit_but_floods_are_bounded() {
        let start = Instant::now();
        let mut budget = IngressBudget::new(start);
        for frame in 0..36_000 {
            let now = start + Duration::from_secs_f64(frame as f64 / 60.0);
            assert!(budget.allow(2048, now));
            if frame % 600 == 0 { assert!(budget.allow(1024 * 1024, now)); }
        }
        let mut packets = IngressBudget::new(start);
        for _ in 0..480 { assert!(packets.allow(1, start)); }
        assert!(!packets.allow(1, start));
        assert!(packets.allow(1, start + Duration::from_millis(5)));
        let mut bytes = IngressBudget::new(start);
        assert!(bytes.allow(1024 * 1024, start));
        assert!(bytes.allow(1024 * 1024, start));
        assert!(!bytes.allow(1, start));
        assert!(bytes.allow(256 * 1024, start + Duration::from_secs(1)));
    }
}
