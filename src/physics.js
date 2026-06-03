import { BallColor } from "./rules.js";
import { SeededRandom } from "./rng.js";

const DEFAULT_PROFILE = {
  fixedStep: 1 / 240,
  gravity: 1120,
  linearDamping: 0.022,
  restitution: 0.56,
  railRestitution: 0.42,
  friction: 0.045,
  turbulence: 60,
  ballRadius: 12,
  pegRadius: 5,
  slotSinkVelocity: 72
};

export class WallPhysics {
  constructor({ ruleset, eventBus, width = 1040, height = 1240, profile = {} }) {
    this.ruleset = ruleset;
    this.eventBus = eventBus;
    this.profile = { ...DEFAULT_PROFILE, ...profile };
    this.activeBalls = [];
    this.time = 0;
    this.resize(width, height);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.board = buildBoard(width, height, this.ruleset, this.profile);
  }

  spawnBall(request) {
    const rng = new SeededRandom(request.seed);
    const launcher = this.board.launchers[request.dropZone - 1] ?? this.board.launchers[3];
    const ball = {
      id: request.ballId,
      teamId: request.teamId,
      roundId: request.roundId,
      color: request.color ?? BallColor.WHITE,
      dropZone: request.dropZone,
      seed: request.seed,
      x: launcher.x + rng.range(-3.4, 3.4),
      y: launcher.y + rng.range(-2, 2),
      vx: rng.range(-34, 34),
      vy: rng.range(4, 18),
      radius: this.profile.ballRadius,
      trail: [],
      landed: false,
      life: 0,
      rng
    };
    this.activeBalls.push(ball);
    this.eventBus?.emit("ballReleased", { ball });
    return ball;
  }

  step(deltaSeconds) {
    let remaining = Math.min(deltaSeconds, 1 / 15);
    while (remaining > 0) {
      const dt = Math.min(this.profile.fixedStep, remaining);
      this.integrate(dt);
      this.time += dt;
      remaining -= dt;
    }
  }

  integrate(dt) {
    const landedEvents = [];

    for (const ball of this.activeBalls) {
      if (ball.landed) continue;

      ball.life += dt;
      ball.vy += this.profile.gravity * dt;
      this.applyAirAndBoardDrift(ball, dt);
      ball.vx *= 1 - this.profile.linearDamping * dt;
      ball.vy *= 1 - this.profile.linearDamping * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      this.resolveRails(ball);
      this.resolvePegs(ball);
      this.resolveSlotFunnel(ball);

      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 16) ball.trail.shift();

      if (ball.y + ball.radius >= this.board.slotLineY) {
        const slotIndex = Math.max(0, Math.min(
          this.ruleset.slots - 1,
          Math.floor((ball.x - this.board.left) / this.board.slotWidth)
        ));
        ball.landed = true;
        ball.y = this.board.slotLineY - ball.radius + 4;
        ball.vx = 0;
        ball.vy = this.profile.slotSinkVelocity;
        landedEvents.push({
          ballId: ball.id,
          teamId: ball.teamId,
          roundId: ball.roundId,
          color: ball.color,
          slotIndex,
          dropZone: ball.dropZone,
          seed: ball.seed,
          x: ball.x,
          y: ball.y
        });
      }
    }

    for (const event of landedEvents) {
      this.eventBus?.emit("ballLanded", event);
    }

    this.activeBalls = this.activeBalls.filter((ball) => !ball.landed || ball.y < this.height + 80);
    for (const ball of this.activeBalls) {
      if (ball.landed) ball.y += ball.vy * dt;
    }
  }

  resolveRails(ball) {
    const { left, right } = this.board;
    if (ball.x - ball.radius < left) {
      ball.x = left + ball.radius;
      ball.vx = Math.max(Math.abs(ball.vx) * this.profile.railRestitution, 90 + ball.rng.range(0, 55));
    }
    if (ball.x + ball.radius > right) {
      ball.x = right - ball.radius;
      ball.vx = -Math.max(Math.abs(ball.vx) * this.profile.railRestitution, 90 + ball.rng.range(0, 55));
    }
  }

  applyAirAndBoardDrift(ball, dt) {
    const normalizedX = (ball.x - this.board.left) / this.board.boardWidth;
    const edgeBias = Math.abs(normalizedX - 0.5) * 2;
    const wave = Math.sin(ball.life * 13.7 + ball.seed * 0.00031) * 0.55
      + Math.sin(ball.life * 5.1 + ball.dropZone * 1.9) * 0.45;
    const centerPull = (0.5 - normalizedX) * edgeBias * 45;
    ball.vx += (wave * this.profile.turbulence + centerPull) * dt;
  }

  resolvePegs(ball) {
    const minDistance = ball.radius + this.profile.pegRadius;
    const minDistanceSq = minDistance * minDistance;

    for (const peg of this.board.pegs) {
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= 0 || distanceSq >= minDistanceSq) continue;

      const distance = Math.sqrt(distanceSq);
      const nx = dx / distance;
      const ny = dy / distance;
      const penetration = minDistance - distance;
      ball.x += nx * penetration;
      ball.y += ny * penetration;

      const normalVelocity = ball.vx * nx + ball.vy * ny;
      if (normalVelocity < 0) {
        const tangentX = ball.vx - normalVelocity * nx;
        const tangentY = ball.vy - normalVelocity * ny;
        const microKick = ball.rng.range(-9, 9);
        ball.vx = tangentX * (1 - this.profile.friction) - normalVelocity * nx * this.profile.restitution + ny * microKick;
        ball.vy = tangentY * (1 - this.profile.friction) - normalVelocity * ny * this.profile.restitution - nx * microKick * 0.3;
        this.eventBus?.emit("pegHit", { x: peg.x, y: peg.y, color: ball.color });
      }
    }
  }

  resolveSlotFunnel(ball) {
    const funnelTop = this.board.slotLineY - 82;
    if (ball.y < funnelTop) return;

    for (const divider of this.board.slotDividers) {
      const dx = ball.x - divider.x;
      const dy = ball.y - divider.y;
      const halfHeight = divider.height / 2;
      if (Math.abs(dx) < ball.radius + divider.radius && Math.abs(dy) < halfHeight) {
        const direction = dx >= 0 ? 1 : -1;
        ball.x = divider.x + direction * (ball.radius + divider.radius);
        ball.vx = Math.abs(ball.vx) * direction * this.profile.railRestitution;
      }
    }
  }
}

export function buildBoard(width, height, ruleset, profile = DEFAULT_PROFILE) {
  const marginX = Math.max(52, width * 0.085);
  const top = Math.max(56, height * 0.055);
  const bottom = height - Math.max(116, height * 0.1);
  const left = marginX;
  const right = width - marginX;
  const boardWidth = right - left;
  const slotWidth = boardWidth / ruleset.slots;
  const slotLineY = bottom - 12;

  const launchers = Array.from({ length: ruleset.dropZones }, (_, index) => ({
    x: left + boardWidth * ((index + 1) / (ruleset.dropZones + 1)),
    y: top + 22
  }));

  const pegs = [];
  const rows = 18;
  const pegAreaTop = top + 118;
  const pegAreaBottom = slotLineY - 118;
  const rowSpacing = (pegAreaBottom - pegAreaTop) / (rows - 1);
  const baseColumns = 14;
  const columnSpacing = boardWidth / (baseColumns + 1);

  for (let row = 0; row < rows; row += 1) {
    const y = pegAreaTop + row * rowSpacing;
    const rowOffset = row % 2 === 0 ? 0.5 : 1;
    for (let column = 0; column < baseColumns; column += 1) {
      const x = left + columnSpacing * (column + rowOffset);
      if (x > left + 16 && x < right - 16) {
        pegs.push({ x, y, row, column });
      }
    }
  }

  const lowerDeflectorRows = [
    { y: slotLineY - 94, offset: 0.5 },
    { y: slotLineY - 58, offset: 1.0 }
  ];
  for (const deflectorRow of lowerDeflectorRows) {
    for (let column = 0; column < baseColumns; column += 1) {
      const x = left + columnSpacing * (column + deflectorRow.offset);
      if (x > left + 16 && x < right - 16) {
        pegs.push({ x, y: deflectorRow.y, row: rows, column, deflector: true });
      }
    }
  }

  const slotDividers = Array.from({ length: ruleset.slots + 1 }, (_, index) => ({
    x: left + slotWidth * index,
    y: slotLineY - 38,
    height: 100,
    radius: 4
  }));

  return {
    left,
    right,
    top,
    bottom,
    boardWidth,
    slotWidth,
    slotLineY,
    launchers,
    pegs,
    slotDividers,
    pegRadius: profile.pegRadius
  };
}
