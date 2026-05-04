import React from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import type { QuestionnaireAnswerType, QuestionnaireQuestion, QuestionnaireRiskRating } from './QuestionnaireTypes';

type Props = {
  questions: QuestionnaireQuestion[];
  onChange: (questions: QuestionnaireQuestion[]) => void;
  enableScoring?: boolean;
  enableRatings?: boolean;
};

function newQuestion(): QuestionnaireQuestion {
  return {
    id: crypto.randomUUID(),
    question: '',
    answerType: 'yes_no',
    allocatedScore: 1,
    evidenceRequired: false,
    allowComments: true,
    riskRating: ''
  };
}

export function QuestionnaireBuilder({ questions, onChange, enableScoring = true, enableRatings = false }: Props) {
  const updateQuestion = (id: string, patch: Partial<QuestionnaireQuestion>) => {
    onChange(questions.map((question) => (question.id === id ? { ...question, ...patch } : question)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-charcoal">Questionnaire template</p>
        <button
          type="button"
          onClick={() => onChange([...questions, newQuestion()])}
          className="inline-flex items-center gap-2 rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white"
        >
          <PlusIcon className="h-4 w-4" />
          Add question
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-surface-300 px-4 py-6 text-sm text-charcoal-500">
          No questions added yet.
        </div>
      ) : null}

      {questions.map((question, index) => (
        <div key={question.id} className="rounded-lg border border-surface-200 p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <label className="text-sm md:col-span-5">
              <span className="mb-1 block text-xs text-charcoal-500">Question {index + 1}</span>
              <input
                value={question.question}
                onChange={(event) => updateQuestion(question.id, { question: event.target.value })}
                className="w-full rounded-lg border border-surface-300 px-3 py-2"
                placeholder="Enter question"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-xs text-charcoal-500">Answer type</span>
              <select
                value={question.answerType}
                onChange={(event) => updateQuestion(question.id, { answerType: event.target.value as QuestionnaireAnswerType })}
                className="w-full rounded-lg border border-surface-300 px-3 py-2"
              >
                <option value="yes_no">Yes/No</option>
                <option value="text">Text</option>
                <option value="rating">Rating</option>
              </select>
            </label>
            {enableScoring ? (
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-xs text-charcoal-500">Allocated score</span>
                <input
                  type="number"
                  min={0}
                  value={question.allocatedScore ?? ''}
                  onChange={(event) => updateQuestion(question.id, { allocatedScore: event.target.value ? Number(event.target.value) : null })}
                  className="w-full rounded-lg border border-surface-300 px-3 py-2"
                />
              </label>
            ) : null}
            {enableRatings ? (
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-xs text-charcoal-500">Rating</span>
                <select
                  value={question.riskRating ?? ''}
                  onChange={(event) => updateQuestion(question.id, { riskRating: event.target.value as QuestionnaireRiskRating })}
                  className="w-full rounded-lg border border-surface-300 px-3 py-2"
                >
                  <option value="">None</option>
                  <option value="low">Low (L)</option>
                  <option value="medium">Medium (M)</option>
                  <option value="high">High (H)</option>
                </select>
              </label>
            ) : null}
            <div className="flex items-end gap-3 md:col-span-1">
              <label className="flex items-center gap-2 text-xs text-charcoal-600">
                <input
                  type="checkbox"
                  checked={question.evidenceRequired === true}
                  onChange={(event) => updateQuestion(question.id, { evidenceRequired: event.target.checked })}
                />
                Evidence
              </label>
              <button
                type="button"
                onClick={() => onChange(questions.filter((item) => item.id !== question.id))}
                className="rounded-lg border border-critical/30 p-2 text-critical"
                title="Remove question"
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
