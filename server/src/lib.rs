use spacetimedb::{Identity, ReducerContext, Table, Timestamp};

mod common;
mod player_logic;

#[spacetimedb::table(name = player, public)]
#[derive(Clone)]
pub struct PlayerData {
    #[primary_key]
    pub identity: Identity,
    pub username: String,
    pub score: i32,
    pub last_active: Timestamp,
    pub is_online: bool,
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

    ctx.db.player().insert(player);
    Ok(())
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) {
    // Update player connection status
    if let Some(mut player) = ctx.db.player().identity().find(&ctx.sender) {
        player.is_online = true;
        player.last_active = ctx.timestamp;
        ctx.db.player().identity().update(player);
    }
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    // Update player disconnection status
    if let Some(mut player) = ctx.db.player().identity().find(&ctx.sender) {
        player.is_online = false;
        ctx.db.player().identity().update(player);
    }
}
