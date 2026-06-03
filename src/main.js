import { EventBus } from "./events.js";
import { WallGameSession } from "./game.js";
import { WallPhysics } from "./physics.js";
import { WallRenderer } from "./renderer.js";
import { ShowAudio } from "./audio.js";
import { WallUi } from "./ui.js";

async function bootstrap() {
  const [ruleset, questionBankModule] = await Promise.all([
    fetch("./data/ruleset.json").then((response) => response.json()),
    import("./questions.js")
  ]);
  const questionBank = await questionBankModule.loadQuestionBank("./data/questions.json");
  const eventBus = new EventBus();
  const canvas = document.getElementById("wallCanvas");
  const audio = new ShowAudio();
  const physics = new WallPhysics({ ruleset, eventBus, width: canvas.width, height: canvas.height });
  const renderer = new WallRenderer(canvas, physics, ruleset);
  const game = new WallGameSession({ ruleset, questionBank, physics, eventBus, audio });
  const ui = new WallUi({ eventBus, game, questionBank, ruleset });

  eventBus.on("pegHit", ({ x, y, color }) => {
    if (Math.random() < 0.28) renderer.addImpact(x, y, color);
  });
  eventBus.on("ballLanded", ({ x, y, color }) => renderer.addImpact(x, y, color));
  eventBus.on("stateChanged", ({ state }) => {
    document.getElementById("cameraCue").textContent = cameraCueForState(state);
    document.getElementById("physicsCue").textContent = state.pendingDrops > 0 ? "PHYS LIVE" : "PHYS READY";
  });

  let previous = performance.now();
  function tick(now) {
    const deltaSeconds = (now - previous) / 1000;
    previous = now;
    physics.step(deltaSeconds);
    renderer.render(deltaSeconds, game.state.roundId);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.wallPrototype = { game, physics, renderer, ui, ruleset, questionBank };
}

function cameraCueForState(state) {
  if (state.status === "question") return "CAM B / QUESTION";
  if (state.status === "dropping" && state.pendingDrops >= 4) return "CAM A / SUPERDROP";
  if (state.status === "dropping") return "CAM C / BALL TRACK";
  if (state.status === "contract") return "CAM ISO / CONTRACT";
  if (state.status === "finished") return "CAM A / FINAL REVEAL";
  return "CAM A / WIDE";
}

bootstrap().catch((error) => {
  console.error(error);
  document.getElementById("statusLine").textContent = error.message;
});
