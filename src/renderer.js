import { BallColor, formatMoney, getPrizeTable } from "./rules.js";

export class WallRenderer {
  constructor(canvas, physics, ruleset) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.physics = physics;
    this.ruleset = ruleset;
    this.pixelRatio = window.devicePixelRatio || 1;
    this.particles = [];
    this.mood = "idle";
    this.lastResize = { width: 0, height: 0 };
  }

  resizeToDisplay() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(640, Math.floor(rect.width * this.pixelRatio));
    const height = Math.max(760, Math.floor(rect.height * this.pixelRatio));
    if (width === this.lastResize.width && height === this.lastResize.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.lastResize = { width, height };
    this.physics.resize(width, height);
  }

  addImpact(x, y, color) {
    const hue = color === BallColor.RED ? "255,45,79" : color === BallColor.GREEN ? "39,240,122" : "255,255,255";
    for (let i = 0; i < 10; i += 1) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() * 2 - 1) * 88,
        vy: (Math.random() * 2 - 1) * 88,
        life: 0.35,
        maxLife: 0.35,
        color: hue
      });
    }
  }

  render(deltaSeconds, roundId) {
    this.resizeToDisplay();
    this.updateParticles(deltaSeconds);

    const ctx = this.context;
    const { width, height } = this.canvas;
    const board = this.physics.board;

    ctx.clearRect(0, 0, width, height);
    this.drawStudio(ctx, width, height);
    this.drawBoard(ctx, board, roundId);
    this.drawPegs(ctx, board);
    this.drawSlots(ctx, board, roundId);
    this.drawBalls(ctx);
    this.drawParticles(ctx);
    this.drawLightRibs(ctx, board);
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 170 * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  drawStudio(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#06121d");
    gradient.addColorStop(0.56, "#03070c");
    gradient.addColorStop(1, "#010205");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const time = performance.now() / 1000;
    for (let i = 0; i < 52; i += 1) {
      const x = (i / 51) * width;
      const pulse = 0.14 + 0.08 * Math.sin(time * 2 + i * 0.61);
      ctx.strokeStyle = `rgba(22,167,255,${pulse})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(width * 0.5 + (x - width * 0.5) * 0.18, height);
      ctx.stroke();
    }
  }

  drawBoard(ctx, board) {
    const radius = 22;
    roundedRect(ctx, board.left - 28, board.top - 36, board.boardWidth + 56, board.bottom - board.top + 76, radius);
    const shell = ctx.createLinearGradient(0, board.top, 0, board.bottom);
    shell.addColorStop(0, "rgba(14,42,66,0.96)");
    shell.addColorStop(0.5, "rgba(2,8,15,0.94)");
    shell.addColorStop(1, "rgba(16,42,57,0.98)");
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.strokeStyle = "rgba(119,214,255,0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();

    const inner = ctx.createLinearGradient(board.left, board.top, board.right, board.bottom);
    inner.addColorStop(0, "rgba(7,20,31,0.9)");
    inner.addColorStop(0.5, "rgba(2,6,10,0.78)");
    inner.addColorStop(1, "rgba(10,28,42,0.9)");
    ctx.fillStyle = inner;
    ctx.fillRect(board.left, board.top, board.boardWidth, board.bottom - board.top);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(22,167,255,0.28)";
    ctx.lineWidth = 2;
    for (const launcher of board.launchers) {
      ctx.beginPath();
      ctx.arc(launcher.x, launcher.y, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(launcher.x, launcher.y + 22);
      ctx.lineTo(launcher.x, launcher.y + 70);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPegs(ctx, board) {
    ctx.save();
    ctx.shadowColor = "rgba(112,217,255,0.72)";
    ctx.shadowBlur = 11;
    for (const peg of board.pegs) {
      const gradient = ctx.createRadialGradient(peg.x - 2, peg.y - 2, 1, peg.x, peg.y, board.pegRadius + 4);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.35, "#bdefff");
      gradient.addColorStop(1, "#24749b");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, board.pegRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSlots(ctx, board, roundId) {
    const values = getPrizeTable(this.ruleset, roundId ?? "freeFall");
    const slotY = board.slotLineY + 4;
    const slotHeight = this.canvas.height - slotY - 18;

    for (let i = 0; i < this.ruleset.slots; i += 1) {
      const x = board.left + i * board.slotWidth;
      const high = values[i] >= 100000;
      ctx.fillStyle = high ? "rgba(255,214,107,0.16)" : "rgba(17,55,78,0.72)";
      ctx.fillRect(x + 2, slotY, board.slotWidth - 4, slotHeight);
      ctx.strokeStyle = high ? "rgba(255,214,107,0.55)" : "rgba(96,196,255,0.22)";
      ctx.strokeRect(x + 2, slotY, board.slotWidth - 4, slotHeight);

      ctx.save();
      ctx.translate(x + board.slotWidth / 2, slotY + slotHeight / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `900 ${Math.max(18, board.slotWidth * 0.24)}px Inter, Arial`;
      ctx.fillStyle = high ? "#ffd66b" : "#e8f8ff";
      ctx.shadowColor = high ? "rgba(255,214,107,0.6)" : "rgba(22,167,255,0.46)";
      ctx.shadowBlur = 12;
      ctx.fillText(formatCompactMoney(values[i], this.ruleset.currency), 0, 0);
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    for (const divider of board.slotDividers) {
      ctx.beginPath();
      ctx.moveTo(divider.x, board.slotLineY - 82);
      ctx.lineTo(divider.x, this.canvas.height - 20);
      ctx.stroke();
    }
  }

  drawBalls(ctx) {
    for (const ball of this.physics.activeBalls) {
      const color = ball.color === BallColor.RED
        ? { core: "#ff2d4f", glow: "rgba(255,45,79,0.72)" }
        : ball.color === BallColor.GREEN
          ? { core: "#27f07a", glow: "rgba(39,240,122,0.72)" }
          : { core: "#f7fbff", glow: "rgba(255,255,255,0.6)" };

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < ball.trail.length; i += 1) {
        const point = ball.trail[i];
        const alpha = i / ball.trail.length;
        ctx.fillStyle = color.glow.replace("0.72", String(0.05 * alpha));
        ctx.beginPath();
        ctx.arc(point.x, point.y, ball.radius * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.shadowColor = color.glow;
      ctx.shadowBlur = 26;
      const gradient = ctx.createRadialGradient(
        ball.x - ball.radius * 0.35,
        ball.y - ball.radius * 0.45,
        1,
        ball.x,
        ball.y,
        ball.radius
      );
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.32, color.core);
      gradient.addColorStop(1, "#041017");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = `rgba(${particle.color},${alpha})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 2 + alpha * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLightRibs(ctx, board) {
    const time = performance.now() / 1000;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 7; i += 1) {
      const launcher = board.launchers[i];
      const alpha = 0.08 + 0.05 * Math.sin(time * 2.7 + i);
      ctx.strokeStyle = `rgba(22,167,255,${alpha})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(launcher.x, board.top);
      ctx.lineTo(launcher.x, board.bottom);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function formatCompactMoney(value, currency) {
  const symbol = currency === "EUR" ? "€" : "$";
  if (value >= 1000000) return `${symbol}${value / 1000000}M`;
  if (value >= 1000) return `${symbol}${Math.round(value / 1000)}K`;
  return formatMoney(value, currency);
}
