// The typed item editor (spec §6): purpose-built controls per knowledgeType,
// generated payload underneath, raw JSON behind an "advanced" disclosure.
// Reverse-mapping: conditions the typed subset can express prefill the
// fields; anything deeper prefills the per-rule JSON box instead — nothing
// is ever silently dropped.

import type {
  AuctionRuleSpec,
  HandCondition,
  ItemPayload,
  KnowledgeItem,
  KnowledgeType,
  NumParam,
} from "@bridge/kb";
import { TYPE_LABEL } from "./badges";

const showNum = (p: NumParam | undefined): string =>
  p === undefined ? "" : typeof p === "number" ? String(p) : `$${p.$setting}${p.field ? `.${p.field}` : ""}`;

interface TypedConditions {
  hcpMin?: NumParam;
  hcpMax?: NumParam;
  tpMin?: NumParam;
  tpMax?: NumParam;
  balanced?: boolean;
  suits: { suit: string; min?: NumParam; max?: NumParam }[];
  /** Set when the tree exceeds the typed subset — goes to the JSON box. */
  overflow?: HandCondition;
}

/** Decompose a condition tree into the typed subset, or overflow to JSON. */
function decompose(cond: HandCondition): TypedConditions {
  const out: TypedConditions = { suits: [] };
  const parts = "all" in cond ? cond.all : [cond];
  if (!Array.isArray(parts)) return { suits: [], overflow: cond };
  const leftovers: HandCondition[] = [];
  for (const part of parts) {
    if ("hcp" in part) {
      out.hcpMin = part.hcp.min;
      out.hcpMax = part.hcp.max;
    } else if ("totalPoints" in part) {
      out.tpMin = part.totalPoints.min;
      out.tpMax = part.totalPoints.max;
    } else if ("balanced" in part) {
      out.balanced = part.balanced;
    } else if ("suitLength" in part && out.suits.length < 2 && typeof part.suitLength.suit === "string") {
      out.suits.push({
        suit: part.suitLength.suit,
        min: part.suitLength.min,
        max: part.suitLength.max,
      });
    } else {
      leftovers.push(part);
    }
  }
  if (leftovers.length)
    out.overflow = leftovers.length === 1 ? leftovers[0]! : { all: leftovers };
  return out;
}

const input =
  "w-full rounded border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-50";
const label = "mb-0.5 block text-[11px] text-neutral-500";

function RuleRow({ rule, index }: Readonly<{ rule: AuctionRuleSpec | null; index: number }>) {
  const p = `rule${index}`;
  const c = rule ? decompose(rule.conditions) : { suits: [] as TypedConditions["suits"] };
  const action = rule?.action;
  return (
    <fieldset className="rounded-md border border-neutral-200 p-3">
      <legend className="px-1 text-xs text-neutral-500">
        {rule ? `Rule — ${rule.label}` : "New rule (leave label empty to skip)"}
      </legend>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="sm:col-span-2">
          <span className={label}>Label</span>
          <input name={`${p}:label`} defaultValue={rule?.label ?? ""} className={input} />
        </label>
        <label>
          <span className={label}>Key</span>
          <input name={`${p}:key`} defaultValue={rule?.key ?? `r${index}`} className={input} />
        </label>
        <label>
          <span className={label}>Priority</span>
          <input name={`${p}:priority`} type="number" defaultValue={rule?.priority ?? 10} className={input} />
        </label>

        <label>
          <span className={label}>Role</span>
          <select name={`${p}:role`} defaultValue={rule?.context.role ?? "opening"} className={input}>
            {["opening", "opener", "responder", "overcaller", "advancer", "any"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Contested</span>
          <select
            name={`${p}:contested`}
            defaultValue={
              rule?.context.contested === true ? "yes" : rule?.context.contested === false ? "no" : ""
            }
            className={input}
          >
            <option value="">either</option>
            <option value="no">uncontested only</option>
            <option value="yes">contested only</option>
          </select>
        </label>
        <label>
          <span className={label}>Opening pattern (kind)</span>
          <select
            name={`${p}:opening:kind`}
            defaultValue={rule?.context.opening?.kind ?? "unset"}
            className={input}
          >
            <option value="unset">any / not set</option>
            {["bid", "any_bid", "pass", "none"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-1">
          <label>
            <span className={label}>lvl≥</span>
            <input name={`${p}:opening:levelMin`} defaultValue={rule?.context.opening?.levelMin ?? ""} className={input} />
          </label>
          <label>
            <span className={label}>lvl≤</span>
            <input name={`${p}:opening:levelMax`} defaultValue={rule?.context.opening?.levelMax ?? ""} className={input} />
          </label>
          <label>
            <span className={label}>strains</span>
            <input
              name={`${p}:opening:strains`}
              defaultValue={rule?.context.opening?.strains?.join(",") ?? ""}
              placeholder="N or S,H"
              className={input}
            />
          </label>
        </div>

        <label>
          <span className={label}>HCP min</span>
          <input name={`${p}:hcpMin`} defaultValue={showNum(c.hcpMin)} placeholder="15 or $nt_range.low" className={input} />
        </label>
        <label>
          <span className={label}>HCP max</span>
          <input name={`${p}:hcpMax`} defaultValue={showNum(c.hcpMax)} placeholder="17 or $nt_range.high" className={input} />
        </label>
        <label>
          <span className={label}>Points min (HCP+length)</span>
          <input name={`${p}:tpMin`} defaultValue={showNum(c.tpMin)} className={input} />
        </label>
        <label>
          <span className={label}>Balanced</span>
          <select
            name={`${p}:balanced`}
            defaultValue={c.balanced === true ? "yes" : c.balanced === false ? "no" : ""}
            className={input}
          >
            <option value="">any shape</option>
            <option value="yes">balanced</option>
            <option value="no">unbalanced</option>
          </select>
        </label>

        {[0, 1].map((i) => (
          <div key={i} className="grid grid-cols-3 gap-1">
            <label>
              <span className={label}>suit {i + 1}</span>
              <select name={`${p}:suit${i}`} defaultValue={c.suits[i]?.suit ?? ""} className={input}>
                <option value="">—</option>
                {["S", "H", "D", "C", "partner_last_bid_suit", "own_longest_suit", "rho_bid_suit"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span className={label}>len≥</span>
              <input name={`${p}:suit${i}Min`} defaultValue={showNum(c.suits[i]?.min)} className={input} />
            </label>
            <label>
              <span className={label}>len≤</span>
              <input name={`${p}:suit${i}Max`} defaultValue={showNum(c.suits[i]?.max)} className={input} />
            </label>
          </div>
        ))}

        <label>
          <span className={label}>Action</span>
          <select name={`${p}:actionType`} defaultValue={action?.type ?? "bid"} className={input}>
            {["bid", "pass", "double", "redouble", "raise_partner", "bid_longest"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Level</span>
          <input
            name={`${p}:actionLevel`}
            type="number"
            defaultValue={
              action && "level" in action && action.level !== undefined
                ? action.level
                : action?.type === "raise_partner"
                  ? action.toLevel
                  : ""
            }
            className={input}
          />
        </label>
        <label>
          <span className={label}>Strain</span>
          <select
            name={`${p}:actionStrain`}
            defaultValue={action?.type === "bid" ? action.strain : "N"}
            className={input}
          >
            {["C", "D", "H", "S", "N"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Among (bid_longest)</span>
          <input
            name={`${p}:actionAmong`}
            defaultValue={action?.type === "bid_longest" ? action.among.join(",") : ""}
            placeholder="S,H"
            className={input}
          />
        </label>
      </div>

      <details className="mt-2" open={Boolean(c.overflow)}>
        <summary className="text-xs text-neutral-500">
          Extra conditions (JSON){c.overflow ? " — this rule uses conditions beyond the typed fields" : ""}
        </summary>
        <textarea
          name={`${p}:conditionsJson`}
          rows={3}
          defaultValue={c.overflow ? JSON.stringify(c.overflow, null, 1) : ""}
          className="mt-1 w-full rounded border border-neutral-300 p-2 font-mono text-xs"
        />
      </details>

      {rule && (
        <label className="mt-2 block text-xs text-neutral-500">
          <input type="checkbox" name={`${p}:remove`} className="mr-1" /> remove this rule
        </label>
      )}
    </fieldset>
  );
}

export function ItemEditor({
  kbId,
  item,
  action,
}: Readonly<{
  kbId: string;
  item: KnowledgeItem | null;
  action: (formData: FormData) => Promise<void>;
}>) {
  const payload: ItemPayload = item?.payload ?? { kind: "auction_rules", rules: [] };
  const auctionSpecs = payload.kind === "auction_rules" ? payload.rules : [];
  const knowledgeType: KnowledgeType = item?.knowledgeType ?? "agreement";
  const needsRules = ["bidding_rule", "convention", "agreement", "exception"].includes(knowledgeType);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kbId" value={kbId} />
      {item && <input type="hidden" name="itemId" value={item.itemId} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className={label}>Title</span>
          <input name="title" required defaultValue={item?.title ?? ""} className={input} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className={label}>What a player reads (the agreement, in plain words)</span>
          <textarea
            name="humanReadableText"
            rows={3}
            required
            defaultValue={item?.humanReadableText ?? ""}
            className={`${input} prose-knowledge`}
          />
        </label>
        <label className="text-sm">
          <span className={label}>Type</span>
          <select name="knowledgeType" defaultValue={knowledgeType} className={input}>
            {Object.entries(TYPE_LABEL).map(([value, l]) => (
              <option key={value} value={value}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={label}>Phase</span>
          <select name="phase" defaultValue={item?.phase ?? "auction"} className={input}>
            {["auction", "opening_lead", "declarer_play", "defense", "scoring"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={label}>Status (trust badge — never a gate)</span>
          <select name="status" defaultValue={item?.status ?? "draft"} className={input}>
            {["draft", "reviewed", "approved", "deprecated"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className={label}>Level tags (comma-separated, advisory)</span>
          <input
            name="supportedLevels"
            defaultValue={item?.supportedLevels.join(", ") ?? ""}
            className={input}
          />
        </label>
      </div>

      {needsRules && (
        <div className="space-y-3">
          <input type="hidden" name="ruleCount" value={auctionSpecs.length + 1} />
          {auctionSpecs.map((rule, i) => (
            <RuleRow key={rule.key} rule={rule} index={i} />
          ))}
          <RuleRow rule={null} index={auctionSpecs.length} />
        </div>
      )}

      {/* Inline settings the item exposes */}
      <div className="space-y-2">
        <input type="hidden" name="settingCount" value={(item?.settings.length ?? 0) + 1} />
        {[...(item?.settings ?? []), null].map((spec, i) => (
          <fieldset key={spec?.key ?? `new${i}`} className="rounded-md border border-neutral-200 p-3">
            <legend className="px-1 text-xs text-neutral-500">
              {spec ? `Setting — ${spec.label}` : "New setting (leave key empty to skip)"}
            </legend>
            <div className="grid gap-2 sm:grid-cols-6">
              <label>
                <span className={label}>Key</span>
                <input name={`setting${i}:key`} defaultValue={spec?.key ?? ""} className={input} />
              </label>
              <label>
                <span className={label}>Label</span>
                <input name={`setting${i}:label`} defaultValue={spec?.label ?? ""} className={input} />
              </label>
              <label>
                <span className={label}>Control</span>
                <select name={`setting${i}:control`} defaultValue={spec?.control ?? "toggle"} className={input}>
                  {["toggle", "range_hcp", "number", "single_select", "multi_select"].map((c2) => (
                    <option key={c2}>{c2}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={label}>Role</span>
                <select name={`setting${i}:role`} defaultValue={spec?.role ?? "parameter"} className={input}>
                  <option value="enable">enable (on/off gate)</option>
                  <option value="parameter">parameter ($setting)</option>
                </select>
              </label>
              {spec?.control === "range_hcp" ? (
                <>
                  <label>
                    <span className={label}>Default low</span>
                    <input
                      name={`setting${i}:defaultLow`}
                      type="number"
                      defaultValue={(spec.default as { low: number }).low}
                      className={input}
                    />
                  </label>
                  <label>
                    <span className={label}>Default high</span>
                    <input
                      name={`setting${i}:defaultHigh`}
                      type="number"
                      defaultValue={(spec.default as { high: number }).high}
                      className={input}
                    />
                  </label>
                </>
              ) : (
                <label>
                  <span className={label}>Default</span>
                  {spec?.control === "toggle" || (!spec && true) ? (
                    <input
                      name={`setting${i}:default`}
                      type="checkbox"
                      defaultChecked={Boolean(spec?.default ?? true)}
                      className="mt-1.5 block"
                    />
                  ) : (
                    <input name={`setting${i}:default`} defaultValue={String(spec?.default ?? "")} className={input} />
                  )}
                </label>
              )}
              {spec && (
                <label className="self-end text-xs text-neutral-500">
                  <input type="checkbox" name={`setting${i}:remove`} className="mr-1" /> remove
                </label>
              )}
            </div>
          </fieldset>
        ))}
      </div>

      <details>
        <summary className="text-xs text-neutral-500">
          Advanced: raw payload / settings JSON (overrides the typed fields when filled)
        </summary>
        <div className="mt-2 grid gap-2">
          <textarea
            name="payloadJson"
            rows={6}
            placeholder={JSON.stringify(item?.payload ?? { kind: "auction_rules", rules: [] })}
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
          />
          <textarea
            name="settingsJson"
            rows={3}
            placeholder={JSON.stringify(item?.settings ?? [])}
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
          />
        </div>
      </details>

      <p className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {item ? "Save (recompiles the KB)" : "Create item"}
        </button>
        <span className="text-xs text-neutral-400">
          A broken save can&apos;t reach the table — the last good compile keeps serving.
        </span>
      </p>
    </form>
  );
}
