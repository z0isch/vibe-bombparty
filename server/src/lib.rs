use bincode::deserialize;
use serde::Deserialize;
use spacetimedb::{
    rand::RngCore, Identity, ReducerContext, ScheduleAt, SpacetimeType, Table, TimeDuration,
    Timestamp,
};
use std::collections::HashMap;

mod common;
mod player_logic;

#[derive(Deserialize)]
struct TrigramMap {
    trigrams: HashMap<String, Vec<String>>,
}
static TRIGRAM_MAP_BYTES: &[u8] = include_bytes!("../assets/trigram-words.bin");
lazy_static::lazy_static! {
    static ref TRIGRAM_MAP: HashMap<String, Vec<String>> = {
        let d: TrigramMap = deserialize(TRIGRAM_MAP_BYTES)
            .expect("Failed to deserialize trigram map");
        d.trigrams
    };
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
pub struct TrigramExample {
    pub trigram: String,
    pub example_words: Vec<String>,
}

#[derive(Clone, SpacetimeType)]
pub struct PlayerWins {
    pub player_identity: Identity,
    pub wins: u32,
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
    pub trigram_examples: Vec<TrigramExample>, // Last 3 trigrams and their example words
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

#[spacetimedb::table(name = game_state, public)]
#[derive(Clone)]
pub struct GameStateTable {
    #[primary_key]
    pub game_id: u32, // Foreign key to Game table
    pub state: GameState,
    pub updated_at: Timestamp,
    pub player_wins: Vec<PlayerWins>, // Track number of wins per player in this game
}

#[spacetimedb::table(name = game, public)]
#[derive(Clone)]
pub struct Game {
    #[primary_key]
    #[auto_inc]
    pub id: u32, // Always 1 since we only have one game
    pub name: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub player_identities: Vec<Identity>, // Track connected players
}

#[spacetimedb::table(name = turn_timeout_schedule, scheduled(turn_timeout))]
struct TurnTimeoutSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
    turn_number: u32,
    game_id: u32,
}

// Helper function to schedule a turn timeout
fn schedule_turn_timeout(ctx: &ReducerContext, state: &PlayingState, game_id: u32) {
    let timeout_micros = (state.settings.turn_timeout_seconds as i64) * 1_000_000;
    let timeout = TurnTimeoutSchedule {
        scheduled_id: 0, // Auto-incremented
        scheduled_at: (ctx.timestamp + TimeDuration::from_micros(timeout_micros)).into(),
        turn_number: state.turn_number,
        game_id,
    };
    ctx.db.turn_timeout_schedule().insert(timeout);
}

#[spacetimedb::reducer]
fn turn_timeout(ctx: &ReducerContext, arg: TurnTimeoutSchedule) -> Result<(), String> {
    if let Some(game_state) = get_game_state(ctx, arg.game_id) {
        match &game_state.state {
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
                    make_move(arg.game_id, Move::TimeUp, ctx.sender, ctx)?;
                }
                Ok(())
            }
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::table(name = game_countdown_schedule, scheduled(game_countdown))]
pub struct GameCountdownSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    pub countdown_seconds: u32,
    pub game_id: u32,
}

// Helper function to schedule game start countdown
fn schedule_game_start(ctx: &ReducerContext, countdown_seconds: u32, game_id: u32) {
    let timeout_micros = (countdown_seconds as i64) * 1_000_000;
    let countdown = GameCountdownSchedule {
        scheduled_id: 0, // Auto-incremented
        countdown_seconds,
        game_id,
        scheduled_at: (ctx.timestamp + TimeDuration::from_micros(timeout_micros)).into(),
    };
    ctx.db.game_countdown_schedule().insert(countdown);
}

#[spacetimedb::reducer]
pub fn game_countdown(ctx: &ReducerContext, arg: GameCountdownSchedule) -> Result<(), String> {
    if let Some(game_state) = get_game_state(ctx, arg.game_id) {
        match &game_state.state {
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
                    trigram_examples: Vec::new(), // Initialize empty trigram examples list
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
                schedule_turn_timeout(ctx, &playing_state, arg.game_id);

                // Create new game state with playing state
                let new_game_state = GameStateTable {
                    game_id: arg.game_id,
                    state: GameState::Playing(playing_state),
                    updated_at: ctx.timestamp,
                    player_wins: game_state.player_wins, // Preserve existing wins
                };

                // Update game state
                update_game_state(ctx, new_game_state);

                Ok(())
            }
            _ => Err("Game is not in countdown state".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
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

// Helper function to check if game is over (only one player has lives)
fn is_game_over(state: &PlayingState) -> bool {
    let players_with_lives = state.players.iter().filter(|p| p.lives > 0).count();
    players_with_lives <= 1
}

// Helper function to handle end of turn logic
fn end_turn(state: &mut PlayingState, ctx: &ReducerContext, game_id: u32) {
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
        schedule_turn_timeout(ctx, state, game_id);
    } else {
        // Store example for the final trigram before game ends
        let final_trigram = state.current_trigram.clone();
        store_trigram_example(state, &final_trigram, ctx);

        // Update winner stats if there is a winner
        if let Some(winner) = state.players.iter().find(|p| p.lives > 0) {
            let winner_id = winner.player_identity;

            // Get and update the game state to update wins
            if let Some(mut game_state) = ctx.db.game_state().game_id().find(&game_id) {
                if let Some(wins) = game_state
                    .player_wins
                    .iter_mut()
                    .find(|w| w.player_identity == winner_id)
                {
                    wins.wins += 1;
                } else {
                    game_state.player_wins.push(PlayerWins {
                        player_identity: winner_id,
                        wins: 1,
                    });
                }
                update_game_state(ctx, game_state);
            }
        }

        // Emit game over events
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
    if used_words.contains(&word.to_string()) {
        return Err("Word has already been used".to_string());
    }
    match TRIGRAM_MAP.get(&trigram.to_uppercase()) {
        Some(words) => {
            if words.contains(&word.to_uppercase()) {
                return Ok(());
            }
            return Err("Word not in dictionary".to_string());
        }
        None => return Err("Trigram not found".to_string()),
    }
}

// Helper function to update the game state
fn update_game_state(ctx: &ReducerContext, state: GameStateTable) {
    let mut updated_state = state;
    updated_state.updated_at = ctx.timestamp;
    ctx.db.game_state().game_id().update(updated_state);
}

fn make_move(
    game_id: u32,
    game_move: Move,
    player_identity: Identity,
    ctx: &ReducerContext,
) -> Result<(), String> {
    let mut game_state = get_game_state(ctx, game_id).unwrap();

    match &mut game_state.state {
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
                        pick_random_trigram_and_update(state, ctx)?;
                        state.failed_players.clear();
                    }

                    end_turn(state, ctx, game_id);

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

                            end_turn(state, ctx, game_id);

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

    update_game_state(ctx, game_state);
    Ok(())
}

// Helper function to get the game state
fn get_game_state(ctx: &ReducerContext, game_id: u32) -> Option<GameStateTable> {
    ctx.db.game_state().game_id().find(&game_id)
}

// Helper function to store a trigram example
fn store_trigram_example(state: &mut PlayingState, trigram: &str, ctx: &ReducerContext) {
    if !trigram.is_empty() {
        let example = TrigramExample {
            trigram: trigram.to_string(),
            example_words: get_example_words(trigram, ctx),
        };

        // Add to examples at the beginning
        state.trigram_examples.insert(0, example);
    }
}

// Helper function to pick a random trigram and update used trigrams
fn pick_random_trigram_and_update(
    state: &mut PlayingState,
    ctx: &ReducerContext,
) -> Result<(), String> {
    // Store current trigram in a temporary variable
    let current_trigram = state.current_trigram.clone();
    // Store example for current trigram before changing it
    store_trigram_example(state, &current_trigram, ctx);

    // Filter trigrams to only those with frequency > 200 and not used yet
    let available_trigrams: Vec<&String> = TRIGRAM_MAP
        .iter()
        .filter(|(t, words)| !state.used_trigrams.contains(t) && words.len() > 200)
        .map(|(t, _)| t)
        .collect();

    if available_trigrams.is_empty() {
        return Err("Critical error: Ran out of trigrams. This should never happen.".to_string());
    }

    // Pick a random trigram from available ones
    let random_index = ctx.rng().next_u32() as usize % available_trigrams.len();
    let new_trigram = available_trigrams[random_index].clone().to_uppercase();

    // Add the new trigram to used trigrams and update current trigram
    state.used_trigrams.push(new_trigram.clone());
    state.current_trigram = new_trigram;

    Ok(())
}

// Helper function to get random long words containing a trigram
fn get_example_words(trigram: &str, ctx: &ReducerContext) -> Vec<String> {
    if let Some(words) = TRIGRAM_MAP.get(&trigram.to_uppercase()) {
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

#[spacetimedb::reducer]
pub fn create_game(ctx: &ReducerContext, name: String) -> Result<(), String> {
    // Create new game
    let game = Game {
        id: 0, // Auto-incremented
        name,
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
        player_identities: Vec::new(),
    };
    let game = ctx.db.game().insert(game);
    let game_state = GameStateTable {
        game_id: game.id,
        state: GameState::Settings(SettingsState {
            turn_timeout_seconds: 7,
            players: Vec::new(),
        }),
        updated_at: ctx.timestamp,
        player_wins: Vec::new(), // Initialize empty wins tracking
    };
    ctx.db.game_state().insert(game_state);

    // Add the creator to the game
    add_player_to_game(ctx, game.id)?;

    Ok(())
}

#[spacetimedb::reducer]
pub fn delete_game(ctx: &ReducerContext, game_id: u32) -> Result<(), String> {
    // Check if game exists
    let _game = ctx.db.game().id().find(&game_id).ok_or("Game not found")?;

    // Only allow deletion if game is in Settings state
    if let Some(game_state) = ctx.db.game_state().game_id().find(&game_id) {
        match game_state.state {
            GameState::Settings(_) => {
                // Delete game state first (due to foreign key)
                ctx.db.game_state().game_id().delete(&game_id);
                // Then delete game
                ctx.db.game().id().delete(&game_id);
                Ok(())
            }
            GameState::Countdown(_) => Err("Cannot delete game during countdown".to_string()),
            GameState::Playing(_) => Err("Cannot delete game while in progress".to_string()),
        }
    } else {
        Err("Game state not found".to_string())
    }
}

// Initialize the game when the module is first published
#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    // No longer create a default game - games will be created by players
}

#[spacetimedb::reducer]
pub fn update_turn_timeout(ctx: &ReducerContext, game_id: u32, seconds: u32) -> Result<(), String> {
    if seconds == 0 {
        return Err("Turn timeout must be greater than 0 seconds".to_string());
    }

    if let Some(mut game_state) = get_game_state(ctx, game_id) {
        match &mut game_state.state {
            GameState::Settings(settings) => {
                settings.turn_timeout_seconds = seconds;
                update_game_state(ctx, game_state);
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

// Helper function to create a new PlayerGameData instance
fn create_initial_player_game_data(player_identity: Identity) -> PlayerGameData {
    PlayerGameData {
        player_identity,
        current_word: String::new(),
        lives: 3,                        // Start with 3 lives
        used_letters: Vec::new(),        // Initialize empty used letters
        free_letters: Vec::new(),        // Initialize empty free letters
        last_valid_guess: String::new(), // Initialize empty last valid guess
    }
}

#[spacetimedb::reducer]
pub fn register_player(ctx: &ReducerContext, username: String) -> Result<(), String> {
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

    Ok(())
}

#[spacetimedb::reducer]
pub fn add_player_to_game(ctx: &ReducerContext, game_id: u32) -> Result<(), String> {
    let player = create_initial_player_game_data(ctx.sender);

    // Update game's player_identities list
    if let Some(mut game) = ctx.db.game().id().find(&game_id) {
        if !game.player_identities.contains(&ctx.sender) {
            game.player_identities.push(ctx.sender);
            game.updated_at = ctx.timestamp;
            ctx.db.game().id().update(game);
        }
    }

    if let Some(mut game_state) = get_game_state(ctx, game_id) {
        match &mut game_state.state {
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
                update_game_state(ctx, game_state);
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
pub fn remove_player(
    ctx: &ReducerContext,
    game_id: u32,
    player_identity: Identity,
) -> Result<(), String> {
    // Update game's player_identities list
    if let Some(mut game) = ctx.db.game().id().find(&game_id) {
        if let Some(pos) = game
            .player_identities
            .iter()
            .position(|id| *id == player_identity)
        {
            game.player_identities.remove(pos);
            game.updated_at = ctx.timestamp;
            ctx.db.game().id().update(game);
        }
    }

    if let Some(mut game_state) = get_game_state(ctx, game_id) {
        match &mut game_state.state {
            GameState::Settings(settings) => {
                // Remove player from settings state
                if let Some(index) = settings
                    .players
                    .iter()
                    .position(|p| p.player_identity == player_identity)
                {
                    settings.players.remove(index);
                    update_game_state(ctx, game_state);
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
pub fn start_game(ctx: &ReducerContext, game_id: u32) -> Result<(), String> {
    if let Some(mut game_state) = get_game_state(ctx, game_id) {
        match &game_state.state {
            GameState::Settings(settings) => {
                if settings.players.is_empty() {
                    return Err("Cannot start game with no players".to_string());
                }

                if settings.players.len() < 2 {
                    return Err("Cannot start game with less than 2 players".to_string());
                }

                // Start a 5 second countdown
                let countdown_state = CountdownState {
                    countdown_seconds: 5,
                    settings: settings.clone(),
                };

                // Schedule the countdown
                schedule_game_start(ctx, 5, game_id);

                // Update game state to countdown
                game_state.state = GameState::Countdown(countdown_state);
                update_game_state(ctx, game_state);

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
pub fn update_current_word(ctx: &ReducerContext, game_id: u32, word: String) -> Result<(), String> {
    if let Some(mut game_state) = get_game_state(ctx, game_id) {
        match &mut game_state.state {
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
                    update_game_state(ctx, game_state);
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
pub fn submit_word(ctx: &ReducerContext, game_id: u32, word: String) -> Result<(), String> {
    if let Some(game_state) = get_game_state(ctx, game_id) {
        match &game_state.state {
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
                    game_id,
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
pub fn restart_game(ctx: &ReducerContext, game_id: u32) -> Result<(), String> {
    if let Some(game_state) = get_game_state(ctx, game_id) {
        match &game_state.state {
            GameState::Playing(playing_state) => {
                // Reset all players' lives and words
                let reset_players: Vec<PlayerGameData> = playing_state
                    .players
                    .iter()
                    .map(|p| create_initial_player_game_data(p.player_identity))
                    .collect();

                // Create new game state with settings state, preserving wins
                let new_game_state = GameStateTable {
                    game_id,
                    state: GameState::Settings(SettingsState {
                        turn_timeout_seconds: playing_state.settings.turn_timeout_seconds,
                        players: reset_players,
                    }),
                    updated_at: ctx.timestamp,
                    player_wins: game_state.player_wins, // Preserve existing wins
                };

                update_game_state(ctx, new_game_state);
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
