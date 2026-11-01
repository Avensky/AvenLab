/** Units and limits mirror Rust vehicle_tuning.rs. Rust remains authoritative. */
export const TUNING_FIELDS = [
    ['mass', 'Mass', 'kg', 300, 60000, 25, 'Body'],
    ['center_of_mass_height', 'Center of mass above road', 'm', .05, 3, .01, 'Body'],
    ['linear_damping', 'Linear damping', '', 0, 5, .01, 'Body'],
    ['angular_damping', 'Angular damping', '', 0, 10, .05, 'Body'],
    ['engine_force', 'Engine force', 'N', 0, 200000, 100, 'Power'],
    ['brake_force', 'Brake force', 'N', 100, 300000, 100, 'Power'],
    ['max_speed', 'Target top speed', 'km/h', 2, 150, 1, 'Power'],
    ['suspension_rest_length', 'Suspension minimum length', 'm', .01, 1.5, .01, 'Suspension'],
    ['suspension_max_length', 'Suspension travel', 'm', .02, 1.5, .01, 'Suspension'],
    ['suspension_sag', 'Static sag', 'm', .01, 1, .01, 'Suspension'],
    ['suspension_damping_ratio', 'Damping ratio', '', .1, 3, .05, 'Suspension'],
    ['arb_front', 'Front anti-roll stiffness', 'N/m', 0, 200000, 500, 'Suspension'],
    ['arb_rear', 'Rear anti-roll stiffness', 'N/m', 0, 200000, 500, 'Suspension'],
    ['wheel_radius', 'Wheel radius', 'm', .15, 1.5, .01, 'Wheels'],
    ['mu_base', 'Base tire grip', '', .1, 3, .05, 'Wheels'],
    ['load_sensitivity', 'Load sensitivity', '', 0, 1, .01, 'Wheels'],
    ['max_steer_angle', 'Maximum steering angle', 'rad', .05, 1.2, .01, 'Steering'],
    ['ackermann', 'Ackermann blend', '', 0, 1, .05, 'Steering'],
] as const;
export type Tuning = Record<string, number | boolean>;
export const tuningOnly = (config: Tuning): Tuning => Object.fromEntries([...TUNING_FIELDS.map(([key]) => key), 'abs_enabled', 'tcs_enabled']
    .filter(key => key in config).map(key => [key, config[key]]));
