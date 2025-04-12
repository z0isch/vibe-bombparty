use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameConfig {
    pub min_players: u32,
    pub max_players: u32,
    pub round_time_seconds: u32,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            min_players: 2,
            max_players: 8,
            round_time_seconds: 60,
        }
    }
}
