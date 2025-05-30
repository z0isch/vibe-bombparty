import { Identity } from '@clockworklabs/spacetimedb-sdk';
import { type MotionProps } from 'motion/react';

import { useState } from 'react';

import { GameStateEvent } from '../generated';
import { usePlayerEvents } from './usePlayerEvents';

type EventsState = {
  [K in GameStateEvent['tag']]: Extract<GameStateEvent, { tag: K }> | null;
};

export function usePlayerEventMotionProps(
  calcProps: (events: EventsState) => MotionProps,
  playerIdentity?: Identity
) {
  const initialEvents: EventsState = {
    InvalidGuess: null,
    TimeUp: null,
    MyTurn: null,
    IWin: null,
    ILose: null,
    CorrectGuess: null,
    LifeEarned: null,
    FreeLetterAward: null,
  };

  const [events, setEvents] = useState<EventsState>(initialEvents);

  usePlayerEvents(playerIdentity, (e) => {
    setEvents((es) => ({ ...es, [e.tag]: e }));
  });

  return {
    ...calcProps(events),
    onAnimationComplete: () => {
      setEvents(initialEvents);
    },
  };
}
