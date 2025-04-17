import { Identity } from '@clockworklabs/spacetimedb-sdk';

import { GameStateEvent } from './generated/game_state_event_type';
import { PlayerEvents } from './generated/player_events_type';

type EventHandler = (event: GameStateEvent, playerIdentity: Identity) => void;

interface Subscription {
  id: number;
  handler: EventHandler;
  playerIdentityFilter?: Identity;
}

class EventQueue {
  private static instance: EventQueue;
  private subscriptions: Map<number, Subscription>;
  private nextSubscriptionId: number;

  private constructor() {
    this.subscriptions = new Map();
    this.nextSubscriptionId = 1;
  }

  public static getInstance(): EventQueue {
    if (!EventQueue.instance) {
      EventQueue.instance = new EventQueue();
    }
    return EventQueue.instance;
  }

  public subscribe(handler: EventHandler, playerIdentityFilter?: Identity): number {
    const id = this.nextSubscriptionId++;
    this.subscriptions.set(id, { id, handler, playerIdentityFilter });
    return id;
  }

  public unsubscribe(subscriptionId: number): void {
    this.subscriptions.delete(subscriptionId);
  }

  public publishEvents(playerEvents: PlayerEvents[]): void {
    playerEvents.forEach((playerEvent) => {
      playerEvent.events.forEach((event) => {
        this.subscriptions.forEach((subscription) => {
          // If there's a filter and it doesn't match, skip
          if (
            subscription.playerIdentityFilter &&
            subscription.playerIdentityFilter.toHexString() !==
              playerEvent.playerIdentity.toHexString()
          ) {
            return;
          }

          // Call the handler with the event and player identity
          subscription.handler(event, playerEvent.playerIdentity);
        });
      });
    });
  }
}

export const eventQueue = EventQueue.getInstance();
