/**
 * Who the player's car hit: systems (traffic, police) register a hook and get the other rigid
 * body's handle plus the impulse (N·s) of the hit.
 */
export type ContactHook = (otherBody: number, impulse: number) => void;

export const carContactHooks = new Set<ContactHook>();
