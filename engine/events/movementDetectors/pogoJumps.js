import { detectGenericJumpEvents } from "./genericJump.js";

export function detectPogoJumpEvents(context) {
  const result = detectGenericJumpEvents(context);

  return {
    ...result,
    detector: "pogo_jump_placeholder",
    flags: [
      ...result.flags,
      "pogo_specific_detector_not_yet_implemented"
    ]
  };
}