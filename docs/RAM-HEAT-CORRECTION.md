# Ram heat correction

The previous Ram multiplier reduced all generated engine heat to 2% while leaving radiator cooling unchanged. Ram could consequently cool the tank, masking its intended logistics drawback.

Active Ram now retains normal engine heat generation and applies a bounded net temperature rise of 0.6–0.8 C/s while the engine runs outside thermal recovery. The seven-second ability therefore adds approximately 4.2–5.6 C during use, plus the existing 2 C end cost. This is a gameplay heat budget for the temporary extra drivetrain load, not an adjustment to the radiator.

The floor exists only in the temporary resource configuration passed for active Ram. Ordinary driving, idling, stopping the engine, repairs and normal cooldown retain their existing thermal model. Overheating takes precedence: it still cancels Ram, reduces engine output into crawl mode and allows cooling. Heat cannot lock the ignition or permanently stall the tank. Fuel, nitrous, condition costs, charge duration and cooldown are unchanged.

## Validation

167 Rust tests passed, including monotonic active-Ram temperature rise, bounded per-tick increase, nitrous/fuel use, hot-start Ram reaching the overheat debuff, continued engine operation, and existing crawl/restart recovery. The earlier HUD/weapon-effects checks are retained as historical results because this correction changes only backend thermal behavior.

## Player feedback

Check how noticeable the new ramp feels on the dashboard, especially when starting near the warning zone. The rate is tuned in ram.rs; sustained-use balance may need adjustment after playtesting.
