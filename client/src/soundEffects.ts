import { Identity } from '@clockworklabs/spacetimedb-sdk';
import spoken from 'spoken';

import { eventQueue } from './eventQueue';
import { GameStateEvent } from './generated/game_state_event_type';

/**
 * Helper function to ensure exhaustive type checking
 */
function assertNever(x: never): never {
  throw new Error('Unexpected event type: ' + x);
}

/**
 * Helper function to check if an event is for the current player
 */
function isThisEventForMe(
  playerIdentity: Identity,
  currentPlayerIdentity: Identity | undefined
): boolean {
  return playerIdentity.toHexString() === currentPlayerIdentity?.toHexString();
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
 * Function to set up sound effect handling for the game
 * @returns A cleanup function to unsubscribe from events
 */
export function setupSoundEffects(currentPlayerIdentity: Identity | undefined): () => void {
  // Subscribe to the event queue
  const subscriptionId = eventQueue.subscribe(
    async (event: GameStateEvent, playerIdentity: Identity) => {
      switch (event.tag) {
        case 'InvalidGuess':
          playGameSound('sounds/Errors and Cancel/Cancel 1.m4a');
          break;
        case 'TimeUp':
          // Only play timeout sound for the player whose turn timed out
          if (isThisEventForMe(playerIdentity, currentPlayerIdentity)) {
            playGameSound('sounds/Errors and Cancel/Error 5.m4a');
          }
          break;
        case 'MyTurn':
          // Only play turn notification for the current player
          if (isThisEventForMe(playerIdentity, currentPlayerIdentity)) {
            playGameSound('sounds/Notifications and Alerts/Notification 3.m4a');
          }
          break;
        case 'IWin':
          // Only play win sound for the winner
          if (isThisEventForMe(playerIdentity, currentPlayerIdentity)) {
            playGameSound('sounds/Notifications and Alerts/Notification 9.m4a');
          }
          break;
        case 'ILose':
          if (isThisEventForMe(playerIdentity, currentPlayerIdentity)) {
            playGameSound('sounds/Errors and Cancel/Error 4.m4a');
          }
          break;
        case 'CorrectGuess':
          const speech = new SpeechSynthesisUtterance(event.value);
          speechSynthesis.speak(speech);
          // Only play correct guess sound for the player who made the guess
          if (isThisEventForMe(playerIdentity, currentPlayerIdentity)) {
            playGameSound('sounds/Complete and Success/Success 2.m4a');
          }
          break;
        case 'LifeEarned':
          playGameSound('sounds/Complete and Success/Success 1.m4a');
          break;
        case 'FreeLetterAward':
          playGameSound('sounds/Complete and Success/Success 3.m4a');
          break;
        default:
          assertNever(event);
      }
    }
  );

  // Return cleanup function
  return () => {
    eventQueue.unsubscribe(subscriptionId);
  };
}
