import React from 'react';
import { UploadIcon } from 'lucide-react';
import type { QuestionnaireAnswer, QuestionnaireQuestion, QuestionnaireRiskRating } from './QuestionnaireTypes';
import { calculateQuestionnaireScore } from './QuestionnaireTypes';

type Props = {
  questions: QuestionnaireQuestion[];
  answers: QuestionnaireAnswer[];
  onChange: (answers: QuestionnaireAnswer[]) => void;
  onEvidenceClick?: (question: QuestionnaireQuestion, answer: QuestionnaireAnswer) => void;
  enableScoring?: boolean;
  enableRatings?: boolean;
};

export function QuestionnaireRunner({ questions, answers, onChange, onEvidenceClick, enableScoring = true, enableRatings = false }: Props) {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]));
  const score = calculateQuestionnaireScore(questions, answers);

  const updateAnswer = (questionId: string, patch: Partial<QuestionnaireAnswer>) => {
    const existing = answerByQuestion.get(questionId) ?? { questionId };
    const next = { ...existing, ...patch };
    const without = answers.filter((answer) => answer.questionId !== questionId);
    onChange([...without, next]);
  };

  return (
    <div className="space-y-4">
      {enableScoring ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-surface-200 p-3 text-sm md:grid-cols-3">
          <span>Allocated score: <strong>{score.allocatedScore}</strong></span>
          <span>Achieved score: <strong>{score.achievedScore}</strong></span>
          <span>Overall score: <strong>{score.overallScore}%</strong></span>
        </div>
      ) : null}

      {questions.map((question, index) => {
        const answer = answerByQuestion.get(question.id) ?? { questionId: question.id };
        return (
          <div key={question.id} className="rounded-lg border border-surface-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-charcoal">{index + 1}. {question.question || 'Untitled question'}</p>
              {question.evidenceRequired ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Evidence required</span> : null}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
              <label className="text-sm md:col-span-3">
                <span className="mb-1 block text-xs text-charcoal-500">Answer</span>
                {question.answerType === 'yes_no' ? (
                  <select
                    value={answer.answer === true ? 'yes' : answer.answer === false ? 'no' : ''}
                    onChange={(event) => updateAnswer(question.id, { answer: event.target.value === 'yes' ? true : event.target.value === 'no' ? false : null })}
                    className="w-full rounded-lg border border-surface-300 px-3 py-2"
                  >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : question.answerType === 'rating' ? (
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={typeof answer.answer === 'number' || typeof answer.answer === 'string' ? String(answer.answer) : ''}
                    onChange={(event) => updateAnswer(question.id, { answer: event.target.value ? Number(event.target.value) : null })}
                    className="w-full rounded-lg border border-surface-300 px-3 py-2"
                  />
                ) : (
                  <input
                    value={String(answer.answer ?? '')}
                    onChange={(event) => updateAnswer(question.id, { answer: event.target.value })}
                    className="w-full rounded-lg border border-surface-300 px-3 py-2"
                  />
                )}
              </label>
              <label className="text-sm md:col-span-4">
                <span className="mb-1 block text-xs text-charcoal-500">Comment</span>
                <input
                  value={answer.comment ?? ''}
                  onChange={(event) => updateAnswer(question.id, { comment: event.target.value })}
                  className="w-full rounded-lg border border-surface-300 px-3 py-2"
                />
              </label>
              {enableScoring ? (
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block text-xs text-charcoal-500">Achieved</span>
                  <input
                    type="number"
                    min={0}
                    max={question.allocatedScore ?? undefined}
                    value={answer.achievedScore ?? ''}
                    onChange={(event) => updateAnswer(question.id, { achievedScore: event.target.value ? Number(event.target.value) : null })}
                    className="w-full rounded-lg border border-surface-300 px-3 py-2"
                  />
                </label>
              ) : null}
              {enableRatings ? (
                <label className="text-sm md:col-span-2">
                  <span className="mb-1 block text-xs text-charcoal-500">Rating</span>
                  <select
                    value={answer.riskRating ?? question.riskRating ?? ''}
                    onChange={(event) => updateAnswer(question.id, { riskRating: event.target.value as QuestionnaireRiskRating })}
                    className="w-full rounded-lg border border-surface-300 px-3 py-2"
                  >
                    <option value="">None</option>
                    <option value="low">Low (L)</option>
                    <option value="medium">Medium (M)</option>
                    <option value="high">High (H)</option>
                  </select>
                </label>
              ) : null}
              {onEvidenceClick ? (
                <div className="flex items-end md:col-span-1">
                  <button
                    type="button"
                    onClick={() => onEvidenceClick(question, answer)}
                    className="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3 py-2 text-sm"
                  >
                    <UploadIcon className="h-4 w-4" />
                    {answer.evidenceCount ?? answer.evidenceFileIds?.length ?? 0}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
