export const BallColor = Object.freeze({
  WHITE: "white",
  GREEN: "green",
  RED: "red"
});

export const RoundId = Object.freeze({
  FREE_FALL: "freeFall",
  ROUND_2: "round2",
  ROUND_3: "round3"
});

export const RiskMode = Object.freeze({
  NORMAL: "normal",
  DOUBLE: "double",
  TRIPLE: "triple",
  WALL_TO_WALL: "wallToWall"
});

export function formatMoney(value, currency = "USD") {
  const locale = currency === "EUR" ? "it-IT" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function applyBallToBank(bank, color, slotValue, floor = 0) {
  if (color === BallColor.GREEN) return bank + slotValue;
  if (color === BallColor.RED) return Math.max(floor, bank - slotValue);
  return bank;
}

export function calculateContractValue(round1Bank, correctAnswers, bonusPerCorrect) {
  return round1Bank + correctAnswers * bonusPerCorrect;
}

export function getPrizeTable(ruleset, roundId) {
  return ruleset.rounds[roundId].slotValues;
}

export function getQuestionChoices(ruleset, roundId) {
  return ruleset.rounds[roundId].choices;
}

export function getRoundQuestionCount(ruleset, roundId) {
  return ruleset.rounds[roundId].questions;
}

export function riskModeToBallCount(ruleset, roundId, mode, questionIndex = 0) {
  if (mode === RiskMode.WALL_TO_WALL) return ruleset.dropZones;
  if (mode === RiskMode.TRIPLE) return 3;
  if (mode === RiskMode.DOUBLE) return 2;

  const counts = ruleset.rounds[roundId]?.questionBallCounts;
  if (counts?.[questionIndex] && !ruleset.rounds[roundId]?.allowManualDropZones) {
    return counts[questionIndex];
  }

  return 1;
}

export function resolveBallCount(ruleset, roundId, questionIndex, riskMode) {
  const round = ruleset.rounds[roundId];
  if (!round) return 1;

  if (round?.allowManualDropZones) {
    return riskModeToBallCount(ruleset, roundId, riskMode, questionIndex);
  }

  if (roundId === RoundId.FREE_FALL) {
    return ruleset.rounds.freeFall.ballsPerQuestion;
  }

  if (riskMode === RiskMode.WALL_TO_WALL && ruleset.rounds[roundId].wallToWallEnabled) {
    return ruleset.dropZones;
  }

  if (riskMode === RiskMode.DOUBLE) return 2;
  if (riskMode === RiskMode.TRIPLE) return 3;

  const counts = ruleset.rounds[roundId].questionBallCounts;
  return counts?.[questionIndex] ?? 1;
}

export function getDropZonesForQuestion(ruleset, roundId, selectedDropZone, ballCount, selectedDropZones = []) {
  const round = ruleset.rounds[roundId];

  if (round?.allowManualDropZones) {
    if (ballCount >= ruleset.dropZones) {
      return Array.from({ length: ruleset.dropZones }, (_, index) => index + 1);
    }

    const cleanZones = normalizeDropZones(selectedDropZones, ruleset.dropZones).slice(0, ballCount);
    if (cleanZones.length === ballCount) return cleanZones;

    return fillDropZones(ruleset, selectedDropZone, ballCount, cleanZones);
  }

  if (roundId === RoundId.FREE_FALL) {
    return ruleset.rounds.freeFall.defaultDropZones;
  }

  if (ballCount >= ruleset.dropZones) {
    return Array.from({ length: ruleset.dropZones }, (_, index) => index + 1);
  }

  const zone = selectedDropZone || Math.ceil(ruleset.dropZones / 2);
  if (ballCount === 1) return [zone];

  const zones = [];
  const center = zone - 1;
  const offsets = ballCount === 2 ? [-1, 1] : [-1, 0, 1];

  for (const offset of offsets) {
    const candidate = Math.min(ruleset.dropZones, Math.max(1, center + offset + 1));
    if (!zones.includes(candidate)) zones.push(candidate);
  }

  while (zones.length < ballCount) {
    const candidate = Math.min(ruleset.dropZones, zones[zones.length - 1] + 1);
    if (!zones.includes(candidate)) zones.push(candidate);
    else zones.unshift(Math.max(1, zones[0] - 1));
  }

  return zones.slice(0, ballCount);
}

export function canUseRiskMode(ruleset, roundId, questionIndex, mode) {
  if (!roundId || !ruleset.rounds[roundId]) return mode === RiskMode.NORMAL;
  const round = ruleset.rounds[roundId];

  if (round.allowManualDropZones) {
    const allowed = round.allowedBallCounts ?? [1, 2, 3, ruleset.dropZones];
    return allowed.includes(riskModeToBallCount(ruleset, roundId, mode, questionIndex));
  }

  if (mode === RiskMode.NORMAL) return true;
  if (roundId === RoundId.FREE_FALL) return false;
  if (mode === RiskMode.DOUBLE) return questionIndex === 1;
  if (mode === RiskMode.TRIPLE) return questionIndex === 2;
  if (mode === RiskMode.WALL_TO_WALL) return roundId === RoundId.ROUND_2 && questionIndex === 2;
  return false;
}

export function normalizeDropZones(zones, maxZone) {
  const normalized = [];
  for (const zone of zones) {
    const clamped = Math.max(1, Math.min(maxZone, Number(zone)));
    if (!normalized.includes(clamped)) normalized.push(clamped);
  }
  return normalized.sort((a, b) => a - b);
}

export function fillDropZones(ruleset, selectedDropZone, ballCount, existing = []) {
  const zones = normalizeDropZones(existing, ruleset.dropZones);
  const center = Math.max(1, Math.min(ruleset.dropZones, selectedDropZone || Math.ceil(ruleset.dropZones / 2)));

  if (zones.length >= ballCount) {
    return zones
      .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b)
      .slice(0, ballCount)
      .sort((a, b) => a - b);
  }

  const offsets = [0, -1, 1, -2, 2, -3, 3];

  for (const offset of offsets) {
    if (zones.length >= ballCount) break;
    const candidate = center + offset;
    if (candidate >= 1 && candidate <= ruleset.dropZones && !zones.includes(candidate)) {
      zones.push(candidate);
    }
  }

  return zones.sort((a, b) => a - b).slice(0, ballCount);
}
