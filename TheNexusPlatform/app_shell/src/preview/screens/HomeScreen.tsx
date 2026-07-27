import { useState } from "react";
import type { AppShellConfig, ContentConnection } from "../../types";
import { PLATFORM_META, contentOf, interpolate } from "../../data/constants";
import { PAL, Icon, labelIcon, platformIcon } from "../kit";

const AGO = ["2h ago", "Yesterday", "Mon"];

function ImagePlaceholder({ accent }: { accent: string }) {
  return (
    <div className="relative flex h-[120px] items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent}26, #121828)` }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M4.5 18l5-5 4 4 3-3 3 3" />
      </svg>
    </div>
  );
}

export function HomeScreen({
  config,
  role,
  onOpenPlatform,
}: {
  config: AppShellConfig;
  role: string;
  onOpenPlatform?: (conn: ContentConnection) => void;
}) {
  const h = config.homeConfig;
  const accent = config.accentColor;
  const connected = contentOf(config).connections.filter((c) => c.enabled);
  const name = "Alex";
  const activeRole = role || config.roles[0]?.label || "Member";

  const cards = h.cards ?? [];
  const hasCards = cards.length > 0;
  const [idx, setIdx] = useState(0);
  const cur = Math.min(idx, Math.max(0, cards.length - 1));
  // The carousel CTA opens the app's primary connected platform (real Bridge
  // launch in the live player); when nothing is connected it's just visual.
  const openPrimary = connected[0] ? () => onOpenPlatform?.(connected[0]) : undefined;

  // Feed: real items from the template, else synthesised from tiles.
  const feed = h.feedItems ?? h.tiles.slice(0, 3).map((t) => ({ title: t.label, subtitle: t.description, meta: undefined as string | undefined }));

  return (
    <div className="flex h-full flex-col" style={{ background: PAL.surface }}>
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Accent hero */}
        <div className="px-6 pb-6 pt-5" style={{ background: `radial-gradient(120% 90% at 90% -20%, ${accent}55, transparent 60%), #151B29` }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.55)" }}>{config.name}</p>
          <h2 className="mt-1.5 text-[24px] font-semibold tracking-tight" style={{ color: PAL.ink }}>
            {interpolate(h.greeting, name, activeRole) || "Welcome!"}
          </h2>
          {h.subtitle && <p className="mt-1 text-[13px]" style={{ color: "rgba(255,255,255,0.62)" }}>{interpolate(h.subtitle, name, activeRole)}</p>}

          {h.stats && h.stats.length > 0 && (
            <div className="mt-4 flex rounded-2xl py-3" style={{ background: `${accent}17`, border: `1px solid ${accent}3D` }}>
              {h.stats.map((s, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-0.5" style={i < h.stats!.length - 1 ? { borderRight: "1px solid rgba(255,255,255,0.16)" } : undefined}>
                  <span className="text-[19px] font-bold tracking-tight" style={{ color: PAL.ink }}>{s.value}</span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: "rgba(255,255,255,0.7)" }}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-2 pt-4">
          {/* Swipeable hero carousel (design) */}
          {hasCards && (
            <div className="relative mb-1">
              <div className="overflow-hidden">
                <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${(cur * 100) / cards.length}%)` }}>
                  {cards.map((c, i) => (
                    <div key={i} className="w-full flex-none px-0.5">
                      <div className="overflow-hidden rounded-2xl" style={{ background: PAL.card, border: `1px solid ${PAL.hairline}` }}>
                        <ImagePlaceholder accent={accent} />
                        <div className="flex flex-col gap-1.5 p-4">
                          {c.eyebrow && <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: PAL.muted }}>{c.eyebrow}</span>}
                          <span className="text-[21px] font-semibold tracking-tight" style={{ color: PAL.ink }}>{c.title}</span>
                          {c.description && <span className="text-[13px] leading-snug" style={{ color: PAL.slate }}>{c.description}</span>}
                          {c.cta && (
                            <button onClick={openPrimary} className="mt-2.5 h-11 rounded-full text-[15px] font-semibold" style={{ background: PAL.ink, color: "#0B0F1A" }}>
                              {c.cta}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {cards.length > 1 && (
                <>
                  <button onClick={() => setIdx(Math.max(0, cur - 1))} className="absolute left-1 top-[36%] grid h-8 w-8 place-items-center rounded-full" style={{ background: "rgba(11,15,26,0.7)", border: `1px solid ${PAL.hairline}`, opacity: cur === 0 ? 0.4 : 1 }}>
                    <Icon name="chevronLeft" size={16} color={PAL.ink} />
                  </button>
                  <button onClick={() => setIdx(Math.min(cards.length - 1, cur + 1))} className="absolute right-1 top-[36%] grid h-8 w-8 place-items-center rounded-full" style={{ background: "rgba(11,15,26,0.7)", border: `1px solid ${PAL.hairline}`, opacity: cur === cards.length - 1 ? 0.4 : 1 }}>
                    <Icon name="chevronRight" size={16} color={PAL.ink} />
                  </button>
                  <div className="mt-4 flex justify-center gap-1.5">
                    {cards.map((_, i) => (
                      <button key={i} onClick={() => setIdx(i)} className="h-1.5 rounded-full transition-all" style={{ width: i === cur ? 20 : 6, background: i === cur ? accent : "#39425A" }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Content launch cards — only when there's no carousel (the carousel
              already surfaces the platform via its CTA). */}
          {!hasCards && connected.length > 0 && (
            <div className="mb-5">
              <p className="mb-2.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: PAL.muted }}>
                {contentOf(config).sectionTitle || "Your content"}
              </p>
              <div className="space-y-2.5">
                {connected.map((conn) => {
                  const meta = PLATFORM_META[conn.platform];
                  return (
                    <button key={conn.platform} onClick={() => onOpenPlatform?.(conn)}
                      className="flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition-transform active:scale-[0.985]"
                      style={{ background: PAL.card, border: `1px solid ${PAL.hairline}` }}>
                      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl" style={{ background: `${accent}1F` }}>
                        <Icon name={platformIcon(conn.platform)} size={22} color={accent} stroke={1.5} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold" style={{ color: PAL.ink }}>{conn.label || meta.name}</span>
                        {conn.description && <span className="mt-0.5 block truncate text-[12px]" style={{ color: PAL.slate }}>{conn.description}</span>}
                        <span className="mt-1 block text-[11px] font-semibold" style={{ color: accent }}>Opens {meta.name} ›</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick-action tiles — only when there's no carousel. */}
          {!hasCards && h.tiles.length > 0 && (
            <div className="mb-5 grid grid-cols-2 gap-2.5">
              {h.tiles.map((t, i) => (
                <div key={`${t.label}-${i}`} className="rounded-2xl p-4" style={{ background: PAL.card, border: `1px solid ${PAL.hairline}` }}>
                  <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: PAL.chip }}>
                    <Icon name={labelIcon(t.label)} size={18} color="#C3CCDD" stroke={1.4} />
                  </span>
                  <p className="mt-2.5 text-[14px] font-semibold leading-tight" style={{ color: PAL.ink }}>{t.label}</p>
                  {t.description && <p className="mt-1 text-[11px] leading-snug" style={{ color: PAL.slate }}>{t.description}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Activity feed */}
          {h.showFeed && feed.length > 0 && (
            <div className="mb-3 mt-5 overflow-hidden rounded-2xl" style={{ background: PAL.card, border: `1px solid ${PAL.hairline}` }}>
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-[13px] font-semibold" style={{ color: PAL.ink }}>{h.feedLabel || "Activity"}</p>
                <span className="text-[13px] font-semibold" style={{ color: "#C3CCDD" }}>See all</span>
              </div>
              {feed.map((it, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5" style={{ borderTop: `1px solid ${PAL.hairline}` }}>
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg" style={{ background: PAL.chip }}>
                    <Icon name={labelIcon(it.title)} size={16} color="#C3CCDD" stroke={1.4} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold" style={{ color: PAL.ink }}>{it.title}</span>
                    {it.subtitle && <span className="block truncate text-[12px]" style={{ color: PAL.slate }}>{it.subtitle}</span>}
                  </span>
                  <span className="flex-shrink-0 text-[12px]" style={{ color: PAL.muted }}>{it.meta ?? AGO[i] ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom tab bar */}
      {h.navItems.length > 0 && (
        <div className="flex-shrink-0 px-3 pb-3 pt-1">
          <div className="flex rounded-2xl px-1 py-1.5" style={{ background: "#141A28", border: `1px solid #232B3D` }}>
            {h.navItems.map((item, i) => {
              const on = i === h.activeNavIndex;
              return (
                <div key={`${item.label}-${i}`} className="flex flex-1 flex-col items-center gap-1 py-1.5">
                  <Icon name={labelIcon(item.label)} size={22} color={on ? accent : PAL.muted} fill={on} stroke={1.4} />
                  <span className="text-[10px] font-medium" style={{ color: on ? PAL.ink : PAL.muted }}>{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
