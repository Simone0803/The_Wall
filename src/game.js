import {
  BallColor,
  RiskMode,
  RoundId,
  applyBallToBank,
  calculateContractValue,
  canUseRiskMode,
  fillDropZones,
  formatMoney,
  getDropZonesForQuestion,
  getPrizeTable,
  getQuestionChoices,
  getRoundQuestionCount,
  resolveBallCount
} from "./rules.js";
import { makeSeed, SeededRandom } from "./rng.js";

const TEAM_COLORS = ["#ffd66b", "#35d6ff", "#ff356f", "#41f28e", "#c084fc", "#ff9f43"];

export class WallGameSession {
  constructor({ ruleset, questionBank, physics, eventBus, audio }) {
    this.ruleset = ruleset;
    this.questionBank = questionBank;
    this.physics = physics;
    this.eventBus = eventBus;
    this.audio = audio;
    this.releaseIndex = 0;
    this.teams = [];
    this.currentTeamIndex = 0;
    this.configureTeams(1, ["Squadra 1"], false);

    this.eventBus.on("ballLanded", (event) => this.handleBallLanded(event));
  }

  get activeTeam() {
    return this.teams[this.currentTeamIndex];
  }

  configureTeams(teamCount, names = [], emit = true) {
    const count = Math.max(1, Math.min(6, Number(teamCount) || 1));
    this.teams = Array.from({ length: count }, (_, index) => {
      const name = names[index]?.trim() || `Squadra ${index + 1}`;
      return {
        id: `team-${index + 1}`,
        name,
        color: TEAM_COLORS[index % TEAM_COLORS.length],
        state: createInitialState(`team-${index + 1}`, name)
      };
    });
    this.currentTeamIndex = 0;
    this.state = this.activeTeam.state;
    this.physics.activeBalls.length = 0;
    this.postDropAction = null;
    this.releaseIndex = 0;

    if (emit) {
      this.emitState("Scegli le squadre e avvia lo show");
      this.emitTeams();
      this.eventBus.emit("ledgerChanged", { ledger: this.state.ledger });
    }
  }

  reset() {
    this.configureTeams(this.teams.length || 1, this.teams.map((team) => team.name));
  }

  async start() {
    await this.startTeams(this.teams.length || 1, this.teams.map((team) => team.name));
  }

  async startTeams(teamCount, names = []) {
    await this.audio?.enable();
    this.configureTeams(teamCount, names, false);
    this.state.roundId = RoundId.FREE_FALL;
    this.state.questionIndex = 0;
    this.emitTeams();
    this.askQuestion();
  }

  setActiveTeam(index) {
    if (!this.teams[index] || this.state.pendingDrops > 0) return;
    this.currentTeamIndex = index;
    this.state = this.activeTeam.state;
    this.emitState(`Turno: ${this.activeTeam.name}`);
    this.emitTeams();
    this.eventBus.emit("ledgerChanged", { ledger: this.state.ledger });
    if (this.state.status === "question" && this.state.currentQuestion) {
      this.eventBus.emit("questionChanged", { question: this.state.currentQuestion, state: this.publicState() });
    }
  }

  nextTeam() {
    if (this.state.pendingDrops > 0) return;
    this.advanceTeam();
  }

  setDropZone(zone) {
    const cleanZone = Math.max(1, Math.min(this.ruleset.dropZones, zone));
    const ballCount = resolveBallCount(
      this.ruleset,
      this.state.roundId,
      this.state.questionIndex,
      this.state.riskMode
    );

    this.state.selectedDropZone = cleanZone;

    if (ballCount >= this.ruleset.dropZones) {
      this.state.selectedDropZones = Array.from({ length: this.ruleset.dropZones }, (_, index) => index + 1);
    } else if (this.state.selectedDropZones.includes(cleanZone)) {
      if (this.state.selectedDropZones.length > 1) {
        this.state.selectedDropZones = this.state.selectedDropZones.filter((item) => item !== cleanZone);
      }
    } else if (this.state.selectedDropZones.length < ballCount) {
      this.state.selectedDropZones = [...this.state.selectedDropZones, cleanZone];
    } else {
      this.state.selectedDropZones = [...this.state.selectedDropZones.slice(1), cleanZone];
    }

    this.eventBus.emit("zoneChanged", { zones: this.state.selectedDropZones });
    this.emitState();
  }

  setRiskMode(mode) {
    if (!canUseRiskMode(this.ruleset, this.state.roundId, this.state.questionIndex, mode)) {
      mode = RiskMode.NORMAL;
    }
    const previousMode = this.state.riskMode;
    this.state.riskMode = mode;
    this.syncSelectedDropZones(previousMode !== mode);
    this.eventBus.emit("riskChanged", { mode });
    this.emitState();
  }

  askQuestion() {
    const { roundId, questionIndex } = this.state;
    const choiceCount = getQuestionChoices(this.ruleset, roundId);
    const seed = makeSeed(this.state.matchId, this.state.teamId, roundId, questionIndex, "question");
    const question = this.questionBank.findQuestion(roundId, choiceCount, this.state.usedQuestionIds, seed);
    this.state.usedQuestionIds.add(question.id);
    this.state.currentQuestion = question;
    this.state.status = "question";
    this.state.riskMode = roundId === RoundId.FREE_FALL ? RiskMode.TRIPLE : RiskMode.NORMAL;
    this.syncSelectedDropZones();
    this.eventBus.emit("questionChanged", { question, state: this.publicState() });
    this.emitState(`${this.activeTeam.name} / ${this.roundLabel()} / domanda ${questionIndex + 1}`);
  }

  submitAnswer(answerId) {
    if (this.state.status !== "question" || !this.state.currentQuestion) return;

    const question = this.state.currentQuestion;
    const correct = question.correctAnswerId === answerId;
    this.state.stats.completedQuestions += 1;
    this.state.stats.correctAnswers += correct ? 1 : 0;
    this.state.stats.wrongAnswers += correct ? 0 : 1;
    if (this.state.roundId !== RoundId.FREE_FALL && correct) {
      this.state.correctIsolationAnswers += 1;
    }

    this.audio?.cue(correct ? "correct" : "wrong");
    this.eventBus.emit("answerResolved", {
      answerId,
      correctAnswerId: question.correctAnswerId,
      correct,
      state: this.publicState()
    });

    const color = correct ? BallColor.GREEN : BallColor.RED;
    const ballCount = resolveBallCount(
      this.ruleset,
      this.state.roundId,
      this.state.questionIndex,
      this.state.riskMode
    );
    const dropZones = getDropZonesForQuestion(
      this.ruleset,
      this.state.roundId,
      this.state.selectedDropZone,
      ballCount,
      this.state.selectedDropZones
    );

    this.postDropAction = () => this.completeQuestion();
    this.dropBalls({
      label: `Q${this.state.questionIndex + 1}`,
      roundId: this.state.roundId,
      color,
      dropZones
    });
  }

  syncSelectedDropZones(resetManualSelection = false) {
    if (!this.state.roundId) return;

    const ballCount = resolveBallCount(
      this.ruleset,
      this.state.roundId,
      this.state.questionIndex,
      this.state.riskMode
    );

    if (ballCount >= this.ruleset.dropZones) {
      this.state.selectedDropZones = Array.from({ length: this.ruleset.dropZones }, (_, index) => index + 1);
      return;
    }

    if (resetManualSelection) {
      this.state.selectedDropZones = [this.state.selectedDropZone];
      return;
    }

    this.state.selectedDropZones = fillDropZones(
      this.ruleset,
      this.state.selectedDropZone,
      ballCount,
      this.state.selectedDropZones
    );
  }

  autoAnswer() {
    if (this.state.status !== "question") return;
    const rng = new SeededRandom(makeSeed(this.state.matchId, this.state.teamId, this.state.roundId, this.state.questionIndex, "auto"));
    const question = this.state.currentQuestion;
    const shouldBeCorrect = rng.next() < 0.68;
    const answer = shouldBeCorrect
      ? question.answers.find((item) => item.id === question.correctAnswerId)
      : rng.pick(question.answers.filter((item) => item.id !== question.correctAnswerId));
    this.submitAnswer(answer.id);
  }

  completeQuestion() {
    this.state.questionIndex += 1;
    this.state.currentQuestion = null;
    const total = getRoundQuestionCount(this.ruleset, this.state.roundId);
    if (this.state.questionIndex < total) {
      if (this.teams.length > 1) {
        this.state.status = "waiting";
        this.advanceTeam();
      } else {
        this.askQuestion();
      }
      return;
    }
    this.completeRound();
  }

  completeRound() {
    if (this.state.roundId === RoundId.FREE_FALL) {
      this.state.round1Bank = this.state.bank;
      if (this.state.bank <= 0) {
        this.finish("Il bank e arrivato a zero nel Free Fall.");
        return;
      }
      this.startRound2();
      return;
    }

    if (this.state.roundId === RoundId.ROUND_2) {
      const config = this.ruleset.rounds.round2;
      if (config.closingRedMirrorsOpening && this.state.bank > 0) {
        this.postDropAction = () => this.startRound3();
        this.dropBalls({
          label: "R2-Closing-Red",
          roundId: RoundId.ROUND_2,
          color: BallColor.RED,
          dropZones: this.state.round2OpeningDropZones.length
            ? this.state.round2OpeningDropZones
            : (config.openingDropZones || [3, 5])
        });
      } else {
        this.startRound3();
      }
      return;
    }

    if (this.state.roundId === RoundId.ROUND_3) {
      this.offerContract();
    }
  }

  startRound2() {
    const config = this.ruleset.rounds.round2;
    this.state.roundId = RoundId.ROUND_2;
    this.state.questionIndex = 0;
    this.state.currentQuestion = null;
    this.state.riskMode = RiskMode.NORMAL;
    this.state.round2OpeningDropZones = [...(config.openingDropZones || [3, 5])]
      .slice(0, config.openingGreenBalls || 2);

    if ((config.openingGreenBalls || 0) > 0) {
      this.postDropAction = () => this.askQuestion();
      this.dropBalls({
        label: "R2-Opening-Green",
        roundId: RoundId.ROUND_2,
        color: BallColor.GREEN,
        dropZones: this.state.round2OpeningDropZones
      });
      return;
    }

    this.askQuestion();
  }

  startRound3() {
    this.state.roundId = RoundId.ROUND_3;
    this.state.questionIndex = 0;
    this.state.currentQuestion = null;
    this.state.riskMode = RiskMode.NORMAL;
    this.state.finalOpeningDropZones = [...this.ruleset.rounds.round3.openingDropZones];

    this.postDropAction = () => this.askQuestion();
    this.dropBalls({
      label: "R3-Opening-Green",
      roundId: RoundId.ROUND_3,
      color: BallColor.GREEN,
      dropZones: this.state.finalOpeningDropZones
    });
  }

  offerContract() {
    this.state.contractValue = calculateContractValue(
      this.state.round1Bank,
      this.state.correctIsolationAnswers,
      this.ruleset.contractBonusPerCorrectAnswer
    );
    this.state.status = "contract";
    this.audio?.cue("contract");
    this.eventBus.emit("contractOffered", {
      contractValue: this.state.contractValue,
      state: this.publicState()
    });
    this.emitState(`Contratto disponibile: ${formatMoney(this.state.contractValue, this.ruleset.currency)}`);
  }

  decideContract(decision) {
    if (this.state.status !== "contract") return;
    this.state.contractDecision = decision;
    this.postDropAction = () => this.finish("Finale completato");
    this.dropBalls({
      label: "R3-Final-Red",
      roundId: RoundId.ROUND_3,
      color: BallColor.RED,
      dropZones: this.state.finalOpeningDropZones
    });
  }

  finish(message) {
    this.state.status = "finished";
    this.state.payout = this.state.contractDecision === "signed"
      ? this.state.contractValue
      : this.state.bank;
    this.state.stats.highestBank = Math.max(this.state.stats.highestBank, this.state.bank);
    this.eventBus.emit("matchFinished", {
      message,
      payout: this.state.payout,
      state: this.publicState()
    });
    this.emitState(`${message} / payout ${formatMoney(this.state.payout, this.ruleset.currency)}`);
    if (this.teams.length > 1 && this.findNextPlayableTeam() !== -1) {
      window.setTimeout(() => this.advanceTeam(), 1000);
    }
  }

  advanceTeam() {
    const nextIndex = this.findNextPlayableTeam();
    if (nextIndex === -1) {
      this.eventBus.emit("tournamentFinished", { teams: this.teamSummaries() });
      this.emitTeams();
      return;
    }

    this.currentTeamIndex = nextIndex;
    this.state = this.activeTeam.state;
    if (!this.state.roundId) {
      this.state.roundId = RoundId.FREE_FALL;
      this.state.questionIndex = 0;
    }

    this.emitState(`Turno: ${this.activeTeam.name}`);
    this.eventBus.emit("ledgerChanged", { ledger: this.state.ledger });

    if (this.state.status === "setup" || this.state.status === "waiting") {
      window.setTimeout(() => this.askQuestion(), 450);
    } else if (this.state.status === "question" && this.state.currentQuestion) {
      this.eventBus.emit("questionChanged", { question: this.state.currentQuestion, state: this.publicState() });
    } else if (this.state.status === "contract") {
      this.eventBus.emit("contractOffered", {
        contractValue: this.state.contractValue,
        state: this.publicState()
      });
    }
  }

  findNextPlayableTeam() {
    for (let step = 1; step <= this.teams.length; step += 1) {
      const index = (this.currentTeamIndex + step) % this.teams.length;
      if (this.teams[index].state.status !== "finished") return index;
    }
    return -1;
  }

  dropBalls({ label, roundId, color, dropZones }) {
    this.state.status = "dropping";
    this.state.pendingDrops += dropZones.length;
    this.state.stats.ballsDropped += dropZones.length;
    this.emitState(`${this.activeTeam.name}: ${label}, ${dropZones.length} palline ${color}`);

    dropZones.forEach((zone, index) => {
      const ballId = `${this.activeTeam.id}-${label}-B${index + 1}-${this.releaseIndex++}`;
      const seed = makeSeed(this.state.matchId, ballId, roundId, zone, color);
      const request = {
        teamId: this.activeTeam.id,
        ballId,
        roundId,
        color,
        dropZone: zone,
        seed
      };

      window.setTimeout(() => {
        this.audio?.cue("release");
        this.physics.spawnBall(request);
      }, index * 135);
    });
  }

  handleBallLanded(event) {
    const landedTeam = this.teams.find((team) => team.id === event.teamId) || this.activeTeam;
    const landedState = landedTeam.state;
    const values = getPrizeTable(this.ruleset, event.roundId);
    const slotValue = values[event.slotIndex] ?? 0;
    const previousBank = landedState.bank;
    landedState.bank = applyBallToBank(
      landedState.bank,
      event.color,
      slotValue,
      this.ruleset.bankFloor
    );
    landedState.stats.highestBank = Math.max(landedState.stats.highestBank, landedState.bank);
    landedState.stats.greenTotal += event.color === BallColor.GREEN ? slotValue : 0;
    landedState.stats.redTotal += event.color === BallColor.RED ? slotValue : 0;

    const ledgerEntry = {
      time: new Date().toISOString(),
      teamId: landedTeam.id,
      teamName: landedTeam.name,
      ballId: event.ballId,
      roundId: event.roundId,
      color: event.color,
      dropZone: event.dropZone,
      seed: event.seed,
      slot: event.slotIndex + 1,
      slotValue,
      bankBefore: previousBank,
      bankAfter: landedState.bank
    };
    landedState.ledger.push(ledgerEntry);

    this.audio?.cue(event.color === BallColor.RED ? "landRed" : "landGreen");
    landedState.pendingDrops = Math.max(0, landedState.pendingDrops - 1);
    this.eventBus.emit("bankChanged", {
      previousBank,
      bank: this.state.bank,
      delta: landedTeam.id === this.activeTeam.id ? landedState.bank - previousBank : 0,
      state: this.publicState()
    });
    if (landedTeam.id === this.activeTeam.id) {
      this.eventBus.emit("ledgerChanged", { ledger: landedState.ledger });
    }
    this.emitTeams();

    if (landedTeam.id === this.activeTeam.id && landedState.pendingDrops === 0 && this.postDropAction) {
      const action = this.postDropAction;
      this.postDropAction = null;
      window.setTimeout(action, 850);
    }
  }

  roundLabel() {
    if (!this.state.roundId) return "Setup";
    return this.ruleset.rounds[this.state.roundId].label;
  }

  emitState(statusLine = null) {
    this.eventBus.emit("stateChanged", {
      statusLine,
      state: this.publicState()
    });
    this.emitTeams();
  }

  publicState() {
    return {
      ...this.state,
      activeTeam: {
        id: this.activeTeam.id,
        name: this.activeTeam.name,
        color: this.activeTeam.color,
        index: this.currentTeamIndex
      },
      teams: this.teamSummaries(),
      usedQuestionIds: [...this.state.usedQuestionIds],
      roundLabel: this.roundLabel()
    };
  }

  emitTeams() {
    this.eventBus.emit("teamRosterChanged", {
      activeTeamId: this.activeTeam?.id,
      teams: this.teamSummaries()
    });
  }

  teamSummaries() {
    return this.teams.map((team, index) => ({
      id: team.id,
      index,
      name: team.name,
      color: team.color,
      bank: team.state.bank,
      payout: team.state.payout,
      status: team.state.status,
      roundLabel: team.state.roundId ? this.ruleset.rounds[team.state.roundId].label : "Setup",
      questionIndex: team.state.questionIndex,
      stats: { ...team.state.stats }
    }));
  }
}

function createInitialState(teamId, teamName) {
  return {
    teamId,
    teamName,
    matchId: `${teamId}-${Date.now()}`,
    status: "setup",
    bank: 0,
    roundId: null,
    questionIndex: 0,
    currentQuestion: null,
    usedQuestionIds: new Set(),
    selectedDropZone: 4,
    selectedDropZones: [1, 4, 7],
    riskMode: RiskMode.NORMAL,
    pendingDrops: 0,
    round1Bank: 0,
    correctIsolationAnswers: 0,
    contractValue: 0,
    contractDecision: null,
    payout: 0,
    round2OpeningDropZones: [],
    finalOpeningDropZones: [],
    ledger: [],
    stats: {
      correctAnswers: 0,
      wrongAnswers: 0,
      completedQuestions: 0,
      ballsDropped: 0,
      greenTotal: 0,
      redTotal: 0,
      highestBank: 0
    }
  };
}
