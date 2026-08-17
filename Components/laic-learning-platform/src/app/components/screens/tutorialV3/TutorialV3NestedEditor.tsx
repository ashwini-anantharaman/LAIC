/**
 * Opens the dedicated per-type editor for a Tutorial V3 embed / learning-object part.
 * Back returns to the host tutorial (assemble or section workspace).
 */
import React from 'react';
import { ConceptCardEditor } from '../ConceptCardEditor';
import { FlashcardEditor } from '../FlashcardStudy';
import { QuizEditor } from '../QuizEditor';
import {
  AssignmentEditor,
  ReflectionEditor,
  SummaryEditor,
  DrillEditor,
} from '../StructuredObjectEditors';
import type { TutorialV3Part } from '../../../../lib/tutorialV3/types';
import {
  applyConceptCardResult,
  applyFlashcardResult,
  applyQuizResult,
  applyStructuredResult,
  extractConceptCardPayload,
  extractFlashcardPayload,
  extractQuizPayload,
  extractStructuredPayload,
  nestedEditorKindForPart,
  nestedEditorTitle,
} from '../../../../lib/tutorialV3/embedEditorBridge';

const BACK = 'Back to editing content';
const DONE = 'Back to editing content';

export function TutorialV3NestedEditor({
  part,
  scope = 'bridge',
  onBack,
  onApply,
  onDone,
  initialMode = 'preview',
}: {
  part: TutorialV3Part;
  scope?: string;
  onBack: () => void;
  onApply: (patch: Partial<TutorialV3Part>) => void;
  /** Finish / save-draft exit — defaults to onBack. Prefer returning to the tutorial outline. */
  onDone?: () => void;
  /** Open in student preview first when revisiting generated content. */
  initialMode?: 'edit' | 'preview';
}) {
  const kind = nestedEditorKindForPart(part);
  if (!kind) {
    return (
      <div className="p-6">
        <p style={{ fontSize: 14, color: '#B45309' }}>This part doesn’t have a dedicated editor.</p>
        <button type="button" onClick={onBack} className="mt-3 px-3 py-2 rounded-full border" style={{ fontSize: 13 }}>
          {BACK}
        </button>
      </div>
    );
  }

  const title = nestedEditorTitle(part, kind);
  const fv = {};
  const initialId = part.versionPin?.objectId && part.versionPin.objectId !== 'generated'
    ? part.versionPin.objectId
    : undefined;

  const close = () => onBack();
  const finish = () => (onDone ? onDone() : onBack());

  const common = {
    backLabel: BACK,
    doneLabel: DONE,
    saveDraftLabel: DONE,
    initialMode,
    applyOnSaveDraft: true,
    onDone: finish,
  };

  if (kind === 'concept-card') {
    return (
      <ConceptCardEditor
        typeId="concept-card"
        title={title}
        scope={scope}
        fv={fv}
        card={extractConceptCardPayload(part) as any}
        initialId={initialId}
        {...common}
        onBack={(content?: any) => {
          if (content) onApply(applyConceptCardResult(part, content));
          close();
        }}
      />
    );
  }

  if (kind === 'flashcard-set') {
    const { cards, direction } = extractFlashcardPayload(part);
    return (
      <FlashcardEditor
        typeId="flashcard-set"
        title={title}
        scope={scope}
        fv={{ ...fv, dir: direction || 'Front→back' }}
        cards={cards}
        initialId={initialId}
        {...common}
        onBack={(nextCards?: any[]) => {
          if (Array.isArray(nextCards)) onApply(applyFlashcardResult(part, nextCards, direction));
          close();
        }}
      />
    );
  }

  if (kind === 'quiz') {
    const quiz = extractQuizPayload(part);
    return (
      <QuizEditor
        typeId="quiz"
        title={title}
        scope={scope}
        fv={fv}
        questions={quiz.questions as any}
        passMark={quiz.passMark}
        showExplanations={quiz.showExplanations}
        adaptive={quiz.adaptive}
        initialId={initialId}
        {...common}
        onBack={(questions?: any[]) => {
          if (Array.isArray(questions)) {
            onApply(applyQuizResult(part, questions, {
              passMark: quiz.passMark,
              showExplanations: quiz.showExplanations,
              adaptive: quiz.adaptive,
            }));
          }
          close();
        }}
      />
    );
  }

  if (kind === 'assignment') {
    return (
      <AssignmentEditor
        typeId="assignment"
        title={title}
        scope={scope}
        fv={fv}
        content={extractStructuredPayload(part, 'assignment') as any}
        initialId={initialId}
        {...common}
        onBack={(content?: any) => {
          if (content) onApply(applyStructuredResult(part, 'assignment', content));
          close();
        }}
      />
    );
  }

  if (kind === 'reflection') {
    return (
      <ReflectionEditor
        typeId="reflection"
        title={title}
        scope={scope}
        fv={fv}
        content={extractStructuredPayload(part, 'reflection') as any}
        initialId={initialId}
        {...common}
        onBack={(content?: any) => {
          if (content) onApply(applyStructuredResult(part, 'reflection', content));
          close();
        }}
      />
    );
  }

  if (kind === 'summary') {
    return (
      <SummaryEditor
        typeId="summary"
        title={title}
        scope={scope}
        fv={fv}
        content={extractStructuredPayload(part, 'summary') as any}
        initialId={initialId}
        {...common}
        onBack={(content?: any) => {
          if (content) onApply(applyStructuredResult(part, 'summary', content));
          close();
        }}
      />
    );
  }

  // drill
  return (
    <DrillEditor
      typeId="drill"
      title={title}
      scope={scope}
      fv={fv}
      content={extractStructuredPayload(part, 'drill') as any}
      initialId={initialId}
      {...common}
      onBack={(content?: any) => {
        if (content) onApply(applyStructuredResult(part, 'drill', content));
        close();
      }}
    />
  );
}
