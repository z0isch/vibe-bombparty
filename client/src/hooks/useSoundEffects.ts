import { useCallback } from "react";
import { PlayerEvents } from "../generated/player_events_type";
import { GameStateEvent } from "../generated/game_state_event_type";
import { Identity } from "@clockworklabs/spacetimedb-sdk";

/**
 * Helper function to ensure exhaustive type checking
 */
function assertNever(x: never): never {
  throw new Error("Unexpected event type: " + x);
}

/**
 * Helper function to check if an event is for the current player
 */
function isThisEventForMe(
  events: PlayerEvents,
  currentPlayerIdentity: Identity | undefined
): boolean {
  console.log(
    events.playerIdentity.toHexString(),
    currentPlayerIdentity?.toHexString()
  );
  return (
    events.playerIdentity.toHexString() === currentPlayerIdentity?.toHexString()
  );
}

/**
 * Helper function to play a game sound and handle errors
 */
function playGameSound(soundPath: string) {
  const audio = new Audio(soundPath);
  audio.play().catch((error) => {
    console.error(`Failed to play`, error);
  });
}

/**
 * Hook for playing sound effects in the game
 */
export function useSoundEffects() {
  const playSound = useCallback(
    (events: PlayerEvents, currentPlayerIdentity: Identity | undefined) => {
      // Check for events that should trigger sounds
      for (const event of events.events) {
        const eventType = event as GameStateEvent;
        switch (eventType.tag) {
          case "InvalidGuess":
            playGameSound("sounds/Errors and Cancel/Cancel 1.m4a");
            break;
          case "TimeUp":
            // Only play timeout sound for the player whose turn timed out
            if (isThisEventForMe(events, currentPlayerIdentity)) {
              playGameSound("sounds/Errors and Cancel/Error 5.m4a");
            }
            break;
          case "MyTurn":
            // Only play turn notification for the current player
            if (isThisEventForMe(events, currentPlayerIdentity)) {
              playGameSound(
                "sounds/Notifications and Alerts/Notification 3.m4a"
              );
            }
            break;
          case "IWin":
            // Only play win sound for the winner
            if (isThisEventForMe(events, currentPlayerIdentity)) {
              playGameSound(
                "sounds/Notifications and Alerts/Notification 9.m4a"
              );
            }
            break;
          case "ILose":
            if (isThisEventForMe(events, currentPlayerIdentity)) {
              playGameSound("sounds/Errors and Cancel/Error 4.m4a");
            }
            break;
          case "CorrectGuess":
            // Only play correct guess sound for the player who made the guess
            if (isThisEventForMe(events, currentPlayerIdentity)) {
              playGameSound("sounds/Complete and Success/Success 2.m4a");
            }
            break;
          default:
            assertNever(eventType);
        }
      }
    },
    []
  );

  return playSound;
}
