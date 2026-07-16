import type { AppShellConfig, OnboardingQuestion, QuestionType } from "../../types";
import { CHOICE_TYPES, FIELD_TYPES } from "../../data/constants";
import { AddButton, IconBtn, Label, Row, Select, TextArea, TextInput, Toggle } from "../../ui/fields";

export function OnboardingTab({
  config,
  update,
}: {
  config: AppShellConfig;
  update: (patch: Partial<AppShellConfig>) => void;
}) {
  const qs = config.onboardingQuestions;
  const setQs = (next: OnboardingQuestion[]) => update({ onboardingQuestions: next });
  const patchQ = (i: number, patch: Partial<OnboardingQuestion>) =>
    setQs(qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const setOpt = (qi: number, oi: number, val: string) =>
    patchQ(qi, { options: qs[qi].options.map((o, idx) => (idx === oi ? val : o)) });

  return (
    <>
      <div className="mb-3">
        <Toggle
          checked={config.onboardingOptional}
          onChange={(v) => update({ onboardingOptional: v })}
          label="Allow users to skip onboarding"
        />
      </div>

      <div className="space-y-2.5">
        {qs.map((q, i) => {
          const isChoice = CHOICE_TYPES.includes(q.type);
          return (
            <Row key={i}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Question {i + 1}
                </span>
                <IconBtn title="Remove question" onClick={() => setQs(qs.filter((_, idx) => idx !== i))}>
                  🗑
                </IconBtn>
              </div>
              <TextArea value={q.prompt} onChange={(v) => patchQ(i, { prompt: v })} placeholder="What's your…?" />
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label>Field type</Label>
                  <Select
                    value={q.type}
                    onChange={(v: QuestionType) => patchQ(i, { type: v })}
                    options={FIELD_TYPES}
                  />
                </div>
                <div className="pb-0.5">
                  <Toggle checked={q.required} onChange={(v) => patchQ(i, { required: v })} label="Required" />
                </div>
              </div>
              {isChoice && (
                <div className="space-y-1.5">
                  <Label>Options</Label>
                  {q.options.map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <TextInput value={o} onChange={(v) => setOpt(i, oi, v)} placeholder="Option text" />
                      <IconBtn title="Remove option" onClick={() => patchQ(i, { options: q.options.filter((_, idx) => idx !== oi) })}>
                        ×
                      </IconBtn>
                    </div>
                  ))}
                  <AddButton onClick={() => patchQ(i, { options: [...q.options, "New option"] })}>Add option</AddButton>
                </div>
              )}
            </Row>
          );
        })}
        <AddButton
          onClick={() => setQs([...qs, { prompt: "", type: "single-choice", required: true, options: ["Option 1"] }])}
        >
          Add question
        </AddButton>
      </div>
    </>
  );
}
