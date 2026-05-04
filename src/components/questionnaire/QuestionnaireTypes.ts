export type QuestionnaireAnswerType = 'yes_no' | 'text' | 'rating';
export type QuestionnaireRiskRating = 'low' | 'medium' | 'high' | '';

export type QuestionnaireQuestion = {
  id: string;
  question: string;
  answerType: QuestionnaireAnswerType;
  allocatedScore?: number | null;
  evidenceRequired?: boolean;
  allowComments?: boolean;
  riskRating?: QuestionnaireRiskRating;
};

export type QuestionnaireAnswer = {
  questionId: string;
  answer?: string | boolean | number | null;
  comment?: string;
  achievedScore?: number | null;
  riskRating?: QuestionnaireRiskRating;
  evidenceCount?: number;
  evidenceFileIds?: string[];
};

export function calculateQuestionnaireScore(questions: QuestionnaireQuestion[], answers: QuestionnaireAnswer[]) {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const allocatedScore = questions.reduce((sum, question) => sum + Number(question.allocatedScore ?? 0), 0);
  const achievedScore = questions.reduce((sum, question) => {
    const answer = answerByQuestion.get(question.id);
    return sum + Number(answer?.achievedScore ?? 0);
  }, 0);
  return {
    allocatedScore,
    achievedScore,
    overallScore: allocatedScore > 0 ? Number(((achievedScore / allocatedScore) * 100).toFixed(1)) : 0
  };
}

export function getMissingRequiredEvidence(questions: QuestionnaireQuestion[], answers: QuestionnaireAnswer[]) {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  return questions.filter((question) => {
    if (!question.evidenceRequired) return false;
    const answer = answerByQuestion.get(question.id);
    const count = Number(answer?.evidenceCount ?? answer?.evidenceFileIds?.length ?? 0);
    return count <= 0;
  });
}
