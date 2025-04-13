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
}

#[spacetimedb::table(name = game, public)]
#[derive(Clone)]
pub struct GameData {
    #[primary_key]
    pub id: u32, // Always 1 since we only have one game
    pub players: Vec<PlayerData>,
    pub current_turn_index: u32, // Index of the current player's turn
    pub turn_number: u32,        // Total number of turns that have occurred
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

#[spacetimedb::reducer]
fn turn_timeout(ctx: &ReducerContext, arg: TurnTimeoutSchedule) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        // Only advance the turn if the timeout matches the current turn number
        // This prevents stale timeouts from affecting newer turns
        if game.turn_number == arg.turn_number {
            // Advance to next turn (which will schedule the next timeout)
            advance_turn(ctx, &mut game);
            update_game(ctx, game);
            Ok(())
        } else {
            // Timeout was for an old turn, ignore it
            Ok(())
        }
    } else {
        Err("Game not initialized".to_string())
    }
}

// Helper function to get the game
fn get_game(ctx: &ReducerContext) -> Option<GameData> {
    ctx.db.game().id().find(&1)
}

// Helper function to update the game
fn update_game(ctx: &ReducerContext, mut game: GameData) {
    game.updated_at = ctx.timestamp;
    ctx.db.game().id().update(game);
}

// Helper function to advance to the next turn
fn advance_turn(ctx: &ReducerContext, game: &mut GameData) {
    if game.players.is_empty() {
        game.current_turn_index = 0;
    } else {
        game.current_turn_index = (game.current_turn_index + 1) % game.players.len() as u32;
        game.turn_number += 1;

        // Schedule the next turn timeout whenever we advance to a new turn
        let timeout = TurnTimeoutSchedule {
            scheduled_id: 0, // Auto-incremented
            scheduled_at: (ctx.timestamp + TimeDuration::from_micros(5_000_000)).into(),
            turn_number: game.turn_number,
        };
        ctx.db.turn_timeout_schedule().insert(timeout);
    }
}

// Initialize the game when the module is first published
#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    let game = GameData {
        id: 1,
        players: Vec::new(),
        current_turn_index: 0,
        turn_number: 0,
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    };
    ctx.db.game().insert(game);
}

#[spacetimedb::reducer]
pub fn register_player(ctx: &ReducerContext, username: String) -> Result<(), String> {
    let player = PlayerData {
        identity: ctx.sender,
        username,
        score: 0,
        last_active: ctx.timestamp,
        is_online: true,
    };

    if let Some(mut game) = get_game(ctx) {
        // Check if player already exists
        if game.players.iter().any(|p| p.identity == ctx.sender) {
            return Err("Player already registered".to_string());
        }

        game.players.push(player);

        // If this is the first player, start the first turn
        if game.players.len() == 1 {
            advance_turn(ctx, &mut game);
        }

        update_game(ctx, game);
        Ok(())
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer]
pub fn end_turn(ctx: &ReducerContext) -> Result<(), String> {
    if let Some(mut game) = get_game(ctx) {
        // Verify it's the sender's turn
        if game.players.is_empty() {
            return Err("No players in game".to_string());
        }

        let current_player = &game.players[game.current_turn_index as usize];
        if current_player.identity != ctx.sender {
            return Err("Not your turn".to_string());
        }

        // Advance to next turn (which will schedule the next timeout)
        advance_turn(ctx, &mut game);
        update_game(ctx, game);
        Ok(())
    } else {
        Err("Game not initialized".to_string())
    }
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) {
    if let Some(mut game) = get_game(ctx) {
        if let Some(player) = game.players.iter_mut().find(|p| p.identity == ctx.sender) {
            player.is_online = true;
            player.last_active = ctx.timestamp;
            update_game(ctx, game);
        }
    }
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    if let Some(mut game) = get_game(ctx) {
        if let Some(player) = game.players.iter_mut().find(|p| p.identity == ctx.sender) {
            player.is_online = false;
            update_game(ctx, game);
        }
    }
}
