import { detectGenericJumpEvents } from "./genericJump.js";

export function detectDropJumpEvents(context) {
  const result = detectGenericJumpEvents(context);

  return {
    ...result,
    detector: "drop_jump_placeholder",
    flags: [
      ...result.flags,
      "drop_jump_specific_detector_not_yet_implemented"
    ]
  };
}