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

  if (weightKg && (weightKg < 30 || weightKg > 250)) {
    flags.push("weight_outside_expected_range");
  }

  const bmi =
    heightCm && weightKg
      ? weightKg / Math.pow(heightCm / 100, 2)
      : null;

  const reference = {
    heightCm,
    heightM: heightCm ? heightCm / 100 : null,
    weightKg,
    massKg: weightKg,
    bmi,
    sexGender,
    flags
  };

  const anthropometrics = estimateAnthropometrics(reference);
  const scaling = buildScalingModel(reference);

  analysis.athlete.reference = reference;
  analysis.athlete.anthropometrics = anthropometrics;
  analysis.athlete.scaling = scaling;

  analysis.logs.push({
    time: new Date().toISOString(),
    level: flags.length ? "warn" : "info",
    module: "athlete",
    message: flags.length
      ? `Athlete reference created with ${flags.length} flag(s).`
      : "Athlete reference created."
  });

  return analysis;
}

function estimateAnthropometrics(reference) {
  if (!reference.heightM) {
    return {
      status: "insufficient_data",
      flags: ["missing_height"]
    };
  }

  const h = reference.heightM;

  return {
    status: "estimated",

    /*
      First-pass anthropometric model.

      Future versions:
      - measured limb lengths
      - MediaPipe-derived proportions
      - camera calibration
      - population-specific models
    */

    estimatedSegmentLengthsM: {
      torso: h * 0.30,
      thigh: h * 0.245,
      shank: h * 0.246,
      foot: h * 0.152,
      upperArm: h * 0.186,
      forearm: h * 0.146
    },

    estimatedCentreOfMassHeightM: h * 0.56,

    flags: [
      "segment_lengths_estimated",
      "centre_of_mass_estimated"
    ]
  };
}

function buildScalingModel(reference) {
  return {
    status: reference.heightCm ? "ready" : "pending",

    referenceType: "athlete_height",

    pixelToMetreScale: null,

    assumptions: [
      "full body visible improves scaling",
      "height used as primary reference",
      "camera perspective not yet corrected"
    ],

    flags: [
      "scale_pending_pose_detection"
    ]
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : null;
}
