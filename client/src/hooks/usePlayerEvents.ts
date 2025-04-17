import { Identity } from '@clockworklabs/spacetimedb-sdk';

import { useEffect } from 'react';

import { eventQueue } from '../eventQueue';
import { GameStateEvent } from '../generated/game_state_event_type';

type EventHandler = (event: GameStateEvent, playerIdentity: Identity) => void;

export function usePlayerEvents(playerIdentityFilter?: Identity, onEvent?: EventHandler) {
  useEffect(() => {
    if (!onEvent) return;

    // Subscribe to the event queue
    const subscriptionId = eventQueue.subscribe(onEvent, playerIdentityFilter);

    // Cleanup subscription on unmount
    return () => {
      eventQueue.unsubscribe(subscriptionId);
    };
  }, [playerIdentityFilter, onEvent]);
}
