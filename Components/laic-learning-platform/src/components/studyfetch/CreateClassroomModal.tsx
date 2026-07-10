import { useState } from "react";
import { X, Upload, HelpCircle, Layers, Video, FileText, Sparkles } from "lucide-react";
import { sf } from "../../constants/studyFetchTheme";

export function CreateClassroomModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, description: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate(name.trim(), description.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: sf.border }}>
          <h2 className="text-lg font-bold text-gray-900">Create Classroom</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-6 p-6">
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-xl p-8 text-center text-gray-400" style={{ borderColor: sf.border }}>
              <Upload size={28} className="mx-auto mb-2" />
              <p className="text-sm">Upload classroom icon</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 rounded-xl border outline-none focus:border-blue-500"
                style={{ borderColor: sf.border }}
                placeholder="e.g. Brain Bee Practice"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full mt-1 px-4 py-2.5 rounded-xl border outline-none focus:border-blue-500 resize-none"
                style={{ borderColor: sf.border }}
                placeholder="What will students learn?"
              />
            </div>
          </div>
          <div className="space-y-3">
            {[
              { title: "Manage Students", desc: "Share join codes and track enrollment." },
              { title: "Analytics", desc: "Mastery heatmaps and misconception logs." },
              { title: "AI Modules", desc: "Generate lessons from uploaded sources." },
              { title: "Progress Tracking", desc: "See which units students complete." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl p-4" style={{ backgroundColor: sf.blueLight }}>
                <p className="text-sm font-bold text-gray-800">{f.title}</p>
                <p className="text-xs text-gray-600 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!name.trim() || busy}
            className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60"
            style={{ backgroundColor: sf.blue }}
          >
            {busy ? "Creating…" : "+ Create Classroom"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ADD_ITEMS = [
  { icon: Upload, label: "Upload Materials", desc: "PDF, DOCX, slides, audio", color: "#3B82F6" },
  { icon: HelpCircle, label: "Create Quiz", desc: "MCQ practice questions", color: "#22C55E" },
  { icon: Video, label: "Video clip", desc: "YouTube with timestamps", color: "#06B6D4" },
  { icon: Sparkles, label: "AI Animation", desc: "3D / Manim visual", color: "#8B5CF6" },
  { icon: HelpCircle, label: "Create Test", desc: "Fixed 5-question test", color: "#2563EB" },
  { icon: Layers, label: "Create Flashcards", desc: "Spaced review deck", color: "#EAB308" },
  { icon: FileText, label: "Text explanation", desc: "AI lesson summary", color: "#EF4444" },
];

export function AddToModuleModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (type: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Add to Module</h2>
          <button type="button" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {ADD_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => { onSelect(item.label); onClose(); }}
              className="flex items-start gap-3 p-4 rounded-xl border text-left hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
              style={{ borderColor: sf.border }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${item.color}18` }}>
                <item.icon size={20} style={{ color: item.color }} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AddModuleModal({
  onClose,
  onCreateNew,
  onCopy,
}: {
  onClose: () => void;
  onCreateNew: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-5">Add Module</h2>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => { onCreateNew(); onClose(); }}
            className="p-6 rounded-2xl border-2 border-dashed hover:border-blue-400 hover:bg-blue-50/50 text-center"
            style={{ borderColor: sf.border }}
          >
            <p className="font-bold text-gray-800">Create New</p>
            <p className="text-xs text-gray-500 mt-1">AI-generate a new module</p>
          </button>
          <button
            type="button"
            onClick={() => { onCopy(); onClose(); }}
            className="p-6 rounded-2xl border-2 border-dashed hover:border-blue-400 hover:bg-blue-50/50 text-center"
            style={{ borderColor: sf.border }}
          >
            <p className="font-bold text-gray-800">Copy Existing</p>
            <p className="text-xs text-gray-500 mt-1">Duplicate from another module</p>
          </button>
        </div>
      </div>
    </div>
  );
}
