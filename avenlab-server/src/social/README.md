# Persistent social metadata

model.rs owns bounded metadata, loading and guest-profile authentication.
security.rs hashes random guest credentials and protects world passwords with
salted Argon2id. actions.rs performs server-authorized social reducers using the
connected actor. It does not own live physics or network I/O.

server.rs serializes admission and persistence; server/views.rs constructs
personalized views without hashes or credentials. world_sessions.rs owns each
occupied world's map/physics; net.rs owns rate-limited transport and mailboxes.
See docs/SOCIAL_WORLDS.md for operational limits and protocols.
