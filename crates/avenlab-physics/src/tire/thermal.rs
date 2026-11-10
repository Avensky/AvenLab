//! Optional lumped tire model. Simulation seconds, degrees C, gauge PSI.
//! Tuned gameplay model, not measured data for a particular tire compound.
#[derive(Clone, Copy, Debug)]
pub struct TireThermal {
    pub temp_c: f32,
    pub psi: f32,
    pub grip: f32,
}
impl Default for TireThermal {
    fn default() -> Self {
        Self {
            temp_c: 25.0,
            psi: 32.0,
            grip: 0.9,
        }
    }
}
impl TireThermal {
    /// One inexpensive update at ~10 Hz. The force solver reuses the last grip.
    pub fn step(&mut self, dt: f32, ambient: f32, speed: f32, load: f32, scrub: f32, braking: f32) {
        let speed = speed.abs().min(90.0);
        let gain = load.clamp(0.0, 2.5)
            * (0.006 * speed
                + 0.20 * scrub.abs().min(18.0)
                + 0.055 * braking.clamp(0.0, 1.0) * speed);
        let cooling = (self.temp_c - ambient) * (0.012 + 0.00045 * speed);
        self.temp_c = (self.temp_c + (gain - cooling) * dt).clamp(-30.0, 155.0);
        // Constant-volume absolute pressure referenced to 32 PSI gauge at 25 C.
        self.psi = ((32.0 + 14.7) * (self.temp_c + 273.15) / 298.15) - 14.7;
        let cold = ((60.0 - self.temp_c) / 40.0).clamp(0.0, 1.0);
        let hot = ((self.temp_c - 80.0) / 65.0).clamp(0.0, 1.0);
        let inflation = (1.0 - 0.008 * (self.psi - 37.0).abs()).clamp(0.84, 1.0);
        self.grip = ((1.0 - 0.075 * cold - 0.24 * hot) * inflation).clamp(0.65, 1.0);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sustained_scrub_heats_and_inflates_then_unloaded_tire_cools() {
        let mut tire = TireThermal::default();
        let cold = tire;
        for _ in 0..500 {
            tire.step(0.1, 25.0, 30.0, 1.1, 8.0, 0.7);
        }
        assert!(tire.temp_c > cold.temp_c + 20.0 && tire.psi > cold.psi + 2.0);
        let warm = tire;
        for _ in 0..5000 {
            tire.step(0.1, 25.0, 0.0, 0.0, 0.0, 0.0);
        }
        assert!(tire.temp_c < warm.temp_c && (tire.psi - 32.0).abs() < 0.1);
        for _ in 0..3000 {
            tire.step(0.1, 25.0, 70.0, 2.0, 18.0, 1.0);
        }
        assert!(tire.grip < warm.grip && tire.grip >= 0.65 && tire.temp_c <= 155.0);
    }
}
