import { useEffect, useRef } from "react";

type FocusProps = {
  onFocusField?: (label: string, value: string) => void;
  onVocabClick?: (term: string) => void;
};

export function Elabel({ children }: { children: React.ReactNode }) {
  return <span className="studio-elabel">{children}</span>;
}

export function Eadd({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="studio-eadd" onClick={onClick}>
      {children}
    </button>
  );
}

/** Dashed inline editable field (mockup .ef) */
export function Ef({
  value,
  onChange,
  label,
  block = false,
  className = "",
  onFocusField,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  block?: boolean;
  className?: string;
} & FocusProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  return (
    <span
      ref={ref}
      className={`studio-ef${block ? " blk" : ""} ${className}`.trim()}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      onInput={(e) => onChange(e.currentTarget.textContent ?? "")}
      onFocus={() => onFocusField?.(label, value)}
    />
  );
}

/** HTML body field — renders formatted content inside dashed box */
export function EfHtml({
  value,
  onChange,
  label,
  onFocusField,
  onVocabClick,
}: {
  value: string;
  onChange: (html: string) => void;
  label: string;
} & FocusProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  return (
    <div className="studio-body">
      <div
        ref={ref}
        className="studio-ef blk"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onFocus={() => onFocusField?.(label, value)}
        onClick={(e) => {
          const el = (e.target as HTMLElement).closest(".vocab");
          if (!el) return;
          e.preventDefault();
          const term = el.getAttribute("data-v") || el.textContent || "";
          if (term.trim()) onVocabClick?.(term.trim());
        }}
      />
    </div>
  );
}

/** Read-only rendered lesson body with clickable vocab terms */
export function StudyBodyHtml({
  html,
  onVocabClick,
}: {
  html: string;
  onVocabClick?: (term: string) => void;
}) {
  return (
    <div
      className="studio-body"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest(".vocab");
        if (!el) return;
        e.preventDefault();
        const term = el.getAttribute("data-v") || el.textContent || "";
        if (term.trim()) onVocabClick?.(term.trim());
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        const el = (e.target as HTMLElement).closest(".vocab");
        if (!el) return;
        const term = el.getAttribute("data-v") || el.textContent || "";
        if (term.trim()) onVocabClick?.(term.trim());
      }}
      role="presentation"
    />
  );
}

export function OptionRows({
  options,
  answer,
  onChangeOptions,
  onChangeAnswer,
  onDeleteOption,
  onFocusField,
}: {
  options: string[];
  answer: number;
  onChangeOptions: (options: string[]) => void;
  onChangeAnswer: (answer: number) => void;
  onDeleteOption?: (index: number) => void;
} & FocusProps) {
  return (
    <>
      <Elabel>Options · select correct</Elabel>
      {options.map((opt, i) => (
        <div key={i} className="studio-erow">
          <input
            type="radio"
            name={`opt-${options.length}-${answer}`}
            checked={answer === i}
            onChange={() => onChangeAnswer(i)}
          />
          <span className="ot">
            <Ef
              value={opt}
              label="an option"
              onChange={(v) => {
                const next = [...options];
                next[i] = v;
                onChangeOptions(next);
              }}
              onFocusField={onFocusField}
            />
          </span>
          {onDeleteOption ? (
            <button type="button" className="studio-rm" onClick={() => onDeleteOption(i)}>
              ×
            </button>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function InlineCheckEditor({
  check,
  onChange,
  onRemove,
  onFocusField,
}: {
  check: import("../../learning/types").InlineCheck;
  onChange: (check: import("../../learning/types").InlineCheck) => void;
  onRemove: () => void;
} & FocusProps) {
  return (
    <div className="studio-qcheck">
      <div className="lab">Inline check · editable</div>
      <Elabel>Question</Elabel>
      <Ef
        value={check.stem}
        label="the check question"
        block
        className="studio-qstem"
        onChange={(stem) => onChange({ ...check, stem })}
        onFocusField={onFocusField}
      />
      <OptionRows
        options={check.opts}
        answer={check.ans}
        onChangeOptions={(opts) => onChange({ ...check, opts })}
        onChangeAnswer={(ans) => onChange({ ...check, ans })}
        onDeleteOption={(i) => {
          const opts = check.opts.filter((_, idx) => idx !== i);
          onChange({ ...check, opts, ans: Math.min(check.ans, Math.max(0, opts.length - 1)) });
        }}
        onFocusField={onFocusField}
      />
      <Eadd onClick={() => onChange({ ...check, opts: [...check.opts, "New option"] })}>+ option</Eadd>
      <Elabel>Explanation</Elabel>
      <Ef
        value={check.exp}
        label="the explanation"
        block
        onChange={(exp) => onChange({ ...check, exp })}
        onFocusField={onFocusField}
      />
      <button type="button" className="studio-rm" style={{ marginTop: 8 }} onClick={onRemove}>
        Remove inline check
      </button>
    </div>
  );
}
