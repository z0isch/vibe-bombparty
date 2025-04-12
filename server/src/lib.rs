use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table, Timestamp};

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
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
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

// Initialize the game when the module is first published
#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    let game = GameData {
        id: 1,
        players: Vec::new(),
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
