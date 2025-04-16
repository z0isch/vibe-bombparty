use bincode::deserialize;
use serde::Deserialize;
use spacetimedb::{
    rand::RngCore, Identity, ReducerContext, ScheduleAt, SpacetimeType, Table, TimeDuration,
    Timestamp,
};
use std::collections::{HashMap, HashSet};

mod common;
mod player_logic;

#[derive(Deserialize)]
struct TrigramData {
    trigrams: Vec<TrigramFreq>,
}

#[derive(Deserialize)]
struct TrigramFreq {
    trigram: String,
    frequency: u32,
}

#[derive(Deserialize)]
struct TrigramMap {
    trigrams: HashMap<String, Vec<String>>,
}

#[derive(Clone, SpacetimeType)]
pub struct PlayerGameData {
    pub player_identity: Identity, // Reference to PlayerInfo
    pub current_word: String,
    pub lives: i32,
    pub used_letters: Vec<String>, // Track letters used by this player
    pub free_letters: Vec<String>, // Track letters that were awarded for free
    pub last_valid_guess: String,  // Track the player's last valid guess
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
    Countdown(CountdownState),
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
    pub current_trigram: String, // Current trigram that must be contained in valid words
    pub failed_players: Vec<Identity>, // Players who have failed with the current trigram
    pub used_words: Vec<String>, // Track words that have been used
    pub used_trigrams: Vec<String>, // Track trigrams that have been used
    pub failed_trigram_examples: Vec<String>, // Example words for the last trigram that all players failed on
}

#[derive(Clone, SpacetimeType)]
pub struct SettingsState {
    pub turn_timeout_seconds: u32,
    pub players: Vec<PlayerGameData>,
}

#[derive(Clone, SpacetimeType)]
pub struct CountdownState {
    pub countdown_seconds: u32,
    pub settings: SettingsState,
}

#[derive(Clone, SpacetimeType)]
pub struct InvalidGuessEvent {
    pub word: String,
    pub reason: String,
}

#[derive(Clone, SpacetimeType)]
pub struct FreeLetterAwardEvent {
    pub letter: String,
}

#[derive(Clone, SpacetimeType)]
pub enum GameStateEvent {
    InvalidGuess(InvalidGuessEvent),
    TimeUp,
    MyTurn,
    IWin,
    ILose,
    CorrectGuess,
    LifeEarned,
    FreeLetterAward(FreeLetterAwardEvent),
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

#[spacetimedb::table(name = game_countdown_schedule, scheduled(game_countdown))]
pub struct GameCountdownSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    pub countdown_seconds: u32,
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
static TRIGRAM_DATA_BYTES: &[u8] = include_bytes!("../assets/histogram.bin");
static TRIGRAM_MAP_BYTES: &[u8] = include_bytes!("../assets/trigram-words.bin");

lazy_static::lazy_static! {
    static ref VALID_WORDS: HashSet<String> = {
        let word_set: WordSet = deserialize(WORD_SET_BYTES)
            .expect("Failed to deserialize word set");
        word_set.words
    };

    static ref TRIGRAM_DATA: TrigramData = {
        deserialize(TRIGRAM_DATA_BYTES)
            .expect("Failed to deserialize trigram data")
    };

    static ref TRIGRAM_MAP: TrigramMap = {
        deserialize(TRIGRAM_MAP_BYTES)
            .expect("Failed to deserialize trigram map")
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
        // Game is over, store example words for the final trigram
        state.failed_trigram_examples = get_example_words(&state.current_trigram, ctx);
        // Emit game over events
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

// Helper function to check if a word is valid
fn is_word_valid(word: &str, trigram: &str, used_words: &[String]) -> Result<(), String> {
    if !VALID_WORDS.contains(word) {
        return Err("Word not in dictionary".to_string());
    }
    if !word.contains(trigram) {
        return Err(format!("Word does not contain trigram '{}'", trigram));
    }
    if used_words.contains(&word.to_string()) {
        return Err("Word has already been used".to_string());
    }
    Ok(())
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
        GameState::Countdown(_) => {
            return Err("Cannot make moves during countdown".to_string());
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

                    // Add player to failed_players list
                    if !state.failed_players.contains(&current_player_id) {
                        state.failed_players.push(current_player_id);
                    }

                    // Decrease lives on timeout and clear last valid guess
                    let current_player = &mut state.players[state.current_turn_index as usize];
                    current_player.lives = (current_player.lives - 1).max(0);
                    current_player.last_valid_guess = String::new(); // Clear last valid guess on timeout

                    // Check if all players with lives have failed with this trigram
                    let active_players: Vec<_> = state
                        .players
                        .iter()
                        .filter(|p| p.lives > 0)
                        .map(|p| p.player_identity)
                        .collect();

                    let all_active_failed = active_players
                        .iter()
                        .all(|id| state.failed_players.contains(id));

                    // If all active players have failed, get example words and pick a new trigram
                    if all_active_failed {
                        // Store example words for the failed trigram before changing it
                        state.failed_trigram_examples =
                            get_example_words(&state.current_trigram, ctx);
                        pick_random_trigram_and_update(state, ctx)?;
                        state.failed_players.clear();
                    }

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
                    match is_word_valid(&word, &state.current_trigram, &state.used_words) {
                        Ok(()) => {
                            // Word is valid - emit CorrectGuess event to current player
                            if let Some(player_events) = state
                                .player_events
                                .iter_mut()
                                .find(|pe| pe.player_identity == player_identity)
                            {
                                player_events.events.push(GameStateEvent::CorrectGuess);
                            }

                            // Add word to used words list
                            state.used_words.push(word.clone());

                            // Clear failed trigram examples since we had a successful word
                            state.failed_trigram_examples.clear();

                            // Update player's used letters and last valid guess
                            let current_player =
                                &mut state.players[state.current_turn_index as usize];
                            current_player.last_valid_guess = word.clone(); // Store the last valid guess
                            for c in word.chars() {
                                let letter = c.to_string().to_uppercase();
                                if !current_player.used_letters.contains(&letter) {
                                    current_player.used_letters.push(letter);
                                }
                            }

                            // Award a random free letter if word is longer than 10 letters
                            if word.len() > 10 {
                                // Get all unused letters (not in used_letters or free_letters)
                                let unused_letters: Vec<String> = ('A'..='Z')
                                    .map(|c| c.to_string())
                                    .filter(|letter| {
                                        !current_player.used_letters.contains(letter)
                                            && !current_player.free_letters.contains(letter)
                                    })
                                    .collect();

                                // Only award a letter if there are unused ones available
                                if !unused_letters.is_empty() {
                                    // Pick a random unused letter
                                    let random_index =
                                        ctx.rng().next_u32() as usize % unused_letters.len();
                                    let letter = unused_letters[random_index].clone();

                                    // Add to free letters
                                    current_player.free_letters.push(letter.clone());

                                    // Emit FreeLetterAward event
                                    if let Some(player_events) = state
                                        .player_events
                                        .iter_mut()
                                        .find(|pe| pe.player_identity == player_identity)
                                    {
                                        player_events.events.push(GameStateEvent::FreeLetterAward(
                                            FreeLetterAwardEvent { letter },
                                        ));
                                    }
                                }
                            }

                            // Check if player has used all letters (a-z)
                            let has_all_letters = ('A'..='Z').all(|c| {
                                let letter = c.to_string();
                                current_player.used_letters.contains(&letter)
                                    || current_player.free_letters.contains(&letter)
                            });

                            if has_all_letters {
                                // Award an extra life
                                current_player.lives += 1;
                                // Reset used letters and free letters
                                current_player.used_letters.clear();
                                current_player.free_letters.clear();
                                // Emit LifeEarned event
                                if let Some(player_events) = state
                                    .player_events
                                    .iter_mut()
                                    .find(|pe| pe.player_identity == player_identity)
                                {
                                    player_events.events.push(GameStateEvent::LifeEarned);
                                }
                            }

                            // Pick a new trigram on successful word
                            pick_random_trigram_and_update(state, ctx)?;
                            state.failed_players.clear();

                            end_turn(state, ctx);

                            // If game isn't over, emit MyTurn event to the next player
                            if !is_game_over(state) {
                                let next_player_id = state.players
                                    [state.current_turn_index as usize]
                                    .player_identity;
                                if let Some(player_events) = state
                                    .player_events
                                    .iter_mut()
                                    .find(|pe| pe.player_identity == next_player_id)
                                {
                                    player_events.events.push(GameStateEvent::MyTurn);
                                }
                            }
                        }
                        Err(reason) => {
                            if let Some(player_events) = state
                                .player_events
                                .iter_mut()
                                .find(|pe| pe.player_identity == player_identity)
                            {
                                player_events.events.push(GameStateEvent::InvalidGuess(
                                    InvalidGuessEvent { word, reason },
                                ));
                            }
                            // Clear the current word on invalid guess
                            let current_player =
                                &mut state.players[state.current_turn_index as usize];
                            current_player.current_word = String::new();
                            // Don't advance turn, let them try again
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

// Helper function to pick a random trigram and update used trigrams
fn pick_random_trigram_and_update(
    state: &mut PlayingState,
    ctx: &ReducerContext,
) -> Result<(), String> {
    // Filter trigrams to only those with frequency > 200 and not used yet
    let available_trigrams: Vec<&TrigramFreq> = TRIGRAM_DATA
        .trigrams
        .iter()
        .filter(|t| t.frequency > 200 && !state.used_trigrams.contains(&t.trigram.to_uppercase()))
        .collect();

    if available_trigrams.is_empty() {
        return Err("Critical error: Ran out of trigrams. This should never happen.".to_string());
    }

    // Pick a random trigram from available ones
    let random_index = ctx.rng().next_u32() as usize % available_trigrams.len();
    let new_trigram = available_trigrams[random_index]
        .trigram
        .clone()
        .to_uppercase();

    // Add the new trigram to used trigrams and update current trigram
    state.used_trigrams.push(new_trigram.clone());
    state.current_trigram = new_trigram;
    Ok(())
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
            GameState::Countdown(_) => {
                Err("Cannot update turn timeout during countdown".to_string())
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
    let player = PlayerGameData {
        player_identity: ctx.sender,
        current_word: String::new(),
        lives: 3,                        // Start with 3 lives
        used_letters: Vec::new(),        // Initialize empty used letters
        free_letters: Vec::new(),        // Initialize empty free letters
        last_valid_guess: String::new(), // Initialize empty last valid guess
    };

    // Check if player info already exists
    if let Some(mut existing_player_info) = ctx.db.player_info().identity().find(&ctx.sender) {
        // Update existing player info
        existing_player_info.is_online = true;
        existing_player_info.last_active = ctx.timestamp;
        existing_player_info.username = username;
        ctx.db.player_info().identity().update(existing_player_info);
    } else {
        // Create new player info
        let player_info = PlayerInfoTable {
            identity: ctx.sender,
            username,
            is_online: true,
            last_active: ctx.timestamp,
        };
        ctx.db.player_info().insert(player_info);
    }

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
            GameState::Countdown(_) => Err("Cannot register during countdown".to_string()),
            GameState::Playing(_) => Err("Cannot register while game is in progress".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer]
pub fn remove_player(ctx: &ReducerContext, player_identity: Identity) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &mut game.state {
            GameState::Settings(settings) => {
                // Remove player from settings state
                if let Some(index) = settings
                    .players
                    .iter()
                    .position(|p| p.player_identity == player_identity)
                {
                    settings.players.remove(index);
                    update_game(ctx, game);
                    Ok(())
                } else {
                    Err("Player not found".to_string())
                }
            }
            GameState::Countdown(_) => Err("Cannot remove player during countdown".to_string()),
            GameState::Playing(_) => {
                Err("Cannot remove player while game is in progress".to_string())
            }
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

                // Start a 5 second countdown
                let countdown_state = CountdownState {
                    countdown_seconds: 5,
                    settings: settings.clone(),
                };

                // Schedule the countdown
                schedule_game_start(ctx, 5);

                // Update game state to countdown
                game.state = GameState::Countdown(countdown_state);
                update_game(ctx, game);

                Ok(())
            }
            GameState::Countdown(_) => Err("Game is already in countdown".to_string()),
            GameState::Playing(_) => Err("Game already in progress".to_string()),
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
            GameState::Countdown(_) => Err("Cannot update word during countdown".to_string()),
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
            GameState::Countdown(_) => Err("Cannot submit word during countdown".to_string()),
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
            GameState::Countdown(_) => {
                Err("Cannot process turn timeout during countdown".to_string())
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
                // Reset all players' lives and words
                let reset_players: Vec<PlayerGameData> = playing_state
                    .players
                    .iter()
                    .map(|p| PlayerGameData {
                        player_identity: p.player_identity,
                        current_word: String::new(),
                        lives: 3,                        // Reset to initial lives
                        used_letters: Vec::new(),        // Reset used letters
                        free_letters: Vec::new(),        // Reset free letters
                        last_valid_guess: String::new(), // Reset last valid guess
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
            GameState::Settings(_) => {
                // Already in settings state, nothing to do
                Ok(())
            }
            GameState::Countdown(_) => Err("Cannot restart game during countdown".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

// Helper function to schedule game start countdown
fn schedule_game_start(ctx: &ReducerContext, countdown_seconds: u32) {
    let timeout_micros = (countdown_seconds as i64) * 1_000_000;
    let countdown = GameCountdownSchedule {
        scheduled_id: 0, // Auto-incremented
        countdown_seconds,
        scheduled_at: (ctx.timestamp + TimeDuration::from_micros(timeout_micros)).into(),
    };
    ctx.db.game_countdown_schedule().insert(countdown);
}

#[spacetimedb::reducer]
pub fn game_countdown(ctx: &ReducerContext, _arg: GameCountdownSchedule) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        match &game.state {
            GameState::Countdown(countdown_state) => {
                // Clone the settings first so we don't have multiple borrows
                let settings_clone = countdown_state.settings.clone();

                // Create a shuffled vector of player indices
                let mut player_indices: Vec<usize> = (0..settings_clone.players.len()).collect();
                for i in (1..player_indices.len()).rev() {
                    let j = ctx.rng().next_u32() as usize % (i + 1);
                    player_indices.swap(i, j);
                }

                // Create shuffled players vector
                let shuffled_players: Vec<PlayerGameData> = player_indices
                    .iter()
                    .map(|&i| settings_clone.players[i].clone())
                    .collect();

                // Create playing state with shuffled players
                let mut playing_state = PlayingState {
                    players: shuffled_players,
                    current_turn_index: 0, // First player in shuffled list goes first
                    turn_number: 0,
                    settings: SettingsState {
                        turn_timeout_seconds: settings_clone.turn_timeout_seconds,
                        players: Vec::new(), // Empty players list in preserved settings
                    },
                    player_events: init_player_events(&settings_clone.players),
                    current_trigram: String::new(), // Will be set by pick_random_trigram_and_update
                    failed_players: Vec::new(),
                    used_words: Vec::new(),
                    used_trigrams: Vec::new(),
                    failed_trigram_examples: Vec::new(), // Initialize empty failed trigram examples
                };

                // Pick initial random trigram
                pick_random_trigram_and_update(&mut playing_state, ctx)?;

                // Emit MyTurn event to the first player in shuffled order
                if let Some(player_events) = playing_state
                    .player_events
                    .iter_mut()
                    .find(|pe| pe.player_identity == playing_state.players[0].player_identity)
                {
                    player_events.events.push(GameStateEvent::MyTurn);
                }

                // Schedule the first turn timeout
                schedule_turn_timeout(ctx, &playing_state);

                // Update game state
                game.state = GameState::Playing(playing_state);
                update_game(ctx, game);

                Ok(())
            }
            _ => Err("Game is not in countdown state".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

// Helper function to get random long words containing a trigram
fn get_example_words(trigram: &str, ctx: &ReducerContext) -> Vec<String> {
    let trigram_lower = trigram.to_lowercase();
    if let Some(words) = TRIGRAM_MAP.trigrams.get(&trigram_lower) {
        // Filter for words longer than 10 characters
        let long_words: Vec<String> = words.iter().filter(|w| w.len() > 10).cloned().collect();

        if long_words.is_empty() {
            return Vec::new();
        }

        // Get up to 3 random words
        let mut rng = ctx.rng();
        let mut selected_words = Vec::new();
        let mut indices: Vec<usize> = (0..long_words.len()).collect();

        // Shuffle indices
        for i in (1..indices.len()).rev() {
            let j = rng.next_u32() as usize % (i + 1);
            indices.swap(i, j);
        }

        // Take up to 3 words
        for &idx in indices.iter().take(3) {
            selected_words.push(long_words[idx].to_uppercase());
        }

        selected_words
    } else {
        Vec::new()
    }
}
