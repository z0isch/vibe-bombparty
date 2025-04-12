use crate::{LoggedOutPlayerData, PlayerData};
use spacetimedb::ReducerContext;

pub fn update_player_score(ctx: &ReducerContext, player: &mut PlayerData, points: i32) {
    player.score += points;
    player.last_active = ctx.timestamp;
    ctx.db.player().identity().update(player);
}

pub fn cleanup_inactive_players(ctx: &ReducerContext) {
    let current_time = ctx.timestamp;
    let timeout = spacetimedb::Timestamp::from_micros(300_000_000); // 5 minutes

    let inactive_players: Vec<_> = ctx
        .db
        .logged_out_player()
        .iter()
        .filter(|p| current_time.micros() - p.disconnect_time.micros() > timeout.micros())
        .collect();

    for player in inactive_players {
        ctx.db
            .logged_out_player()
            .identity()
            .delete(&player.identity);
    }
}
