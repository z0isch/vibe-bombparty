use bincode::deserialize;
use serde::Deserialize;
use spacetimedb::{
    Identity, ReducerContext, ScheduleAt, SpacetimeType, Table, TimeDuration, Timestamp,
};
use std::collections::HashSet;

mod common;
mod player_logic;

#[derive(Clone, SpacetimeType)]
pub struct PlayerGameData {
    pub player_identity: Identity, // Reference to PlayerInfo
    pub current_word: String,
    pub lives: i32,
}

#[spacetimedb::table(name = player_info, public)]
pub struct PlayerInfoTable {
    #[primary_key]
    pub identity: Identity,
    pub username: String,
    pub is_online: bool,
    pub last_active: Timestamp,
}

#[derive(Clone, SpacetimeType)]
pub enum GameState {
    Settings(SettingsState),
    Playing(PlayingState),
}

#[derive(Clone, SpacetimeType)]
pub struct PlayerEvents {
    pub player_identity: Identity,
    pub events: Vec<GameStateEvent>,
}

#[derive(Clone, SpacetimeType)]
pub struct PlayingState {
    pub players: Vec<PlayerGameData>,
    pub current_turn_index: u32, // Index of the current player's turn
    pub turn_number: u32,        // Total number of turns that have occurred
    pub settings: SettingsState, // Settings preserved from settings state
    pub player_events: Vec<PlayerEvents>, // Events per player
}

#[derive(Clone, SpacetimeType)]
pub struct SettingsState {
    pub turn_timeout_seconds: u32,
    pub players: Vec<PlayerGameData>,
}

#[derive(Clone, SpacetimeType)]
pub struct InvalidGuessEvent {
    pub word: String,
}

#[derive(Clone, SpacetimeType)]
pub enum GameStateEvent {
    InvalidGuess(InvalidGuessEvent),
    TimeUp,
    MyTurn,
    IWin,
    ILose,
    CorrectGuess,
}

#[spacetimedb::table(name = game, public)]
#[derive(Clone)]
pub struct Game {
    #[primary_key]
    #[auto_inc]
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
struct SubmitWordMove {
    word: String,
}

#[derive(Clone, SpacetimeType)]
pub struct GuessWordMove {
    pub word: String,
}

#[derive(Clone, SpacetimeType)]
pub enum Move {
    TimeUp,
    GuessWord(GuessWordMove),
}

#[derive(Deserialize)]
struct WordSet {
    words: HashSet<String>,
}

static WORD_SET_BYTES: &[u8] = include_bytes!("../assets/words.bin");

lazy_static::lazy_static! {
    static ref VALID_WORDS: HashSet<String> = {
        let word_set: WordSet = deserialize(WORD_SET_BYTES)
            .expect("Failed to deserialize word set");
        word_set.words
    };
}

// Helper function to schedule a turn timeout
fn schedule_turn_timeout(ctx: &ReducerContext, state: &PlayingState) {
    let timeout_micros = (state.settings.turn_timeout_seconds as i64) * 1_000_000;
    let timeout = TurnTimeoutSchedule {
        scheduled_id: 0, // Auto-incremented
        scheduled_at: (ctx.timestamp + TimeDuration::from_micros(timeout_micros)).into(),
        turn_number: state.turn_number,
    };
    ctx.db.turn_timeout_schedule().insert(timeout);
}

// Helper function to check if game is over (only one player has lives)
fn is_game_over(state: &PlayingState) -> bool {
    let players_with_lives = state.players.iter().filter(|p| p.lives > 0).count();
    players_with_lives <= 1
}

// Helper function to emit game over events
fn emit_game_over_events(state: &mut PlayingState) {
    // Find the winner (player with lives > 0)
    let winner = state.players.iter().find(|p| p.lives > 0);

    // Emit events to all players
    for player_events in &mut state.player_events {
        let is_winner = winner.map_or(false, |w| {
            w.player_identity == player_events.player_identity
        });
        player_events.events.push(if is_winner {
            GameStateEvent::IWin
        } else {
            GameStateEvent::ILose
        });
    }
}

// Helper function to handle end of turn logic
fn end_turn(state: &mut PlayingState, ctx: &ReducerContext) {
    // Clear current word and advance to next player
    let current_player = &mut state.players[state.current_turn_index as usize];
    current_player.current_word = String::new();

    // Only continue the game if more than one player has lives
    if !is_game_over(state) {
        // Find next player with lives
        let mut next_index = (state.current_turn_index + 1) % state.players.len() as u32;
        while state.players[next_index as usize].lives == 0 {
            next_index = (next_index + 1) % state.players.len() as u32;
        }

        state.current_turn_index = next_index;
        state.turn_number += 1;

        // Schedule timeout for the next player's turn
        schedule_turn_timeout(ctx, state);
    } else {
        // Game is over, emit events
        emit_game_over_events(state);
    }
}

// Helper function to initialize empty events for all players
fn init_player_events(players: &[PlayerGameData]) -> Vec<PlayerEvents> {
    players
        .iter()
        .map(|player| PlayerEvents {
            player_identity: player.player_identity,
            events: Vec::new(),
        })
        .collect()
}

fn make_move(
    game: &mut Game,
    game_move: Move,
    player_identity: Identity,
    ctx: &ReducerContext,
) -> Result<(), String> {
    match &mut game.state {
        GameState::Settings(_) => {
            return Err("Cannot make moves while in settings state".to_string());
        }
        GameState::Playing(state) => {
            if state.players.is_empty() {
                return Err("No players in game".to_string());
            }

            // Don't allow moves if game is over
            if is_game_over(state) {
                return Err("Game is over".to_string());
            }

            // Clear all events at the start of each move
            state.player_events = init_player_events(&state.players);

            match game_move {
                Move::TimeUp => {
                    // Get current player before modifying state
                    let current_player_id =
                        state.players[state.current_turn_index as usize].player_identity;

                    // Emit TimeUp event to the current player
                    if let Some(player_events) = state
                        .player_events
                        .iter_mut()
                        .find(|pe| pe.player_identity == current_player_id)
                    {
                        player_events.events.push(GameStateEvent::TimeUp);
                    }

                    // Decrease lives on timeout
                    let current_player = &mut state.players[state.current_turn_index as usize];
                    current_player.lives = (current_player.lives - 1).max(0);
                    end_turn(state, ctx);

                    // If game isn't over, emit MyTurn event to the next player
                    if !is_game_over(state) {
                        let next_player_id =
                            state.players[state.current_turn_index as usize].player_identity;
                        if let Some(player_events) = state
                            .player_events
                            .iter_mut()
                            .find(|pe| pe.player_identity == next_player_id)
                        {
                            player_events.events.push(GameStateEvent::MyTurn);
                        }
                    }
                }
                Move::GuessWord(guess) => {
                    // Verify it's the player's turn
                    let current_player = &state.players[state.current_turn_index as usize];
                    if current_player.player_identity != player_identity {
                        return Err("Not your turn".to_string());
                    }

                    // Convert word to uppercase for checking
                    let word = guess.word.trim().to_uppercase();

                    // Check if word is valid
                    if !VALID_WORDS.contains(&word) {
                        if let Some(player_events) = state
                            .player_events
                            .iter_mut()
                            .find(|pe| pe.player_identity == player_identity)
                        {
                            player_events
                                .events
                                .push(GameStateEvent::InvalidGuess(InvalidGuessEvent { word }));
                        }
                        // Clear the current word on invalid guess
                        let current_player = &mut state.players[state.current_turn_index as usize];
                        current_player.current_word = String::new();
                        // Don't advance turn, let them try again
                    } else {
                        // Word is valid - emit CorrectGuess event to current player
                        if let Some(player_events) = state
                            .player_events
                            .iter_mut()
                            .find(|pe| pe.player_identity == player_identity)
                        {
                            player_events.events.push(GameStateEvent::CorrectGuess);
                        }

                        // End turn
                        end_turn(state, ctx);

                        // If game isn't over, emit MyTurn event to the next player
                        if !is_game_over(state) {
                            let next_player_id =
                                state.players[state.current_turn_index as usize].player_identity;
                            if let Some(player_events) = state
                                .player_events
                                .iter_mut()
                                .find(|pe| pe.player_identity == next_player_id)
                            {
                                player_events.events.push(GameStateEvent::MyTurn);
                            }
                        }
                    }
                }
            }
        }
    }

    update_game(ctx, game.clone());
    Ok(())
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

// Initialize the game when the module is first published
#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    let game = Game {
        id: 1,
        state: GameState::Settings(SettingsState {
            turn_timeout_seconds: 5, // Default 5 seconds timeout
            players: Vec::new(),
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
    let player_info = PlayerInfoTable {
        identity: ctx.sender,
        username,
        is_online: true,
        last_active: ctx.timestamp,
    };

    let player = PlayerGameData {
        player_identity: ctx.sender,
        current_word: String::new(),
        lives: 3, // Start with 3 lives
    };

    // Insert player info into the table
    ctx.db.player_info().insert(player_info);

    if let Some(mut game) = get_game(ctx) {
        match &mut game.state {
            GameState::Settings(settings) => {
                // Check if player already exists
                if settings
                    .players
                    .iter()
                    .any(|p| p.player_identity == ctx.sender)
                {
                    return Err("Player already registered".to_string());
                }

                settings.players.push(player);
                update_game(ctx, game);
                Ok(())
            }
            GameState::Playing(_) => Err("Cannot register while game is in progress".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer]
pub fn start_game(ctx: &ReducerContext) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &game.state {
            GameState::Settings(settings) => {
                if settings.players.is_empty() {
                    return Err("Cannot start game with no players".to_string());
                }

                // Clone the settings first so we don't have multiple borrows
                let settings_clone = settings.clone();

                // Transition to playing state
                let mut playing_state = PlayingState {
                    players: settings_clone.players.clone(),
                    current_turn_index: 0,
                    turn_number: 0,
                    settings: SettingsState {
                        turn_timeout_seconds: settings_clone.turn_timeout_seconds,
                        players: Vec::new(), // Empty players list in preserved settings
                    },
                    player_events: init_player_events(&settings_clone.players),
                };

                // Emit MyTurn event to the first player
                if let Some(player_events) = playing_state
                    .player_events
                    .iter_mut()
                    .find(|pe| pe.player_identity == playing_state.players[0].player_identity)
                {
                    player_events.events.push(GameStateEvent::MyTurn);
                }

                // Schedule the first turn timeout
                schedule_turn_timeout(ctx, &playing_state);

                game.state = GameState::Playing(playing_state);
                update_game(ctx, game);
                Ok(())
            }
            GameState::Playing(_) => Err("Game already started".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) {
    // Update player info table
    if let Some(mut player_info) = ctx.db.player_info().identity().find(&ctx.sender) {
        player_info.is_online = true;
        player_info.last_active = ctx.timestamp;
        ctx.db.player_info().identity().update(player_info);
    }
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    // Update player info table
    if let Some(mut player_info) = ctx.db.player_info().identity().find(&ctx.sender) {
        player_info.is_online = false;
        ctx.db.player_info().identity().update(player_info);
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
                    .position(|p| p.player_identity == ctx.sender)
                {
                    // Verify it's the player's turn
                    if player_index as u32 != playing_state.current_turn_index {
                        return Err("Not your turn".to_string());
                    }

                    // Clear all player events
                    playing_state.player_events = init_player_events(&playing_state.players);

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

#[spacetimedb::reducer]
pub fn submit_word(ctx: &ReducerContext, word: String) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &mut game.state {
            GameState::Settings(_) => Err("Game not in playing state".to_string()),
            GameState::Playing(playing_state) => {
                // Verify it's the player's turn
                let current_player =
                    &playing_state.players[playing_state.current_turn_index as usize];
                if current_player.player_identity != ctx.sender {
                    return Err("Not your turn".to_string());
                }

                make_move(
                    &mut game,
                    Move::GuessWord(GuessWordMove { word }),
                    ctx.sender,
                    ctx,
                )
            }
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer]
fn turn_timeout(ctx: &ReducerContext, arg: TurnTimeoutSchedule) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &mut game.state {
            GameState::Settings(_) => {
                Err("Cannot process turn timeout in settings state".to_string())
            }
            GameState::Playing(playing_state) => {
                // Only advance the turn if the timeout matches the current turn number
                // This prevents stale timeouts from affecting newer turns
                if playing_state.turn_number == arg.turn_number {
                    make_move(&mut game, Move::TimeUp, ctx.sender, ctx)?;
                }
                Ok(())
            }
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer]
pub fn restart_game(ctx: &ReducerContext) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &game.state {
            GameState::Playing(playing_state) => {
                // Only allow restart if game is over
                if !is_game_over(playing_state) {
                    return Err("Cannot restart game that is not over".to_string());
                }

                // Reset all players' lives and words
                let reset_players: Vec<PlayerGameData> = playing_state
                    .players
                    .iter()
                    .map(|p| PlayerGameData {
                        player_identity: p.player_identity,
                        current_word: String::new(),
                        lives: 3, // Reset to initial lives
                    })
                    .collect();

                // Transition back to settings state
                game.state = GameState::Settings(SettingsState {
                    turn_timeout_seconds: playing_state.settings.turn_timeout_seconds,
                    players: reset_players,
                });
                update_game(ctx, game);
                Ok(())
            }
            GameState::Settings(_) => Err("Game is already in settings state".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
}
