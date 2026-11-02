// Tidying what arrives from outside, shared by the star and reward tools.

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

// A refusal the agent should pass on, as opposed to something breaking.
export class StarError extends Error {}

export const cleanText = value => String(value ?? '').replace(CONTROL_CHARS, '').trim();
