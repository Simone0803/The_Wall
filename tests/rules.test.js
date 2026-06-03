import test from "node:test";
import assert from "node:assert/strict";
import { BallColor, RiskMode, applyBallToBank, calculateContractValue, getDropZonesForQuestion, resolveBallCount } from "../src/rules.js";
import { SeededRandom, makeSeed } from "../src/rng.js";
import { WallPhysics } from "../src/physics.js";
import { WallGameSession } from "../src/game.js";
import { EventBus } from "../src/events.js";
import { QuestionBank } from "../src/questions.js";
import ruleset from "../data/ruleset.json" with { type: "json" };
import questions from "../data/questions.json" with { type: "json" };

test("red balls cannot drive the bank below zero", () => {
  assert.equal(applyBallToBank(100, BallColor.RED, 500), 0);
  assert.equal(applyBallToBank(100, BallColor.GREEN, 500), 600);
});

test("contract value uses free fall bank plus isolation correct answer bonus", () => {
  assert.equal(calculateContractValue(85000, 4, 20000), 165000);
});

test("seeded random is repeatable", () => {
  const seed = makeSeed("match", "ball", 4);
  const a = new SeededRandom(seed);
  const b = new SeededRandom(seed);
  assert.equal(a.next(), b.next());
  assert.equal(a.range(-10, 10), b.range(-10, 10));
});

test("physics drop lands in a valid slot", () => {
  const events = [];
  const eventBus = { emit: (type, payload) => { if (type === "ballLanded") events.push(payload); } };
  const physics = new WallPhysics({ ruleset, eventBus, width: 1040, height: 1240 });
  physics.spawnBall({
    ballId: "test-ball",
    roundId: "freeFall",
    color: BallColor.GREEN,
    dropZone: 4,
    seed: makeSeed("test-ball")
  });

  for (let i = 0; i < 2000 && events.length === 0; i += 1) {
    physics.step(1 / 120);
  }

  assert.equal(events.length, 1);
  assert.ok(events[0].slotIndex >= 0);
  assert.ok(events[0].slotIndex < ruleset.slots);
});

test("all approved questions expose four answers", () => {
  for (const question of questions.filter((item) => item.status === "approved")) {
    assert.equal(question.answers.length, 4, question.id);
  }
});

test("manual drop configuration respects ball count and selected zones", () => {
  const count = resolveBallCount(ruleset, "freeFall", 0, RiskMode.DOUBLE);
  assert.equal(count, 2);
  assert.deepEqual(getDropZonesForQuestion(ruleset, "freeFall", 4, count, [2, 6]), [2, 6]);
});

test("ruleset uses Italian currency, contract bonus and prize ordering", () => {
  assert.equal(ruleset.currency, "EUR");
  assert.equal(ruleset.contractBonusPerCorrectAnswer, 2500);
  assert.deepEqual(
    ruleset.rounds.freeFall.slotValues,
    [1, 500, 100, 2000, 10, 1000, 1, 5000, 1, 1000, 10, 2000, 100, 500, 1]
  );
  assert.equal(ruleset.rounds.round3.slotValues[13], 100000);
});

test("multiplayer session creates independent team states", async () => {
  const eventBus = new EventBus();
  const fakePhysics = { activeBalls: [], spawnBall: () => {} };
  const game = new WallGameSession({
    ruleset,
    questionBank: new QuestionBank(questions),
    physics: fakePhysics,
    eventBus,
    audio: null
  });

  await game.startTeams(2, ["Blu", "Oro"]);
  assert.equal(game.teams.length, 2);
  assert.equal(game.activeTeam.name, "Blu");
  assert.equal(game.state.status, "question");
  assert.equal(game.teams[1].state.status, "setup");

  game.teams[0].state.bank = 1234;
  game.setActiveTeam(1);
  assert.equal(game.activeTeam.name, "Oro");
  assert.equal(game.state.bank, 0);
  assert.equal(game.teams[0].state.bank, 1234);
});
