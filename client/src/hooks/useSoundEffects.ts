import { useCallback } from "react";
import { PlayerEvents } from "../generated/player_events_type";

/**
 * Hook for playing sound effects in the game
 */
export function useSoundEffects() {
  const playSound = useCallback((events: PlayerEvents) => {
    // Check for events that should trigger sounds
    for (const event of events.events) {
      switch (event.tag) {
        case "InvalidGuess":
          const audio = new Audio(
            "static/sounds/Errors and Cancel/Cancel 1.m4a"
          );
          audio.play().catch((error) => {
            console.error("Failed to play sound:", error);
          });
          break;
        // Add more cases here for other event types that need sounds
      }
    }
  }, []);

  return playSound;
}
