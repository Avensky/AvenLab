# Rust transport

rustSocket.ts validates/routs setup/snapshots and handles reconnect, ping, vehicle/service requests. inputSender.ts is the single bounded 60 Hz input writer with congestion checks.

## How to edit

Add a wire field in Rust and validate it here before stores consume it. Sender reads inputRef/debug mask, not a React closure. Keep one timer across reconnects; do not add send calls to gauges or research panels.
