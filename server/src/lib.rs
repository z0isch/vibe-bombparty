use spacetimedb::{
    rand::RngCore, Identity, ReducerContext, ScheduleAt, SpacetimeType, Table, TimeDuration,
    Timestamp,
};

mod trigram;

#[derive(Clone, SpacetimeType)]
pub struct PastGuess {
    pub word: String,
    pub round_number: u32,
}

#[derive(Clone, SpacetimeType)]
pub struct PlayerGameData {
    pub player_identity: Identity, // Reference to PlayerInfo
    pub current_word: String,
    pub lives: i32,
    pub used_letters: Vec<String>, // Track letters used by this player
    pub free_letters: Vec<String>, // Track letters that were awarded for free
    pub past_guesses: Vec<PastGuess>, // Stack of past guesses (most recent last)
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
    pub valid_words: Vec<PastGuess>, // All guesses for this trigram (most recent last)
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
    pub trigram_examples: Vec<TrigramExample>, // Last 3 trigrams and their example words
    pub winner: Option<Identity>, // The winner's identity if the game is over
}

#[derive(Clone, Copy, SpacetimeType)]
pub enum WinCondition {
    LastPlayerStanding,
    UseAllLetters,
}

#[derive(Clone, SpacetimeType)]
pub struct SettingsState {
    pub turn_timeout_seconds: u32,
    pub players: Vec<PlayerGameData>,
    pub win_condition: WinCondition,
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
    if let Some(mut game_state) = get_game_state(ctx, arg.game_id) {
        match &mut game_state.state {
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
                        win_condition: settings_clone.win_condition,
                    },
                    player_events: init_player_events(&settings_clone.players),
                    current_trigram: String::new(), // Will be set by pick_random_trigram_and_update
                    failed_players: Vec::new(),
                    trigram_examples: Vec::new(), // Initialize empty trigram examples list
                    winner: None,
                };

                // Pick initial random trigram
                pick_random_trigram_and_update(&mut playing_state, ctx);

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

                game_state.state = GameState::Playing(playing_state);
                game_state.updated_at = ctx.timestamp;
                update_game_state(ctx, game_state);

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
fn has_winner(state: &PlayingState) -> Option<Identity> {
    match state.settings.win_condition {
        WinCondition::LastPlayerStanding => {
            let players_with_lives: Vec<_> = state.players.iter().filter(|p| p.lives > 0).collect();
            if players_with_lives.len() <= 1 {
                players_with_lives.first().map(|p| p.player_identity)
            } else {
                None
            }
        }
        WinCondition::UseAllLetters => state
            .players
            .iter()
            .find(|p| {
                ('A'..='Z').all(|c| {
                    let letter = c.to_string();
                    p.used_letters.contains(&letter) || p.free_letters.contains(&letter)
                })
            })
            .map(|p| p.player_identity),
    }
}

// Helper function to handle end of turn logic
fn end_turn(game_state: &mut GameStateTable, ctx: &ReducerContext, game_id: u32) {
    match &mut game_state.state {
        GameState::Settings(_) => {
            return;
        }
        GameState::Countdown(_) => {
            return;
        }
        GameState::Playing(state) => {
            let win_condition = state.settings.win_condition.clone();
            let current_player = &mut state.players[state.current_turn_index as usize];
            current_player.current_word = String::new();
            let winner = has_winner(state);
            match winner {
                None => {
                    let next_index = match win_condition {
                        WinCondition::LastPlayerStanding => {
                            let mut idx =
                                (state.current_turn_index + 1) % state.players.len() as u32;
                            while state.players[idx as usize].lives == 0 {
                                idx = (idx + 1) % state.players.len() as u32;
                            }
                            idx
                        }
                        WinCondition::UseAllLetters => {
                            (state.current_turn_index + 1) % state.players.len() as u32
                        }
                    };
                    state.current_turn_index = next_index;
                    state.turn_number += 1;
                    schedule_turn_timeout(ctx, state, game_id);
                }
                Some(winner) => {
                    // Store example for the final trigram before game ends
                    let final_trigram = state.current_trigram.clone();
                    store_trigram_example(state, &final_trigram, ctx);
                    state.winner = Some(winner);
                    if let Some(wins) = game_state
                        .player_wins
                        .iter_mut()
                        .find(|w| w.player_identity == winner)
                    {
                        wins.wins += 1;
                    } else {
                        game_state.player_wins.push(PlayerWins {
                            player_identity: winner,
                            wins: 1,
                        });
                    }
                    for player_events in &mut state.player_events {
                        player_events
                            .events
                            .push(if player_events.player_identity == winner {
                                GameStateEvent::IWin
                            } else {
                                GameStateEvent::ILose
                            });
                    }
                }
            }
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
    trigram::is_word_valid(word, trigram, used_words)
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
    let should_end_turn = || match &mut game_state.state {
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
            if has_winner(state).is_some() {
                return Err("Game is over".to_string());
            }
            state.player_events = init_player_events(&state.players);
            match game_move {
                Move::TimeUp => {
                    let win_condition = &state.settings.win_condition;
                    let current_player_id =
                        state.players[state.current_turn_index as usize].player_identity;
                    if let Some(player_events) = state
                        .player_events
                        .iter_mut()
                        .find(|pe| pe.player_identity == current_player_id)
                    {
                        player_events.events.push(GameStateEvent::TimeUp);
                    }
                    match win_condition {
                        WinCondition::LastPlayerStanding => {
                            if !state.failed_players.contains(&current_player_id) {
                                state.failed_players.push(current_player_id);
                            }
                            let current_player =
                                &mut state.players[state.current_turn_index as usize];
                            current_player.lives = (current_player.lives - 1).max(0);
                            current_player.past_guesses.clear();
                            let active_players: Vec<_> = state
                                .players
                                .iter()
                                .filter(|p| p.lives > 0)
                                .map(|p| p.player_identity)
                                .collect();
                            let all_active_failed = active_players
                                .iter()
                                .all(|id| state.failed_players.contains(id));
                            if all_active_failed {
                                pick_random_trigram_and_update(state, ctx);
                                state.failed_players.clear();
                            }
                        }
                        WinCondition::UseAllLetters => {
                            if !state.failed_players.contains(&current_player_id) {
                                state.failed_players.push(current_player_id);
                            }
                            let all_failed = state
                                .players
                                .iter()
                                .all(|p| state.failed_players.contains(&p.player_identity));
                            if all_failed {
                                pick_random_trigram_and_update(state, ctx);
                                state.failed_players.clear();
                            }
                        }
                    }
                    if has_winner(state).is_none() {
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
                    return Ok(true);
                }
                Move::GuessWord(guess) => {
                    let win_condition = &state.settings.win_condition;
                    let current_player = &state.players[state.current_turn_index as usize];
                    if current_player.player_identity != player_identity {
                        return Err("Not your turn".to_string());
                    }
                    let word = guess.word.trim().to_uppercase();
                    match is_word_valid(&word, &state.current_trigram, &get_used_words(state)) {
                        Ok(()) => {
                            if let Some(player_events) = state
                                .player_events
                                .iter_mut()
                                .find(|pe| pe.player_identity == player_identity)
                            {
                                player_events.events.push(GameStateEvent::CorrectGuess);
                            }
                            let current_player =
                                &mut state.players[state.current_turn_index as usize];
                            current_player.past_guesses.push(PastGuess {
                                word: word.clone(),
                                round_number: state.turn_number,
                            });
                            for c in word.chars() {
                                let letter = c.to_string().to_uppercase();
                                if !current_player.used_letters.contains(&letter) {
                                    current_player.used_letters.push(letter);
                                }
                            }
                            if word.len() > 10 {
                                let unused_letters: Vec<String> = ('A'..='Z')
                                    .map(|c| c.to_string())
                                    .filter(|letter| {
                                        !current_player.used_letters.contains(letter)
                                            && !current_player.free_letters.contains(letter)
                                    })
                                    .collect();
                                if !unused_letters.is_empty() {
                                    let random_index =
                                        ctx.rng().next_u32() as usize % unused_letters.len();
                                    let letter = unused_letters[random_index].clone();
                                    current_player.free_letters.push(letter.clone());
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
                            let has_all_letters = ('A'..='Z').all(|c| {
                                let letter = c.to_string();
                                current_player.used_letters.contains(&letter)
                                    || current_player.free_letters.contains(&letter)
                            });
                            match win_condition {
                                WinCondition::LastPlayerStanding => {
                                    if has_all_letters {
                                        current_player.lives += 1;
                                        current_player.used_letters.clear();
                                        current_player.free_letters.clear();
                                        if let Some(player_events) = state
                                            .player_events
                                            .iter_mut()
                                            .find(|pe| pe.player_identity == player_identity)
                                        {
                                            player_events.events.push(GameStateEvent::LifeEarned);
                                        }
                                    }
                                }
                                WinCondition::UseAllLetters => {}
                            }
                            pick_random_trigram_and_update(state, ctx);
                            state.failed_players.clear();
                            if has_winner(state).is_none() {
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
                            return Ok(true);
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
                            let current_player =
                                &mut state.players[state.current_turn_index as usize];
                            current_player.current_word = String::new();
                            return Ok(false);
                        }
                    }
                }
            }
        }
    };
    match should_end_turn() {
        Ok(true) => end_turn(&mut game_state, ctx, game_id),
        Ok(false) => (),
        Err(e) => return Err(e),
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
        // Collect all PastGuess for the current round from all players
        let mut valid_words = Vec::new();
        let current_round = state.turn_number;
        for player in &state.players {
            for guess in player.past_guesses.iter().rev() {
                if guess.round_number == current_round
                    && !valid_words.iter().any(|g: &PastGuess| {
                        g.word == guess.word && g.round_number == guess.round_number
                    })
                {
                    valid_words.push(guess.clone());
                }
            }
        }
        let example = TrigramExample {
            trigram: trigram.to_string(),
            example_words: get_example_words(trigram, ctx),
            valid_words,
        };
        state.trigram_examples.insert(0, example);
    }
}

// Helper function to pick a random trigram and update used trigrams
fn pick_random_trigram_and_update(state: &mut PlayingState, ctx: &ReducerContext) {
    // Store current trigram in a temporary variable
    let current_trigram = state.current_trigram.clone();
    // Store example for current trigram before changing it
    store_trigram_example(state, &current_trigram, ctx);

    // Compute used trigrams from trigram_examples and current_trigram
    let used_trigrams = get_used_trigrams(state);
    let available_trigrams = trigram::get_available_trigrams(&used_trigrams);

    if available_trigrams.is_empty() {
        panic!("Critical error: Ran out of trigrams. This should never happen.");
    }

    // Pick a random trigram from available ones
    let random_index = ctx.rng().next_u32() as usize % available_trigrams.len();
    let new_trigram = available_trigrams[random_index].clone().to_uppercase();

    // No need to push to used_trigrams; just update current_trigram
    state.current_trigram = new_trigram;
}

// Helper function to get random long words containing a trigram
fn get_example_words(trigram: &str, ctx: &ReducerContext) -> Vec<String> {
    trigram::get_example_words(trigram, &mut ctx.rng())
}

// Helper to compute used trigrams from trigram_examples and current_trigram
fn get_used_trigrams(state: &PlayingState) -> Vec<String> {
    let mut trigrams: Vec<String> = state
        .trigram_examples
        .iter()
        .map(|ex| ex.trigram.clone())
        .collect();
    if !state.current_trigram.is_empty() && !trigrams.contains(&state.current_trigram) {
        trigrams.push(state.current_trigram.clone());
    }
    trigrams
}

// Helper to compute used words from all players' past_guesses
fn get_used_words(state: &PlayingState) -> Vec<String> {
    let mut words = Vec::new();
    for player in &state.players {
        for guess in &player.past_guesses {
            if !words.contains(&guess.word) {
                words.push(guess.word.clone());
            }
        }
    }
    words
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
            win_condition: WinCondition::LastPlayerStanding,
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
        lives: 3,                 // Start with 3 lives
        used_letters: Vec::new(), // Initialize empty used letters
        free_letters: Vec::new(), // Initialize empty free letters
        past_guesses: Vec::new(), // Initialize empty guess stack
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
    if let Some(mut game_state) = get_game_state(ctx, game_id) {
        match &mut game_state.state {
            GameState::Playing(playing_state) => {
                // Reset all players' lives and words
                let reset_players: Vec<PlayerGameData> = playing_state
                    .players
                    .iter()
                    .map(|p| create_initial_player_game_data(p.player_identity))
                    .collect();

                game_state.state = GameState::Settings(SettingsState {
                    turn_timeout_seconds: playing_state.settings.turn_timeout_seconds,
                    players: reset_players,
                    win_condition: playing_state.settings.win_condition.clone(),
                });
                game_state.updated_at = ctx.timestamp;
                update_game_state(ctx, game_state);
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

#[spacetimedb::reducer]
pub fn update_win_condition(
    ctx: &ReducerContext,
    game_id: u32,
    win_condition: WinCondition,
) -> Result<(), String> {
    if let Some(mut game_state) = get_game_state(ctx, game_id) {
        match &mut game_state.state {
            GameState::Settings(settings) => {
                settings.win_condition = win_condition;
                update_game_state(ctx, game_state);
                Ok(())
            }
            _ => Err("Can only update win condition in Settings state".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
}
