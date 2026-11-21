// Only the latest request of a screen may set its state (re-review M2).
//
// A screen that loads per selection (class, date) can have several answers in flight: the user opens class A, then
// switches to B, and A's answer arrives last. A's answer must not show A's students under B, or switch the screen to
// "access denied" while B is selected. Work that is about the device, not the screen (caching or forgetting A's roster
// through the guarded cache calls), still runs for a late answer.

/** Hands out request tickets; a ticket is current until the next one is issued. */
export interface LatestRequests {
  /** Starts a new request; every earlier ticket stops being current. */
  next(): () => boolean;
}

export function latestRequests(): LatestRequests {
  let seq = 0;
  return {
    next() {
      const mine = ++seq;
      return () => mine === seq;
    },
  };
}
