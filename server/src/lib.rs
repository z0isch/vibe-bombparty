use spacetimedb::{
    rand::{self, RngCore},
    Identity, ReducerContext, ScheduleAt, SpacetimeType, Table, TimeDuration, Timestamp,
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
    pub events: Vec<GameStateEvent>, // Events for this player (moved from PlayingState)
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
pub struct ClassicTurnLogic {
    pub current_turn_index: u32,
    pub failed_players: Vec<Identity>,
}

#[derive(Clone, SpacetimeType)]
pub struct SimultaneousTurnLogic {
    // For now, no extra fields needed, but could add per-turn stats if needed
}

#[derive(Clone, Copy, SpacetimeType, PartialEq, Eq)]
pub enum TurnLogicMode {
    Classic,
    Simultaneous,
}

#[derive(Clone, SpacetimeType)]
pub enum TurnLogic {
    Classic(ClassicTurnLogic),
    Simultaneous(SimultaneousTurnLogic),
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
pub enum GameResult {
    Winner(Identity),
    Draw,
    None,
}

#[derive(Clone, SpacetimeType)]
pub enum GameState {
    Settings(SettingsState),
    Countdown(CountdownState),
    Playing(PlayingState),
}

#[derive(Clone, SpacetimeType)]
pub struct PlayingState {
    pub players: Vec<PlayerGameData>,
    pub turn_logic: TurnLogic, // replaces current_turn_index and failed_players
    pub turn_number: u32,      // Total number of turns that have occurred
    pub settings: SettingsState, // Settings preserved from settings state
    pub current_trigram: String, // Current trigram that must be contained in valid words
    pub trigram_examples: Vec<TrigramExample>, // Last 3 trigrams and their example words
    pub winner: GameResult,    // Winner, Draw, or None
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
    pub turn_logic_mode: TurnLogicMode,
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
    // Protect against stale timeouts
    match get_game_state(ctx, arg.game_id) {
        Some(game_state) => match game_state.state {
            GameState::Settings(_) => {}
            GameState::Countdown(_) => {}
            GameState::Playing(playing_state) => {
                if playing_state.turn_number != arg.turn_number {
                    // This isn't really an error it just means that the timeout is for a stale turn
                    return Ok(());
                }
            }
        },
        None => {}
    }

    update_game_state_and_schedule_turn_timeout(ctx, arg.game_id, Move::TimeUp)
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

                // Select turn logic based on settings
                let turn_logic = match settings_clone.turn_logic_mode {
                    TurnLogicMode::Classic => TurnLogic::Classic(ClassicTurnLogic {
                        current_turn_index: 0,
                        failed_players: Vec::new(),
                    }),
                    TurnLogicMode::Simultaneous => {
                        TurnLogic::Simultaneous(SimultaneousTurnLogic {})
                    }
                };

                let mut playing_state = PlayingState {
                    players: shuffled_players,
                    turn_logic,
                    turn_number: 0,
                    settings: SettingsState {
                        turn_timeout_seconds: settings_clone.turn_timeout_seconds,
                        players: Vec::new(),
                        win_condition: settings_clone.win_condition,
                        turn_logic_mode: settings_clone.turn_logic_mode,
                    },
                    current_trigram: String::new(),
                    trigram_examples: Vec::new(),
                    winner: GameResult::None,
                };

                // Pick initial random trigram
                pick_random_trigram_and_update(&mut playing_state, &mut ctx.rng());

                // Classic: Emit MyTurn event to the first player in shuffled order
                match &playing_state.turn_logic {
                    TurnLogic::Classic(_) => {
                        playing_state
                            .players
                            .get_mut(0)
                            .map(|player| player.events.push(GameStateEvent::MyTurn));
                    }
                    TurnLogic::Simultaneous(_) => {
                        playing_state.players.iter_mut().for_each(|player| {
                            player.events.push(GameStateEvent::MyTurn);
                        });
                    }
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
    pub player_identity: Identity,
    pub word: String,
}

#[derive(Clone, SpacetimeType)]
pub enum Move {
    TimeUp,
    GuessWord(GuessWordMove),
}

fn has_winner(state: &PlayingState) -> GameResult {
    match state.settings.win_condition {
        WinCondition::LastPlayerStanding => {
            let players_with_lives: Vec<_> = state.players.iter().filter(|p| p.lives > 0).collect();
            match players_with_lives.len() {
                0 => GameResult::Draw,
                1 => GameResult::Winner(players_with_lives[0].player_identity),
                _ => GameResult::None,
            }
        }
        WinCondition::UseAllLetters => {
            if let Some(p) = state.players.iter().find(|p| {
                ('A'..='Z').all(|c| {
                    let letter = c.to_string();
                    p.used_letters.contains(&letter) || p.free_letters.contains(&letter)
                })
            }) {
                GameResult::Winner(p.player_identity)
            } else {
                GameResult::None
            }
        }
    }
}

pub enum ShouldScheduleTurnTimeout {
    ScheduleTurnTimeout,
    DoNotScheduleTurnTimeout,
}

// Helper function to handle end of turn logic
fn end_turn(
    game_state: &mut GameStateTable,
    rng: &mut impl rand::RngCore,
) -> ShouldScheduleTurnTimeout {
    match &mut game_state.state {
        GameState::Settings(_) => {
            return ShouldScheduleTurnTimeout::DoNotScheduleTurnTimeout;
        }
        GameState::Countdown(_) => {
            return ShouldScheduleTurnTimeout::DoNotScheduleTurnTimeout;
        }
        GameState::Playing(state) => {
            let result = has_winner(state);
            match result {
                GameResult::None => {
                    match &mut state.turn_logic {
                        TurnLogic::Classic(classic) => {
                            let (next_player, next_player_index) = state
                                .players
                                .iter()
                                .zip(0..)
                                .cycle()
                                .skip(classic.current_turn_index as usize + 1)
                                .find(|(p, _)| p.lives > 0)
                                .unwrap();
                            let next_player_identity = next_player.player_identity;
                            state
                                .players
                                .iter_mut()
                                .find(|player| player.player_identity == next_player_identity)
                                .map(|player| player.events.push(GameStateEvent::MyTurn));
                            classic.current_turn_index = next_player_index;
                            state.turn_number += 1;
                        }
                        TurnLogic::Simultaneous(_) => {
                            // In Simultaneous mode, just increment turn_number and pick new trigram
                            state.turn_number += 1;
                        }
                    }
                    return ShouldScheduleTurnTimeout::ScheduleTurnTimeout;
                }
                GameResult::Winner(winner) => {
                    // Store example for the final trigram before game ends
                    let final_trigram = state.current_trigram.clone();
                    store_trigram_example(state, &final_trigram, rng);
                    state.winner = GameResult::Winner(winner);
                    match game_state
                        .player_wins
                        .iter_mut()
                        .find(|w| w.player_identity == winner)
                    {
                        Some(wins) => {
                            wins.wins += 1;
                        }
                        None => {
                            game_state.player_wins.push(PlayerWins {
                                player_identity: winner,
                                wins: 1,
                            });
                        }
                    }
                    state.players.iter_mut().for_each(|player| {
                        player.events.push(if player.player_identity == winner {
                            GameStateEvent::IWin
                        } else {
                            GameStateEvent::ILose
                        })
                    });
                    return ShouldScheduleTurnTimeout::DoNotScheduleTurnTimeout;
                }
                GameResult::Draw => {
                    state.winner = GameResult::Draw;
                    state.players.iter_mut().for_each(|player| {
                        player.events.push(GameStateEvent::ILose);
                    });
                    return ShouldScheduleTurnTimeout::DoNotScheduleTurnTimeout;
                }
            }
        }
    }
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
    game_state: &mut GameStateTable,
    game_move: Move,
    rng: &mut impl rand::RngCore,
) -> Result<ShouldScheduleTurnTimeout, String> {
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
            if let GameResult::None = has_winner(state) {
                // game not over
            } else {
                return Err("Game is over".to_string());
            }
            let used_words = get_used_words(state);
            state.players.iter_mut().for_each(|player| {
                player.events.clear();
            });
            match game_move {
                Move::TimeUp => match &mut state.turn_logic {
                    TurnLogic::Classic(classic) => {
                        let current_player_identity =
                            state.players[classic.current_turn_index as usize].player_identity;
                        match state
                            .players
                            .iter_mut()
                            .find(|p| p.player_identity == current_player_identity)
                        {
                            None => {
                                return Err("Player not found".to_string());
                            }
                            Some(player) => {
                                player.current_word = String::new();
                                player.events.push(GameStateEvent::TimeUp);
                                let pick_new_trigram = match state.settings.win_condition {
                                    WinCondition::LastPlayerStanding => {
                                        if !classic
                                            .failed_players
                                            .contains(&current_player_identity)
                                        {
                                            classic.failed_players.push(current_player_identity);
                                        }
                                        player.lives = (player.lives - 1).max(0);
                                        player.past_guesses.clear();
                                        let active_players: Vec<_> = state
                                            .players
                                            .iter()
                                            .filter(|p| p.lives > 0)
                                            .map(|p| p.player_identity)
                                            .collect();
                                        let all_active_failed = active_players
                                            .iter()
                                            .all(|id| classic.failed_players.contains(id));
                                        if all_active_failed {
                                            classic.failed_players.clear();
                                        }
                                        all_active_failed
                                    }
                                    WinCondition::UseAllLetters => {
                                        if !classic
                                            .failed_players
                                            .contains(&current_player_identity)
                                        {
                                            classic.failed_players.push(current_player_identity)
                                        }
                                        let all_failed = state.players.iter().all(|p| {
                                            classic.failed_players.contains(&p.player_identity)
                                        });
                                        if all_failed {
                                            classic.failed_players.clear();
                                        }
                                        all_failed
                                    }
                                };
                                if pick_new_trigram {
                                    pick_random_trigram_and_update(state, rng);
                                }
                                return Ok(end_turn(game_state, rng));
                            }
                        }
                    }
                    TurnLogic::Simultaneous(_) => {
                        for player in &mut state.players {
                            player.current_word = String::new();
                            // Penalize players who did not submit a word this round
                            let submitted = player
                                .past_guesses
                                .iter()
                                .any(|g| g.round_number == state.turn_number);
                            if !submitted {
                                player.lives = (player.lives - 1).max(0);
                                player.events.push(GameStateEvent::TimeUp);
                            }
                        }
                        pick_random_trigram_and_update(state, rng);
                        return Ok(end_turn(game_state, rng));
                    }
                },
                Move::GuessWord(guess) => {
                    match state
                        .players
                        .iter_mut()
                        .find(|p| p.player_identity == guess.player_identity)
                    {
                        None => {
                            return Err("Player not found".to_string());
                        }
                        Some(player) => {
                            let word = guess.word.trim().to_uppercase();
                            match is_word_valid(&word, &state.current_trigram, &used_words) {
                                Ok(()) => {
                                    player.events.push(GameStateEvent::CorrectGuess);
                                    player.past_guesses.push(PastGuess {
                                        word: word.clone(),
                                        round_number: state.turn_number,
                                    });
                                    for c in word.chars() {
                                        let letter = c.to_string().to_uppercase();
                                        if !player.used_letters.contains(&letter) {
                                            player.used_letters.push(letter);
                                        }
                                    }
                                    if word.len() > 10 {
                                        let unused_letters: Vec<String> = ('A'..='Z')
                                            .map(|c| c.to_string())
                                            .filter(|letter| {
                                                !player.used_letters.contains(letter)
                                                    && !player.free_letters.contains(letter)
                                            })
                                            .collect();
                                        if !unused_letters.is_empty() {
                                            let random_index =
                                                rng.next_u32() as usize % unused_letters.len();
                                            let letter = unused_letters[random_index].clone();
                                            player.free_letters.push(letter.clone());
                                            player.events.push(GameStateEvent::FreeLetterAward(
                                                FreeLetterAwardEvent { letter },
                                            ));
                                        }
                                    }
                                    match state.settings.win_condition {
                                        WinCondition::LastPlayerStanding => {
                                            let has_all_letters = ('A'..='Z').all(|c| {
                                                let letter = c.to_string();
                                                player.used_letters.contains(&letter)
                                                    || player.free_letters.contains(&letter)
                                            });
                                            if has_all_letters {
                                                player.lives += 1;
                                                player.used_letters.clear();
                                                player.free_letters.clear();
                                                player.events.push(GameStateEvent::LifeEarned);
                                            }
                                        }
                                        WinCondition::UseAllLetters => {}
                                    }
                                    player.current_word = String::new();
                                    // For Simultaneous, do not pick new trigram or clear failed_players here
                                    // Check for winner after each submission
                                    if let GameResult::Winner(winner) = has_winner(state) {
                                        // End the game immediately if someone wins
                                        let final_trigram = state.current_trigram.clone();
                                        store_trigram_example(state, &final_trigram, rng);
                                        state.winner = GameResult::Winner(winner);
                                        match game_state
                                            .player_wins
                                            .iter_mut()
                                            .find(|w| w.player_identity == winner)
                                        {
                                            Some(wins) => {
                                                wins.wins += 1;
                                            }
                                            None => {
                                                game_state.player_wins.push(PlayerWins {
                                                    player_identity: winner,
                                                    wins: 1,
                                                });
                                            }
                                        }
                                        state.players.iter_mut().for_each(|player| {
                                            player.events.push(
                                                if player.player_identity == winner {
                                                    GameStateEvent::IWin
                                                } else {
                                                    GameStateEvent::ILose
                                                },
                                            )
                                        });
                                        return Ok(
                                            ShouldScheduleTurnTimeout::DoNotScheduleTurnTimeout,
                                        );
                                    }
                                    // For Classic, continue as before
                                    match &mut state.turn_logic {
                                        TurnLogic::Classic(classic) => {
                                            classic.failed_players.clear()
                                        }
                                        TurnLogic::Simultaneous(_) => {
                                            // No-op
                                        }
                                    };
                                    // For Classic, end turn after correct guess; for Simultaneous, do not end turn
                                    match &state.turn_logic {
                                        TurnLogic::Classic(_) => {
                                            return Ok(end_turn(game_state, rng))
                                        }
                                        TurnLogic::Simultaneous(_) => {
                                            return Ok(
                                                ShouldScheduleTurnTimeout::DoNotScheduleTurnTimeout,
                                            )
                                        }
                                    }
                                }
                                Err(reason) => {
                                    player.events.push(GameStateEvent::InvalidGuess(
                                        InvalidGuessEvent { word, reason },
                                    ));
                                    player.current_word = String::new();
                                    return Ok(ShouldScheduleTurnTimeout::DoNotScheduleTurnTimeout);
                                }
                            }
                        }
                    }
                }
            }
        }
    };
}

// Helper function to get the game state
fn get_game_state(ctx: &ReducerContext, game_id: u32) -> Option<GameStateTable> {
    ctx.db.game_state().game_id().find(&game_id)
}

// Helper function to store a trigram example
fn store_trigram_example(state: &mut PlayingState, trigram: &str, rng: &mut impl rand::RngCore) {
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
            example_words: trigram::get_example_words(trigram, rng),
            valid_words,
        };
        state.trigram_examples.insert(0, example);
    }
}

// Helper function to pick a random trigram and update used trigrams
fn pick_random_trigram_and_update(state: &mut PlayingState, rng: &mut impl rand::RngCore) {
    // Store current trigram in a temporary variable
    let current_trigram = state.current_trigram.clone();
    // Store example for current trigram before changing it
    store_trigram_example(state, &current_trigram, rng);

    // Compute used trigrams from trigram_examples and current_trigram
    let used_trigrams = get_used_trigrams(state);
    let available_trigrams = trigram::get_available_trigrams(&used_trigrams);

    if available_trigrams.is_empty() {
        panic!("Critical error: Ran out of trigrams. This should never happen.");
    }

    // Pick a random trigram from available ones
    let random_index = rng.next_u32() as usize % available_trigrams.len();
    let new_trigram = available_trigrams[random_index].clone().to_uppercase();

    // No need to push to used_trigrams; just update current_trigram
    state.current_trigram = new_trigram;
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
            turn_logic_mode: TurnLogicMode::Classic,
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
        events: Vec::new(),       // Initialize empty events
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
                    // Clear all player events
                    for player in &mut playing_state.players {
                        player.events.clear();
                    }

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

fn update_game_state_and_schedule_turn_timeout(
    ctx: &ReducerContext,
    game_id: u32,
    game_move: Move,
) -> Result<(), String> {
    match get_game_state(ctx, game_id) {
        Some(mut game_state) => make_move(&mut game_state, game_move, &mut ctx.rng()).map(
            |should_schedule_turn_timeout| {
                match &mut game_state.state {
                    GameState::Settings(_) => {}
                    GameState::Countdown(_) => {}
                    GameState::Playing(playing_state) => match should_schedule_turn_timeout {
                        ShouldScheduleTurnTimeout::ScheduleTurnTimeout => {
                            schedule_turn_timeout(ctx, playing_state, game_id);
                        }
                        ShouldScheduleTurnTimeout::DoNotScheduleTurnTimeout => {}
                    },
                }
                update_game_state(ctx, game_state);
            },
        ),

        None => Err("Game not initialized".to_string()),
    }
}

#[spacetimedb::reducer]
pub fn submit_word(ctx: &ReducerContext, game_id: u32, word: String) -> Result<(), String> {
    update_game_state_and_schedule_turn_timeout(
        ctx,
        game_id,
        Move::GuessWord(GuessWordMove {
            word,
            player_identity: ctx.sender,
        }),
    )
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
                    turn_logic_mode: playing_state.settings.turn_logic_mode,
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

#[spacetimedb::reducer]
pub fn update_turn_logic_mode(
    ctx: &ReducerContext,
    game_id: u32,
    turn_logic_mode: TurnLogicMode,
) -> Result<(), String> {
    if let Some(mut game_state) = get_game_state(ctx, game_id) {
        match &mut game_state.state {
            GameState::Settings(settings) => {
                settings.turn_logic_mode = turn_logic_mode;
                update_game_state(ctx, game_state);
                Ok(())
            }
            _ => Err("Can only update turn logic mode in Settings state".to_string()),
        }
    } else {
        Err("Game not initialized".to_string())
    }
}
