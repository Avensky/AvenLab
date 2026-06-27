#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TireState {
    Grip,
    Slide,
    Lock,
}

pub fn update_tire_state(
    prev: TireState,
    nx: f32,
    ny: f32,
    brake: f32,
    speed: f32,
) -> TireState {

    // Hard lock condition (brake dominates)
    if brake > 0.85 && speed > 1.0 && nx > 0.9 {
        return TireState::Lock;
    }

    // Saturated friction (combined slip)
    if nx * nx + ny * ny > 1.0 {
        return TireState::Slide;
    }

    // Recover logic
    match prev {
        TireState::Lock => {
            if brake < 0.3 || speed < 0.5 {
                TireState::Grip
            } else {
                TireState::Lock
            }
        }
        TireState::Slide => {
            if nx < 0.7 && ny < 0.7 {
                TireState::Grip
            } else {
                TireState::Slide
            }
        }
        TireState::Grip => TireState::Grip,
    }
}