import { detectGenericJumpEvents } from "./genericJump.js";
import { detectSeatedBoxJumpEvents } from "./seatedBoxJump.js";
import { detectPogoJumpEvents } from "./pogoJump.js";
import { detectDropJumpEvents } from "./dropJump.js";

const DETECTORS = {
  generic_jump: detectGenericJumpEvents,
  seated_box_jump: detectSeatedBoxJumpEvents,
  pogo_jump: detectPogoJumpEvents,
  drop_jump: detectDropJumpEvents
};

export function getMovementDetector(movementType) {
  return DETECTORS[movementType] || DETECTORS.generic_jump;
}

export function listMovementDetectors() {
  return Object.keys(DETECTORS);
}