# protocol

inputMasks.ts defines requested vehicle/player flags. cockpitMasks.ts packs assisted gear, parking, lights, wipers and cruise. cabinMasks.ts packs key/HVAC requests, including revision/command markers. deriveInputSignals.ts derives display pedal states.

A new electronics field must agree with Rust state.rs/cockpit.rs and the cross-language golden-word tests. Requested bits are not confirmed state. Preserve unrelated bits and never replay START from a temperature edit. This API is shared by UI and simulated agents; a panel does not need to be mounted to send a request.
