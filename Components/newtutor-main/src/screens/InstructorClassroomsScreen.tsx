import { useState, useMemo } from "react";
import { Plus, Search, Calendar, Users, MoreVertical, BookOpen, Settings } from "lucide-react";
import { useApp } from "../store/AppContext";
import { sf } from "../constants/studyFetchTheme";
import { CreateClassroomModal } from "../components/studyfetch/CreateClassroomModal";

export function InstructorClassroomsScreen() {
  const {
    instructorCourses,
    loadCourse,
    setScreen,
    startNewCourse,
    courseId,
    showToast,
  } = useApp();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [sortByDate, setSortByDate] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = instructorCourses.filter((c) =>
      c.title.toLowerCase().includes(search.toLowerCase())
    );
    if (sortByDate) {
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [instructorCourses, search, sortByDate]);

  const openCourse = async (id: string) => {
    setLoading(id);
    try {
      await loadCourse(id);
      setScreen("instructor-course");
    } finally {
      setLoading(null);
    }
  };

  const handleCreate = async (title: string, _description: string) => {
    setShowCreate(false);
    await startNewCourse(title);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Classrooms</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage your classrooms</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: sf.blue }}
        >
          <Plus size={18} />
          Create New Classroom
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="flex-1 flex items-center gap-2 bg-white rounded-xl border px-4 py-2.5" style={{ borderColor: sf.border }}>
          <Search size={18} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search classrooms..."
            className="flex-1 text-sm outline-none bg-transparent"
          />
        </div>
        <button
          type="button"
          onClick={() => setSortByDate((s) => !s)}
          className={`px-3 py-2.5 rounded-xl border bg-white ${sortByDate ? "text-blue-600 border-blue-200" : "text-gray-500"}`}
          style={{ borderColor: sortByDate ? undefined : sf.border }}
          title={sortByDate ? "Sorted A–Z" : "Sort by name"}
        >
          <Calendar size={18} />
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: sf.border }}>
          <BookOpen size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="font-semibold text-gray-700 mb-2">No classrooms yet</p>
          <p className="text-sm text-gray-500 mb-6">Create your first classroom to upload materials and build modules.</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: sf.blue }}
          >
            Create New Classroom
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-2xl border overflow-hidden hover:shadow-lg transition-all relative"
              style={{ borderColor: sf.border }}
            >
              <button
                type="button"
                onClick={() => openCourse(course.id)}
                disabled={loading === course.id}
                className="w-full text-left disabled:opacity-60"
              >
                <div className="h-36 bg-gradient-to-br from-amber-50 to-orange-100 relative flex items-center justify-center">
                  <BookOpen size={48} className="text-orange-300" />
                  <span className="absolute top-3 left-3 text-[10px] font-bold uppercase bg-white/90 px-2 py-0.5 rounded-full text-gray-600">
                    Owner
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-bold text-gray-900 text-lg mb-2">{course.title}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Users size={12} /> 0 members
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date().toLocaleDateString()}
                    </span>
                  </div>
                  {course.published && (
                    <span className="inline-block mt-2 text-[10px] font-bold uppercase text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      Published
                    </span>
                  )}
                  {course.id === courseId && (
                    <span className="inline-block mt-2 ml-1 text-[10px] font-bold uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
              </button>
              <div className="absolute top-3 right-3">
                <button
                  type="button"
                  onClick={() => setMenuFor(menuFor === course.id ? null : course.id)}
                  className="p-1 rounded-lg bg-white/90 text-gray-500 hover:bg-white"
                >
                  <MoreVertical size={16} />
                </button>
                {menuFor === course.id && (
                  <div
                    className="absolute right-0 mt-1 w-40 bg-white rounded-xl border shadow-lg z-20 py-1"
                    style={{ borderColor: sf.border }}
                  >
                    <button
                      type="button"
                      onClick={() => { void openCourse(course.id); setMenuFor(null); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Open classroom
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void loadCourse(course.id).then(() => setScreen("instructor-settings"));
                        setMenuFor(null);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Settings size={14} /> Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(course.title);
                        showToast("Classroom name copied.");
                        setMenuFor(null);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Copy name
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateClassroomModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
