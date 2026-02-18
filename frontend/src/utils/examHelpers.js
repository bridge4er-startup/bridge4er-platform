export function calculateMCQScore(questions, answers, negativeMarking = 0) {
  let score = 0;

  for (const q of questions) {
    const userAnswer = answers[q.id];

    if (userAnswer === q.correctAnswer) {
      score += 1;
    } else if (userAnswer != null) {
      score -= negativeMarking;
    }
  }

  return score;
}
