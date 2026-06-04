export async function buildAthleteReference(analysis) {
  const athleteInput = analysis?.input?.athlete || {};

  const heightCm = toNumber(athleteInput.heightCm);
  const weightKg = toNumber(athleteInput.weightKg);
  const sexGender = athleteInput.sexGender || "not_specified";

  const flags = [];

  if (!heightCm) flags.push("missing_height");
  if (!weightKg) flags.push("missing_weight");

  if (heightCm && (heightCm < 100 || heightCm > 230)) {
    flags.push("height_outside_expected_range");
  }

  if (weightKg && (weightKg < 30 || weightKg > 220)) {
    flags.push("weight_outside_expected_range");
  }

  const reference = {
    heightCm,
    heightM: heightCm ? heightCm / 100 : null,
    weightKg,
    massKg: weightKg,
    sexGender,
    flags
  };

  const anthropometrics = estimateAnthropometrics(reference);
  const scaling = buildScalingModel(reference, anthropometrics);

  analysis.athlete.reference = reference;
  analysis.athlete.anthropometrics = anthropometrics;
  analysis.athlete.scaling = scaling;

  analysis.logs.push({
    time: new Date().toISOString(),
    level: flags.length ? "warn" : "info",
    module: "athlete",
    message: flags.length
      ? `Athlete reference created with flags: ${flags.join(", ")}`
      : "Athlete reference created."
  });

  return analysis;
}

function estimateAnthropometrics(reference) {
  const heightM = reference.heightM;

  if (!heightM) {
    return {
      status: "insufficient_reference",
      flags: ["missing_height"]
    };
  }

  /*
    These are deliberately simple first-pass body-segment estimates.

    They are not treated as diagnostic truth.
    They support:
    - scale plausibility
    - centre-of-mass approximation
    - force / impulse estimation
    - error modelling

    Later we can replace these with:
    - camera-calibrated scaling
    - user-measured limb lengths
    - MediaPipe-derived proportions
    - sex-specific segment models
  */

  return {
    status: "estimated",

    statureM: heightM,

    approximateSegmentsM: {
      headNeck: heightM * 0.13,
      torso: heightM * 0.30,
      thigh: heightM * 0.245,
      shank: heightM * 0.246,
      foot: heightM * 0.152,
      upperArm: heightM * 0.186,
      forearm: heightM * 0.146
    },

    approximateMassFractions: {
      headNeck: 0.081,
      trunk: 0.497,
      upperArmEach: 0.028,
      forearmEach: 0.016,
      handEach: 0.006,
      thighEach: 0.100,
      shankEach: 0.0465,
      footEach: 0.0145
    },

    flags: ["anthropometrics_estimated_not_measured"]
  };
}

function buildScalingModel(reference, anthropometrics) {
  if (!reference.heightM || anthropometrics.status !== "estimated") {
    return {
      status: "not_available",
      method: null,
      flags: ["insufficient_athlete_reference"]
    };
  }

  return {
    status: "ready",
    method: "height_reference_first_pass",

    knownReference: {
      type: "stature",
      valueM: reference.heightM
    },

    /*
      Pixel-to-metre scaling cannot be final until we have pose landmarks
      and/or a known full-body visible frame.

      This object prepares the contract for the later scaling stage.
    */
    pixelToMetre: null,

    assumptions: [
      "athlete height used as first-pass real-world reference",
      "full-body visibility improves scale estimation",
      "camera perspective may distort vertical and horizontal scaling",
      "future versions should estimate perspective correction"
    ],

    flags: ["scale_pending_pose_landmarks"]
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}