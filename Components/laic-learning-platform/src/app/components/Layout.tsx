import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
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

// Screen imports
import { StudentDashboard } from './screens/StudentDashboard';
import { LearnerReader } from './screens/LearnerReader';
import { CDHome } from './screens/CDHome';
import { CDCreate } from './screens/CDCreate';
import { CDSources } from './screens/CDSources';
import { ObjectLibrary } from './screens/ObjectLibrary';
import { TemplateLibrary } from './screens/TemplateLibrary';
import { MySubmissions } from './screens/MySubmissions';
import { VersionsPublishing } from './screens/VersionsPublishing';
import { AuthorAnalytics } from './screens/AuthorAnalytics';
import { ObjectCreator } from './screens/ObjectCreator';
import { ObjectCreatorTutorialV2 } from './screens/tutorialV2/ObjectCreatorTutorialV2';
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
  const { currentScreen, readerObjectId, creatorObjectType } = useApp();

  if (readerObjectId) return <LearnerReader objectId={readerObjectId} />;

  switch (currentScreen) {
    case 'student-dashboard':
    case 'student-courses':
      return <StudentDashboard />;
    case 'cd-home':     return <CDHome />;
    case 'cd-create':   return <CDCreate />;
    case 'cd-templates': return <TemplateLibrary />;
    case 'cd-sources':  return <CDSources />;
    case 'cd-library':  return <ObjectLibrary />;
    case 'cd-test-container': return <TestContainer />;
    case 'cd-submissions': return <MySubmissions />;
    case 'cd-versions': return <VersionsPublishing />;
    case 'cd-analytics': return <AuthorAnalytics />;
    case 'cd-creator':
      return creatorObjectType === 'tutorial-v2'
        ? <ObjectCreatorTutorialV2 />
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
  const { currentScreen, readerObjectId, navigate, nexusMode } = useApp();
  const narrow = useIsMobile();
  const [mobileLaunch, setMobileLaunch] = useState(() => isNexusMobileShell());
  const [navOpen, setNavOpen] = useState(false);

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

  // Standalone localhost/demo: always use the full desktop shell + persistent sidebar.
  // Mobile drawer only when launched from the Nexus mobile org app.
  const mobile = nexusMode ? (mobileLaunch || narrow) : false;

  useEffect(() => {
    if (!mobile) setNavOpen(false);
  }, [mobile]);

  useEffect(() => {
    document.documentElement.dataset.csShell = mobile ? 'mobile' : 'desktop';
    if (mobileLaunch) document.documentElement.dataset.csMobileLaunch = '1';
    else delete document.documentElement.dataset.csMobileLaunch;
    return () => {
      delete document.documentElement.dataset.csShell;
      delete document.documentElement.dataset.csMobileLaunch;
    };
  }, [mobile, mobileLaunch]);

  // Isolate each screen so a crash (e.g. the student-preview crash) shows a
  // recoverable boundary instead of blanking the whole app.
  const boundaryKey = readerObjectId ? `reader:${readerObjectId}` : currentScreen || 'unknown';
  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden">
      {!mobile ? <Sidebar /> : <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar mobile={mobile} onOpenNav={() => setNavOpen(true)} />
        <ReadOnlyBanner />
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
