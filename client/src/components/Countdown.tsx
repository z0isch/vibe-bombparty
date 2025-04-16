import { CountdownState } from "../generated/countdown_state_type";
import { PlayerInfoTable } from "../generated/player_info_table_type";
import { useEffect, useState } from "react";

interface CountdownProps {
  countdownState: CountdownState;
  playerInfos: PlayerInfoTable[];
}

export function Countdown({ countdownState, playerInfos }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(countdownState.countdownSeconds);

  useEffect(() => {
    // Reset timer when countdown seconds changes
    setTimeLeft(countdownState.countdownSeconds);

    // Start countdown
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [countdownState.countdownSeconds]);

  return (
    <div className="text-center space-y-8">
      <div className="text-8xl font-bold text-yellow-400 animate-pulse">
        {timeLeft}
      </div>
      <div className="space-y-4">
        <h2 className="text-2xl font-medium">Players</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {countdownState.settings.players.map((player) => {
            const playerInfo = playerInfos.find(
              (info) =>
                info.identity.toHexString() ===
                player.playerIdentity.toHexString()
            );
            if (!playerInfo) return null;

            return (
              <div
                key={player.playerIdentity.toHexString()}
                className="bg-gray-800 p-4 rounded flex items-center gap-2"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    playerInfo.isOnline ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span>{playerInfo.username}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
