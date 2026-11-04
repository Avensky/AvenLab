# Team radar and stable fire-button highlights

Cannon and equipped secondary are independent firing slots. Their white orbit/border styling now follows equipped hardware rather than the last `combat.weapon` seen in a snapshot. A held machine gun no longer deselects the cannon's appearance. Reload progress and ready/dim status remain independent for each weapon. Actual secondary selection remains on the two middle mount-choice buttons.

The minimap displays teammates in blue and detected enemies in red/orange, relative to the viewer's team regardless of whether it is Red or Blue. Your own direction arrow remains the self marker. Teammates beyond the current map view are clamped inside its edge, including circular views. Defeated allies stay visible dimmed, but cannot reveal enemies.

Detection initially uses a 150-metre horizontal radius around every living teammate, including the viewer. A living enemy detected by any teammate is shared with the entire team. Enemies disappear when no living ally is in range. Other rooms, unknown team assignments and non-finite positions do not become contacts. Contacts refresh at 10 Hz independently of the road/route presentation and clear on world/session changes.

This is minimap proximity detection. Line of sight, radar-specific abilities, last-known trails, stealth, vertical detection rules and server network culling are future work. The base radius is a shared constant in the minimap contacts module so it can be tuned without duplicating rules.
