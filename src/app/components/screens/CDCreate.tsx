import React from 'react';
import { BookOpen, Layers, HelpCircle, Copy, Lightbulb, FileText, Zap, PenLine, Video, BookMarked, Play, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../../App';

interface ObjectTile {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  isSpecial?: boolean;
}

const TILES: ObjectTile[] = [
  { id: 'course', label: 'Course', desc: 'Multi-module learning journey with objectives & certificate', icon: <BookMarked size={22} />, color: '#0B0F1A' },
  { id: 'lesson', label: 'Lesson', desc: 'Focused unit around a single concept or skill', icon: <BookOpen size={22} />, color: '#1D4ED8' },
  { id: 'tutorial', label: 'Tutorial', desc: 'Step-by-step guided walkthrough', icon: <Layers size={22} />, color: '#7C3AED' },
  { id: 'quiz', label: 'Quiz', desc: 'Multiple-choice questions with instant feedback', icon: <HelpCircle size={22} />, color: '#059669' },
  { id: 'flashcard-set', label: 'Flashcard set', desc: 'Term–definition pairs for active recall', icon: <Copy size={22} />, color: '#D97706' },
  { id: 'concept-card', label: 'Concept card', desc: 'Single-concept reference: term, definition, example', icon: <Lightbulb size={22} />, color: '#0284C7' },
  { id: 'summary', label: 'Summary', desc: 'Condensed takeaway from a lesson or module', icon: <FileText size={22} />, color: '#6B7280' },
  { id: 'reflection', label: 'Reflection', desc: 'Guided metacognitive prompt for learners', icon: <FileText size={22} />, color: '#9333EA' },
  { id: 'scenario', label: 'Scenario', desc: 'Apply knowledge to a realistic situation', icon: <Zap size={22} />, color: '#0EA5E9' },
  { id: 'assignment', label: 'Assignment', desc: 'Open-ended task with submission', icon: <PenLine size={22} />, color: '#EA580C' },
  { id: 'drill', label: 'Drill', desc: 'Rapid-fire practice for automaticity', icon: <Zap size={22} />, color: '#DC2626' },
  { id: 'video-script', label: 'Video script', desc: 'Narration script for a video or screencast', icon: <Video size={22} />, color: '#EC4899' },
];

const SPECIALIZED: { id: string; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'bridge-play', label: 'Bridge play', desc: 'Interactive card-play widget — "win the trick"', icon: <Play size={18} /> },
  { id: 'bidding-sequence', label: 'Bidding sequence', desc: 'Step-through auction with explanations', icon: <Layers size={18} /> },
];

export function CDCreate() {
  const { navigate, setCreatorObjectType } = useApp();

  const handleTile = (id: string) => {
    if (id === 'course') {
      navigate('cd-wizard');
    } else {
      setCreatorObjectType(id);
      navigate('cd-creator');
    }
  };

  return (
    <div className="px-6 py-6 w-full">
      <div className="mb-6">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0B1220', letterSpacing: '-0.3px', marginBottom: 4 }}>
          What would you like to create?
        </h2>
        <p style={{ fontSize: 13.5, color: '#6B7280' }}>
          Choose an object type to begin. Each type shapes the authoring flow.
        </p>
      </div>

      {/* Main object tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {TILES.map((tile, i) => (
          <motion.button
            key={tile.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleTile(tile.id)}
            className="text-left p-4 rounded-[22px] transition-all"
            style={{
              background: 'white',
              boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)',
              border: '1.5px solid transparent',
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-white"
              style={{ background: tile.color }}
            >
              {tile.icon}
            </div>
            <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220', marginBottom: 3 }}>{tile.label}</p>
            <p style={{ fontSize: 12, color: '#9AA3AF', lineHeight: 1.45 }}>{tile.desc}</p>
            <div className="flex items-center gap-1 mt-3" style={{ fontSize: 11.5, color: '#C4CBD4' }}>
              Define & configure <ArrowRight size={11} />
            </div>
          </motion.button>
        ))}
      </div>

      {/* Specialized blocks */}
      <div className="mb-2">
        <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>
          Specialized blocks — Bridge program
        </p>
        <div className="flex gap-3 flex-wrap">
          {SPECIALIZED.map(s => (
            <motion.button
              key={s.id}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 px-4 py-3 rounded-[18px] text-left"
              style={{
                background: 'rgba(255,255,255,0.7)',
                border: '1.5px solid rgba(5,150,105,0.2)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>
                {s.icon}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{s.label}</p>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{s.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
