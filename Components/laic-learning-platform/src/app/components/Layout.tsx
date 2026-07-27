import React from 'react';
import { Eye } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useApp } from '../App';
import { isScreenReadOnly } from '../../lib/learningAreas';

/** A quiet banner shown when the current screen is granted view-only. */
function ReadOnlyBanner() {
  const { currentScreen, learningPerms, learningIsAdmin } = useApp();
  if (!isScreenReadOnly(currentScreen, learningPerms, learningIsAdmin)) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-800">
      <Eye className="h-4 w-4" />
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
import { CourseWizard } from './screens/CourseWizard';
import { ObjectReviews } from './screens/ObjectReviews';
import { CourseReviews } from './screens/CourseReviews';
import { AdminProgramOverview } from './screens/AdminProgramOverview';
import { AdminPeopleRoles } from './screens/AdminPeopleRoles';
import { AdminCoursesAssignments } from './screens/AdminCoursesAssignments';
import { AdminPublishingGovernance } from './screens/AdminPublishingGovernance';
import { PlatformAccessCatalogue } from './screens/PlatformAccessCatalogue';
import { CoachScreen } from './screens/CoachScreen';

function ScreenRouter() {
  const { currentScreen, readerObjectId } = useApp();

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
    case 'cd-submissions': return <MySubmissions />;
    case 'cd-versions': return <VersionsPublishing />;
    case 'cd-analytics': return <AuthorAnalytics />;
    case 'cd-creator':  return <ObjectCreator />;
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
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <ReadOnlyBanner />
        <main className="flex-1 overflow-y-auto">
          <ScreenRouter />
        </main>
      </div>
    </div>
  );
}
