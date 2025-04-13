use spacetimedb::{
    Identity, ReducerContext, ScheduleAt, SpacetimeType, Table, TimeDuration, Timestamp,
};

mod common;
mod player_logic;

#[derive(Clone, SpacetimeType)]
pub struct PlayerData {
    pub identity: Identity,
    pub username: String,
    pub score: i32,
    pub last_active: Timestamp,
    pub is_online: bool,
    pub current_word: String,
}

#[derive(Clone, SpacetimeType)]
pub enum GameState {
    Settings(SettingsState),
    Playing(PlayingState),
}

#[derive(Clone, SpacetimeType)]
pub struct PlayingState {
    pub players: Vec<PlayerData>,
    pub current_turn_index: u32, // Index of the current player's turn
    pub turn_number: u32,        // Total number of turns that have occurred
    pub settings: SettingsState, // Settings preserved from settings state
}

#[derive(Clone, SpacetimeType)]
pub struct SettingsState {
    pub turn_timeout_seconds: u32,
}

#[spacetimedb::table(name = game, public)]
#[derive(Clone)]
pub struct Game {
    #[primary_key]
    pub id: u32, // Always 1 since we only have one game
    pub state: GameState,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[spacetimedb::table(name = turn_timeout_schedule, scheduled(turn_timeout))]
struct TurnTimeoutSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
    turn_number: u32, // Track which turn this timeout is for
}

#[derive(SpacetimeType)]
struct TimeUpMove {}

#[derive(SpacetimeType)]
struct EndTurnMove {}

#[derive(SpacetimeType)]
enum Move {
    TimeUp(TimeUpMove),
    EndTurn(EndTurnMove),
}

#[spacetimedb::reducer]
fn turn_timeout(ctx: &ReducerContext, arg: TurnTimeoutSchedule) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &game.state {
            GameState::Settings(_) => {
                Err("Cannot process turn timeout in settings state".to_string())
            }
            GameState::Playing(playing_state) => {
                // Only advance the turn if the timeout matches the current turn number
                // This prevents stale timeouts from affecting newer turns
                if playing_state.turn_number == arg.turn_number {
                    // Advance to next turn (which will schedule the next timeout)
                    advance_turn(ctx, &mut game, Move::TimeUp(TimeUpMove {}))?;
                    update_game(ctx, game);
                }
                Ok(())
            }
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

// Helper function to get the game
fn get_game(ctx: &ReducerContext) -> Option<Game> {
    ctx.db.game().id().find(&1)
}

// Helper function to update the game
fn update_game(ctx: &ReducerContext, mut game: Game) {
    game.updated_at = ctx.timestamp;
    ctx.db.game().id().update(game);
}

// Helper function to advance to the next turn
fn advance_turn(ctx: &ReducerContext, game: &mut Game, move_type: Move) -> Result<(), String> {
    match &mut game.state {
        GameState::Settings(_) => Err("Cannot advance turn in settings state".to_string()),
        GameState::Playing(playing_state) => {
            if playing_state.players.is_empty() {
                playing_state.current_turn_index = 0;
                return Ok(());
            }

            // Clear the current player's word
            if let Some(current_player) = playing_state
                .players
                .get_mut(playing_state.current_turn_index as usize)
            {
                current_player.current_word = String::new();
            }

            match move_type {
                Move::TimeUp(_) => {
                    // For time up moves, we don't modify the current player's score
                    // Just advance to the next player
                }
                Move::EndTurn(_) => {
                    // For end turn moves, add 1 to the current player's score
                    if let Some(current_player) = playing_state
                        .players
                        .get_mut(playing_state.current_turn_index as usize)
                    {
                        current_player.score += 1;
                    }
                }
            }

            // Common logic for all move types - advance to next player
            playing_state.current_turn_index =
                (playing_state.current_turn_index + 1) % playing_state.players.len() as u32;
            playing_state.turn_number += 1;

            // Schedule the next turn timeout using the settings
            let timeout_micros = (playing_state.settings.turn_timeout_seconds as i64) * 1_000_000;
            let timeout = TurnTimeoutSchedule {
                scheduled_id: 0, // Auto-incremented
                scheduled_at: (ctx.timestamp + TimeDuration::from_micros(timeout_micros)).into(),
                turn_number: playing_state.turn_number,
            };
            ctx.db.turn_timeout_schedule().insert(timeout);
            Ok(())
        }
    }
}

// Initialize the game when the module is first published
#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    let game = Game {
        id: 1,
        state: GameState::Settings(SettingsState {
            turn_timeout_seconds: 5, // Default 5 seconds timeout
        }),
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    };
    ctx.db.game().insert(game);
}

#[spacetimedb::reducer]
pub fn update_turn_timeout(ctx: &ReducerContext, seconds: u32) -> Result<(), String> {
    if seconds == 0 {
        return Err("Turn timeout must be greater than 0 seconds".to_string());
    }

    if let Some(mut game) = get_game(ctx) {
        match &mut game.state {
            GameState::Settings(settings) => {
                settings.turn_timeout_seconds = seconds;
                update_game(ctx, game);
                Ok(())
            }
            GameState::Playing(_) => {
                Err("Cannot update turn timeout while game is in progress".to_string())
            }
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer]
pub fn register_player(ctx: &ReducerContext, username: String) -> Result<(), String> {
    let player = PlayerData {
        identity: ctx.sender,
        username,
        score: 0,
        last_active: ctx.timestamp,
        is_online: true,
        current_word: String::new(),
    };

    if let Some(mut game) = get_game(ctx) {
        match &mut game.state {
            GameState::Settings(settings) => {
                // Start with an empty playing state when first player joins, preserving the settings
                game.state = GameState::Playing(PlayingState {
                    players: vec![player],
                    current_turn_index: 0,
                    turn_number: 0,
                    settings: settings.clone(),
                });
                update_game(ctx, game);
                Ok(())
            }
            GameState::Playing(playing_state) => {
                // Check if player already exists
                if playing_state
                    .players
                    .iter()
                    .any(|p| p.identity == ctx.sender)
                {
                    return Err("Player already registered".to_string());
                }

                playing_state.players.push(player);
                update_game(ctx, game);
                Ok(())
            }
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer]
pub fn end_turn(ctx: &ReducerContext) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &mut game.state {
            GameState::Settings(_) => Err("Game not in playing state".to_string()),
            GameState::Playing(playing_state) => {
                // Verify it's the sender's turn
                if playing_state.players.is_empty() {
                    return Err("No players in game".to_string());
                }

                let current_player =
                    &playing_state.players[playing_state.current_turn_index as usize];
                if current_player.identity != ctx.sender {
                    return Err("Not your turn".to_string());
                }

                // Advance to next turn with EndTurn move type
                advance_turn(ctx, &mut game, Move::EndTurn(EndTurnMove {}))?;
                update_game(ctx, game);
                Ok(())
            }
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) {
    if let Some(mut game) = get_game(ctx) {
        if let GameState::Playing(playing_state) = &mut game.state {
            if let Some(player) = playing_state
                .players
                .iter_mut()
                .find(|p| p.identity == ctx.sender)
            {
                player.is_online = true;
                player.last_active = ctx.timestamp;
                update_game(ctx, game);
            }
        }
    }
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    if let Some(mut game) = get_game(ctx) {
        if let GameState::Playing(playing_state) = &mut game.state {
            if let Some(player) = playing_state
                .players
                .iter_mut()
                .find(|p| p.identity == ctx.sender)
            {
                player.is_online = false;
                update_game(ctx, game);
            }
        }
    }
}

#[spacetimedb::reducer]
pub fn update_current_word(ctx: &ReducerContext, word: String) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &mut game.state {
            GameState::Settings(_) => Err("Game not in playing state".to_string()),
            GameState::Playing(playing_state) => {
                // Find the player's index
                if let Some(player_index) = playing_state
                    .players
                    .iter()
                    .position(|p| p.identity == ctx.sender)
                {
                    // Verify it's the player's turn
                    if player_index as u32 != playing_state.current_turn_index {
                        return Err("Not your turn".to_string());
                    }

                    // Update the player's current word
                    playing_state.players[player_index].current_word = word;
                    update_game(ctx, game);
                    Ok(())
                } else {
                    Err("Player not found".to_string())
                }
            }
        }
    } else {
        Err("Game not initialized".to_string())
    }
}
