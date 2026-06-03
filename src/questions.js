import { SeededRandom } from "./rng.js";

export class QuestionBank {
  constructor(questions = []) {
    this.questions = [];
    this.setQuestions(questions);
  }

  setQuestions(questions) {
    this.questions = questions.map((question) => ({
      ...question,
      answers: [...question.answers]
    }));
  }

  get stats() {
    const approved = this.questions.filter((question) => question.status === "approved").length;
    return {
      total: this.questions.length,
      approved
    };
  }

  findQuestion(roundId, choiceCount, usedIds, seed) {
    const candidates = this.questions.filter((question) => {
      return question.status === "approved"
        && question.roundCompatibility.includes(roundId)
        && question.answers.length >= choiceCount
        && !usedIds.has(question.id);
    });

    if (candidates.length === 0) {
      throw new Error(`No approved questions available for ${roundId}`);
    }

    const rng = new SeededRandom(seed);
    const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
    const question = sorted[rng.int(0, sorted.length - 1)];

    return {
      ...question,
      answers: question.answers.slice(0, choiceCount)
    };
  }

  exportJson() {
    return JSON.stringify(this.questions, null, 2);
  }

  importJson(raw) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Question import must be a JSON array.");
    }

    for (const question of parsed) {
      validateQuestion(question);
    }

    this.setQuestions(parsed);
  }
}

export async function loadQuestionBank(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load questions from ${url}`);
  }
  const questions = await response.json();
  questions.forEach(validateQuestion);
  return new QuestionBank(questions);
}

export function validateQuestion(question) {
  if (!question.id || !question.prompt || !Array.isArray(question.answers)) {
    throw new Error("Invalid question: missing id, prompt or answers.");
  }

  const ids = new Set();
  const texts = new Set();
  for (const answer of question.answers) {
    if (!answer.id || !answer.text) {
      throw new Error(`Invalid answer in ${question.id}`);
    }
    if (ids.has(answer.id)) {
      throw new Error(`Duplicate answer id in ${question.id}`);
    }
    if (texts.has(answer.text.toLowerCase())) {
      throw new Error(`Duplicate answer text in ${question.id}`);
    }
    ids.add(answer.id);
    texts.add(answer.text.toLowerCase());
  }

  if (!ids.has(question.correctAnswerId)) {
    throw new Error(`Correct answer does not exist in ${question.id}`);
  }
}
