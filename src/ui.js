import { RiskMode, canUseRiskMode, formatMoney, resolveBallCount } from "./rules.js";

export class WallUi {
  constructor({ eventBus, game, questionBank, ruleset }) {
    this.eventBus = eventBus;
    this.game = game;
    this.questionBank = questionBank;
    this.ruleset = ruleset;
    this.elements = collectElements();
    this.answerButtons = [];
    this.dropZoneButtons = [];
    this.bindControls();
    this.bindEvents();
    this.renderDropZones();
    this.renderTeamSetupFields();
    this.syncTeamPreview();
    this.updateQuestionStats();
  }

  bindControls() {
    this.elements.startButton.addEventListener("click", () => this.startConfiguredTeams());
    this.elements.resetButton.addEventListener("click", () => this.game.reset());
    this.elements.autoPlayButton.addEventListener("click", () => this.game.autoAnswer());
    this.elements.nextTeamButton.addEventListener("click", () => this.game.nextTeam());
    this.elements.signContractButton.addEventListener("click", () => this.game.decideContract("signed"));
    this.elements.tearContractButton.addEventListener("click", () => this.game.decideContract("torn"));
    this.elements.teamCountSelect.addEventListener("change", () => {
      this.renderTeamSetupFields();
      this.syncTeamPreview();
    });

    const riskMap = [
      [this.elements.normalMode, RiskMode.NORMAL],
      [this.elements.doubleMode, RiskMode.DOUBLE],
      [this.elements.tripleMode, RiskMode.TRIPLE],
      [this.elements.wallMode, RiskMode.WALL_TO_WALL]
    ];

    for (const [button, mode] of riskMap) {
      button.addEventListener("click", () => this.game.setRiskMode(mode));
    }

    this.elements.questionImport.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        this.questionBank.importJson(text);
        this.updateQuestionStats();
        this.setStatus("Domande importate correttamente");
      } catch (error) {
        this.setStatus(error.message);
      } finally {
        event.target.value = "";
      }
    });

    this.elements.exportQuestionsButton.addEventListener("click", () => {
      const blob = new Blob([this.questionBank.exportJson()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "the-wall-questions.json";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  }

  bindEvents() {
    this.eventBus.on("stateChanged", ({ statusLine, state }) => {
      if (statusLine) this.setStatus(statusLine);
      this.renderState(state);
    });

    this.eventBus.on("questionChanged", ({ question, state }) => {
      this.renderQuestion(question, state);
      this.renderState(state);
    });

    this.eventBus.on("answerResolved", ({ answerId, correctAnswerId }) => {
      for (const button of this.answerButtons) {
        if (button.dataset.answerId === correctAnswerId) button.classList.add("is-correct");
        if (button.dataset.answerId === answerId && answerId !== correctAnswerId) button.classList.add("is-wrong");
        button.disabled = true;
      }
    });

    this.eventBus.on("bankChanged", ({ bank, delta }) => {
      this.elements.bankValue.textContent = formatMoney(bank, this.ruleset.currency);
      this.elements.bankValue.classList.toggle("is-loss", delta < 0);
      this.elements.bankValue.classList.toggle("is-positive", delta >= 0);
      window.setTimeout(() => this.elements.bankValue.classList.remove("is-loss"), 520);
    });

    this.eventBus.on("ledgerChanged", ({ ledger }) => this.renderLedger(ledger));
    this.eventBus.on("teamRosterChanged", ({ teams, activeTeamId }) => this.renderTeams(teams, activeTeamId));

    this.eventBus.on("contractOffered", ({ contractValue }) => {
      this.elements.contractPanel.classList.remove("is-hidden");
      this.elements.contractValue.textContent = formatMoney(contractValue, this.ruleset.currency);
    });

    this.eventBus.on("matchFinished", ({ payout, state }) => {
      this.elements.contractPanel.classList.add("is-hidden");
      this.setStatus(`Payout finale: ${formatMoney(payout, this.ruleset.currency)}`);
      this.renderState(state);
      this.elements.questionPrompt.textContent = "Partita conclusa. Reset o avvia una nuova partita.";
      this.elements.answerGrid.innerHTML = "";
    });
  }

  startConfiguredTeams() {
    const count = Number(this.elements.teamCountSelect.value) || 1;
    const names = [...this.elements.teamNameFields.querySelectorAll("input")]
      .map((input) => input.value.trim());
    this.game.startTeams(count, names);
  }

  renderTeamSetupFields() {
    const count = Number(this.elements.teamCountSelect.value) || 1;
    this.elements.teamNameFields.innerHTML = "";
    for (let i = 0; i < count; i += 1) {
      const input = document.createElement("input");
      input.type = "text";
      input.value = `Squadra ${i + 1}`;
      input.placeholder = `Nome squadra ${i + 1}`;
      input.className = "team-name-input";
      input.addEventListener("input", () => this.syncTeamPreview());
      this.elements.teamNameFields.append(input);
    }
  }

  syncTeamPreview() {
    const count = Number(this.elements.teamCountSelect.value) || 1;
    const names = [...this.elements.teamNameFields.querySelectorAll("input")]
      .map((input) => input.value.trim());
    if (this.game.state.status === "setup") {
      this.game.configureTeams(count, names);
    }
  }

  renderDropZones() {
    this.elements.dropZoneGrid.innerHTML = "";
    this.dropZoneButtons = [];
    for (let i = 1; i <= this.ruleset.dropZones; i += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drop-zone-button";
      button.textContent = String(i);
      button.addEventListener("click", () => this.game.setDropZone(i));
      this.elements.dropZoneGrid.append(button);
      this.dropZoneButtons.push(button);
    }
  }

  renderQuestion(question, state) {
    this.elements.contractPanel.classList.add("is-hidden");
    this.elements.categoryLabel.textContent = question.category;
    this.elements.difficultyLabel.textContent = `Diff. ${Math.round(question.difficulty * 100)}`;
    this.elements.questionPrompt.textContent = question.prompt;
    this.elements.answerGrid.innerHTML = "";
    this.answerButtons = [];

    question.answers.forEach((answer, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-button";
      button.dataset.answerId = answer.id;
      button.textContent = `${String.fromCharCode(65 + index)}  ${answer.text}`;
      button.addEventListener("click", () => this.game.submitAnswer(answer.id));
      this.elements.answerGrid.append(button);
      this.answerButtons.push(button);
    });

    this.renderRiskControls(state);
  }

  renderState(state) {
    this.elements.bankValue.textContent = formatMoney(state.bank, this.ruleset.currency);
    this.elements.roundLabel.textContent = state.roundLabel ?? "Setup";
    this.elements.questionLabel.textContent = state.roundId
      ? `Q${Math.min(state.questionIndex + 1, this.ruleset.rounds[state.roundId].questions)}`
      : "Q0";

    this.dropZoneButtons.forEach((button, index) => {
      button.classList.toggle("is-active", state.selectedDropZones?.includes(index + 1));
      button.disabled = state.status !== "question";
    });

    this.renderRiskControls(state);

    const canAnswer = state.status === "question";
    this.answerButtons.forEach((button) => {
      if (!button.classList.contains("is-correct") && !button.classList.contains("is-wrong")) {
        button.disabled = !canAnswer;
      }
    });

    this.elements.startButton.disabled = state.status !== "setup" && state.status !== "finished";
    this.elements.autoPlayButton.disabled = state.status !== "question";
    this.elements.nextTeamButton.disabled = state.pendingDrops > 0 || state.teams?.length <= 1;
    this.elements.signContractButton.disabled = state.status !== "contract";
    this.elements.tearContractButton.disabled = state.status !== "contract";
  }

  renderTeams(teams = [], activeTeamId = null) {
    this.elements.teamScoreboards.innerHTML = "";
    teams.forEach((team) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "team-score-card";
      button.classList.toggle("is-active", team.id === activeTeamId);
      button.style.setProperty("--team-color", team.color);
      button.innerHTML = `
        <span class="team-score-name">${team.name}</span>
        <strong>${formatMoney(team.bank, this.ruleset.currency)}</strong>
        <span>${team.roundLabel} · Q${team.questionIndex + 1}</span>
        <small>${team.stats.correctAnswers}/${team.stats.completedQuestions} corrette · ${team.stats.ballsDropped} palline</small>
      `;
      button.addEventListener("click", () => this.game.setActiveTeam(team.index));
      this.elements.teamScoreboards.append(button);
    });
  }

  renderRiskControls(state) {
    const buttons = [
      [this.elements.normalMode, RiskMode.NORMAL],
      [this.elements.doubleMode, RiskMode.DOUBLE],
      [this.elements.tripleMode, RiskMode.TRIPLE],
      [this.elements.wallMode, RiskMode.WALL_TO_WALL]
    ];

    for (const [button, mode] of buttons) {
      const enabled = state.status === "question" && canUseRiskMode(this.ruleset, state.roundId, state.questionIndex, mode);
      button.disabled = !enabled;
      button.classList.toggle("is-active", state.riskMode === mode);
      if (enabled) {
        const count = resolveBallCount(this.ruleset, state.roundId, state.questionIndex, mode);
        button.title = `Rilascia ${count} palline`;
      }
    }
  }

  renderLedger(ledger) {
    const rows = ledger.slice(-14).reverse().map((entry) => {
      const sign = entry.color === "green" ? "+" : "-";
      return `${entry.roundId} ${entry.ballId}
  ${entry.teamName ?? ""}
  zone ${entry.dropZone} seed ${entry.seed}
  slot ${entry.slot} ${sign}${formatMoney(entry.slotValue, this.ruleset.currency)}
  bank ${formatMoney(entry.bankAfter, this.ruleset.currency)}`;
    });
    this.elements.ledgerLog.textContent = rows.join("\n\n");
  }

  updateQuestionStats() {
    const stats = this.questionBank.stats;
    this.elements.questionStats.textContent = `${stats.approved}/${stats.total} domande approvate`;
  }

  setStatus(message) {
    this.elements.statusLine.textContent = message;
  }
}

function collectElements() {
  const ids = [
    "statusLine",
    "bankValue",
    "roundLabel",
    "questionLabel",
    "categoryLabel",
    "difficultyLabel",
    "questionPrompt",
    "answerGrid",
    "teamScoreboards",
    "dropZoneGrid",
    "normalMode",
    "doubleMode",
    "tripleMode",
    "wallMode",
    "startButton",
    "autoPlayButton",
    "nextTeamButton",
    "resetButton",
    "teamCountSelect",
    "teamNameFields",
    "contractPanel",
    "contractValue",
    "signContractButton",
    "tearContractButton",
    "questionStats",
    "questionImport",
    "exportQuestionsButton",
    "ledgerLog"
  ];

  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
}
