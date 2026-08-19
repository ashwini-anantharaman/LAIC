/**
 * The Content Library, as a program tab.
 *
 * Not a launch. `LearningLaunch` hands the whole window to the Content Studio and
 * the console disappears; that is right for "open the Studio" and wrong for a TAB,
 * where the program's own navigation has to stay put and the panel shows one thing.
 *
 * So this frames the Studio instead, and asks it for exactly one screen:
 *
 *   screen=cd-library  → land on the library
 *   chrome=none        → and render it ALONE: no Studio sidebar, no Studio topbar
 *
 * `chrome=none` is deliberately not `embed=1`. The club app's embed also wears
 * BirdBridge's cream-and-Neco skin, which would put another app's brand inside a
 * Nexus panel; the Studio separates the two (App.tsx, `chromeless`).
 *
 * The token is minted per mount and spent by the frame. That also disposes of the
 * usual third-party-storage worry about framing an app: nothing here depends on a
 * session surviving in the frame's partition, because every open brings its own.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { ExternalLink } from "lucide-react";

import { launchLearningPlatform, type LpLaunch } from "@/services/api";
import { PageHeader, Spinner, EmptyState } from "@/nexus/ui/kit";
import { Button } from "@/app/components/ui/button";

export function ContentLibraryTab() {
  const { orgId = "", programId = "" } = useParams();
  const [launch, setLaunch] = useState<LpLaunch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLaunch(null);
    setError(null);
    launchLearningPlatform(programId)
      .then((l) => live && setLaunch(l))
      .catch((e) =>
        live && setError(e instanceof Error ? e.message : "Couldn't open the content library"),
      );
    return () => {
      live = false;
    };
  }, [programId]);

  const src = launch?.launch_url
    ? `${launch.launch_url}?launch_token=${encodeURIComponent(launch.launch_token)}` +
      `&program_id=${encodeURIComponent(programId)}` +
      `&screen=cd-library&chrome=none` +
      `&return_url=${encodeURIComponent(`${window.location.origin}/o/${orgId}/p/${programId}`)}`
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Content Library"
        subtitle="Content for this program, and which clubs each piece reaches."
        actions={
          src ? (
            <Button variant="outline" size="sm" asChild>
              <a href={src} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Open full screen
              </a>
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <EmptyState>
          <p className="font-medium text-foreground">The content library didn&rsquo;t open</p>
          {/* The server's own words: "module is disabled for this organization" and
              "content-author access required" send someone to different places. */}
          <p className="mt-1">{error}</p>
        </EmptyState>
      ) : !launch ? (
        <Spinner label="Opening the content library…" />
      ) : !src ? (
        <EmptyState>
          <p className="font-medium text-foreground">No Content Studio is connected yet</p>
          <p className="mt-1">
            This program&rsquo;s learning platform has no launch URL, so there is nothing to show here.
          </p>
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-background">
          <iframe
            src={src}
            title="Content Library"
            className="h-full w-full border-0"
            // The frame is our own Studio on a sibling origin. Clipboard is what the
            // library's "copy content URL" button needs; nothing else is granted.
            allow="clipboard-write"
          />
        </div>
      )}
    </div>
  );
}
