use spacetimedb::{spacetimedb, Identity, ReducerContext, Timestamp};

mod common;
mod player_logic;

#[spacetimedb::table(name = "player", public)]
#[derive(Clone)]
pub struct PlayerData {
    #[primarykey]
    pub identity: Identity,
    pub username: String,
    pub score: i32,
    pub last_active: Timestamp,
}

#[spacetimedb::table(name = "logged_out_player", public)]
#[derive(Clone)]
pub struct LoggedOutPlayerData {
    #[primarykey]
    pub identity: Identity,
    pub disconnect_time: Timestamp,
}

#[spacetimedb::reducer]
pub fn register_player(ctx: &ReducerContext, username: String) -> Result<(), String> {
    let player = PlayerData {
        identity: ctx.sender,
        username,
        score: 0,
        last_active: ctx.timestamp,
    };

    ctx.db.player().insert(player);
    Ok(())
}

#[spacetimedb::reducer]
pub fn identity_connected(ctx: &ReducerContext) {
    // Handle player reconnection
    if let Some(logged_out_player) = ctx.db.logged_out_player().identity().find(&ctx.sender) {
        ctx.db.logged_out_player().identity().delete(&ctx.sender);
    }
}

#[spacetimedb::reducer]
pub fn identity_disconnected(ctx: &ReducerContext) {
    // Save disconnected player state
    if let Some(player) = ctx.db.player().identity().find(&ctx.sender) {
        let logged_out = LoggedOutPlayerData {
            identity: ctx.sender,
            disconnect_time: ctx.timestamp,
        };
        ctx.db.logged_out_player().insert(logged_out);
    }
}
