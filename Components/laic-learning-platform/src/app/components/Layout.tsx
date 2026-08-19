import React, { useEffect, useState } from 'react';
import { Eye, PanelLeft, Users } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';
import { useApp } from '../App';
import { isScreenReadOnly } from '../../lib/learningAreas';
import { isNexusMobileShell } from '../../lib/nexus';
import { useIsMobile } from './ui/use-mobile';

/** A quiet banner shown when the current screen is granted view-only. */
function ReadOnlyBanner() {
  const { currentScreen, learningPerms, learningIsAdmin } = useApp();
  if (!isScreenReadOnly(currentScreen, learningPerms, learningIsAdmin)) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 sm:px-5 py-2 text-sm text-amber-800">
      <Eye className="h-4 w-4 shrink-0" />
      View only — your role can see this area but not make changes.
    </div>
  );
}

/**
 * Which club this session authors for — shown on every screen, not just at the moment
 * of publishing.
 *
 * An author arriving from a club's + button has no way to tell that their work will go
 * to that club rather than to the shared library: the sidebar, the creator and the
 * library look identical either way, and the topbar shows the PARENT program's name.
 * "Where did my content go?" is the question that follows, and it is cheaper to answer
 * before the fact than after.
 *
 * Absent for a non-club session, where "the shared library" is exactly right and a
 * banner would be noise.
 */
function ClubScopeBanner() {
  const { nexusClubName } = useApp();
  if (!nexusClubName) return null;
  return (
    <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 sm:px-5 py-2 text-sm text-emerald-900">
      <Users className="h-4 w-4 shrink-0" />
      <span>
        Authoring for <strong>{nexusClubName}</strong> — what you publish appears in that
        club’s Activities, not in Learn.
      </span>
    </div>
  );
}

// Screen imports
import { StudentDashboard } from './screens/StudentDashboard';
import { LearnerReader } from './screens/LearnerReader';
import { CDHome } from './screens/CDHome';
import { CDCreate } from './screens/CDCreate';
import { CDSources } from './screens/CDSources';
import { ObjectLibrary } from './screens/ObjectLibrary';
import { ClubCompose } from './screens/ClubCompose';
import { TemplateLibrary } from './screens/TemplateLibrary';
import { MySubmissions } from './screens/MySubmissions';
import { VersionsPublishing } from './screens/VersionsPublishing';
import { AuthorAnalytics } from './screens/AuthorAnalytics';
import { ObjectCreator } from './screens/ObjectCreator';
import { ObjectCreatorTutorialV2 } from './screens/tutorialV2/ObjectCreatorTutorialV2';
import { ObjectCreatorTutorialV3 } from './screens/tutorialV3/ObjectCreatorTutorialV3';
import { ObjectCreatorStructuredV2 } from './screens/objectV2/ObjectCreatorStructuredV2';
import { CourseWizard } from './screens/CourseWizard';
import { ObjectReviews } from './screens/ObjectReviews';
import { CourseReviews } from './screens/CourseReviews';
import { AdminProgramOverview } from './screens/AdminProgramOverview';
import { AdminPeopleRoles } from './screens/AdminPeopleRoles';
import { AdminCoursesAssignments } from './screens/AdminCoursesAssignments';
import { AdminPublishingGovernance } from './screens/AdminPublishingGovernance';
import { PlatformAccessCatalogue } from './screens/PlatformAccessCatalogue';
import { TestContainer } from './screens/TestContainer';
import { CoachScreen } from './screens/CoachScreen';

function ScreenRouter() {
  const { currentScreen, readerObjectId, creatorObjectType, libraryRootNonce } = useApp();

  if (readerObjectId) return <LearnerReader objectId={readerObjectId} />;

  switch (currentScreen) {
    case 'student-dashboard':
    case 'student-courses':
      return <StudentDashboard />;
    case 'cd-home':     return <CDHome />;
    case 'cd-create':   return <CDCreate />;
    case 'cd-templates': return <TemplateLibrary />;
    case 'cd-sources':  return <CDSources />;
    case 'cd-library':  return <ObjectLibrary key={libraryRootNonce} />;
    case 'cd-test-container': return <TestContainer />;
    case 'cd-submissions': return <MySubmissions />;
    case 'cd-versions': return <VersionsPublishing />;
    case 'cd-analytics': return <AuthorAnalytics />;
    // Reached only from the club app's + (?screen=club-compose&embed=1). Deliberately
    // NOT in the navigation catalogue: a sidebar entry would be a second way in, with
    // different expectations about where the content lands.
    case 'club-compose': return <ClubCompose />;
    case 'cd-creator':
      return creatorObjectType === 'tutorial-v2'
        ? <ObjectCreatorTutorialV2 />
        : creatorObjectType === 'tutorial-v3'
        ? <ObjectCreatorTutorialV3 />
        : ['quiz', 'flashcard-set', 'concept-card', 'video-script'].includes(creatorObjectType || '')
          ? <ObjectCreatorStructuredV2 />
          : <ObjectCreator />;
    case 'cd-wizard':   return <CourseWizard />;
    case 'or-reviews':  return <ObjectReviews />;
    case 'cr-reviews':  return <CourseReviews />;
    case 'admin-overview':   return <AdminProgramOverview />;
    case 'admin-people':     return <AdminPeopleRoles />;
    case 'admin-courses':    return <AdminCoursesAssignments />;
    case 'admin-publishing': return <AdminPublishingGovernance />;
    case 'admin-access-catalogue': return <PlatformAccessCatalogue />;
    case 'coach':       return <CoachScreen />;
    default:
      return (
        <div className="flex items-center justify-center h-full">
          <p style={{ color: '#9AA3AF' }}>Screen not found: {currentScreen}</p>
        </div>
      );
  }
}

export function Layout() {
  // Both worlds meet here: the Nexus-mobile drawer shell (AshwiniNew2) and
  // the host-app embed mode (Quan) — embedMode's content-only early return
  // below bypasses the shell entirely, so the two never fight.
  const { embedMode, currentScreen, readerObjectId, navigate, nexusMode } = useApp();
  const narrow = useIsMobile();
  const [mobileLaunch, setMobileLaunch] = useState(() => isNexusMobileShell());
  const [navOpen, setNavOpen] = useState(false);
  /** While editing, sidebar auto-collapses; user can reopen with the edge button. */
  const [editorSidebarOpen, setEditorSidebarOpen] = useState(false);

  const editingObject = currentScreen === 'cd-creator' || currentScreen === 'cd-wizard';

  // Re-read after boot in case launch params land after first paint.
  // Standalone demo/localhost never stays in the Nexus mobile shell.
  useEffect(() => {
    if (!nexusMode) {
      try { localStorage.removeItem('laic_nexus_mobile'); } catch { /* ignore */ }
      setMobileLaunch(false);
      return;
    }
    setMobileLaunch(isNexusMobileShell());
  }, [nexusMode]);

  // A narrow viewport gets the drawer shell however the app was reached.
  //
  // This used to require nexusMode, so opening the site directly on a phone
  // kept the persistent desktop sidebar: it took more than half of a 390px
  // screen and crushed every screen into the strip beside it. How the session
  // started says nothing about how wide the screen is.
  const mobile = narrow || (nexusMode && mobileLaunch);

  useEffect(() => {
    if (!mobile) setNavOpen(false);
  }, [mobile]);

  // Leaving the editor restores the normal expanded sidebar.
  useEffect(() => {
    if (!editingObject) setEditorSidebarOpen(false);
  }, [editingObject]);

  useEffect(() => {
    document.documentElement.dataset.csShell = mobile ? 'mobile' : 'desktop';
    if (mobileLaunch) document.documentElement.dataset.csMobileLaunch = '1';
    else delete document.documentElement.dataset.csMobileLaunch;
    if (!mobile && editingObject) {
      document.documentElement.dataset.csEditor = editorSidebarOpen ? 'nav-open' : 'immersive';
    } else {
      delete document.documentElement.dataset.csEditor;
    }
    return () => {
      delete document.documentElement.dataset.csShell;
      delete document.documentElement.dataset.csMobileLaunch;
      delete document.documentElement.dataset.csEditor;
    };
  }, [mobile, mobileLaunch, editingObject, editorSidebarOpen]);

  const desktopSidebarCollapsed = !mobile && editingObject && !editorSidebarOpen;

  // Isolate each screen so a crash (e.g. the student-preview crash) shows a
  // recoverable boundary instead of blanking the whole app.
  const boundaryKey = readerObjectId ? `reader:${readerObjectId}` : currentScreen || 'unknown';

  // Embedded viewer (host app WebView): content only — no sidebar, no topbar,
  // no navigation chrome. The host app owns the surrounding navigation.
  if (embedMode) {
    return (
      /*
        A definite height, not just a minimum. The v3 reader is a fixed rail
        beside a column that scrolls inside it, and it sizes itself against its
        container — under `min-h-screen` there was nothing to resolve against,
        so it stopped at its content height and the host app's own background
        showed through the rest of the WebView. Anything taller than the
        viewport still scrolls here, as before.
      */
      <main className="h-[100dvh] overflow-y-auto">
        <ScreenErrorBoundary key={boundaryKey} onReset={() => navigate(currentScreen || 'cd-library')}>
          <ScreenRouter />
        </ScreenErrorBoundary>
      </main>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden">
      {mobile ? (
        <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
      ) : (
        <>
          <div
            className="relative shrink-0 h-full overflow-hidden"
            style={{
              width: desktopSidebarCollapsed ? 0 : 224,
              transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div className="w-56 h-full">
              <Sidebar
                onRequestCollapse={editingObject ? () => setEditorSidebarOpen(false) : undefined}
              />
            </div>
          </div>
          {desktopSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setEditorSidebarOpen(true)}
              className="fixed left-3 top-3 z-50 inline-flex items-center gap-1.5 px-3 py-2 rounded-full"
              style={{
                fontSize: 12.5,
                fontWeight: 650,
                color: '#374151',
                background: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 8px 24px -10px rgba(15,23,42,0.35)',
                backdropFilter: 'blur(10px)',
              }}
              aria-label="Open navigation"
              title="Open navigation"
            >
              <PanelLeft size={15} />
              Menu
            </button>
          )}
        </>
      )}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {!(editingObject && !mobile) ? (
          <TopBar mobile={mobile} onOpenNav={() => setNavOpen(true)} />
        ) : null}
        <ReadOnlyBanner />
        <ClubScopeBanner />
        <main
          className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col ${mobile ? 'cs-mobile-main' : ''}`}
        >
          <ScreenErrorBoundary key={boundaryKey} onReset={() => navigate(currentScreen || 'cd-library')}>
            <ScreenRouter />
          </ScreenErrorBoundary>
        </main>
      </div>
    </div>
  );
}
