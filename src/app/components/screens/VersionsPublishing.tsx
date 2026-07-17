import React from 'react';
import { motion } from 'motion/react';
import { VERSIONS, OBJECTS, COURSES } from '../../../lib/data';
import { StatusPill } from './StatusPill';

export function VersionsPublishing() {
  // Combine objects and courses into a flat version history
  const rows = VERSIONS.map(v => {
    const obj = OBJECTS.find(o => o.id === v.objectId);
    const course = COURSES.find(c => c.id === v.objectId);
    return {
      ...v,
      displayTitle: obj?.title || course?.title || v.objectTitle || 'Untitled',
      displayType: obj?.type || (course ? 'Course' : 'Object'),
    };
  }).sort((a, b) => (b.versionNumber - a.versionNumber));

  return (
    <div className="px-6 py-6 w-full">
      <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 16 }}>
        Version history and publishing status. Courses go live only after administrator approval.
      </p>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-[24px] overflow-hidden" style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              {['Course / object', 'Version', 'Status', 'Date', 'Note'].map(h => (
                <th key={h} className="px-5 py-3.5 text-left" style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => (
              <motion.tr key={v.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                style={{ borderBottom: i < rows.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                <td className="px-5 py-3.5">
                  <p style={{ fontSize: 13.5, fontWeight: 550, color: '#0B1220' }}>{v.displayTitle}</p>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs" style={{ background: '#F3F4F6', color: '#374151', textTransform: 'capitalize' }}>{v.displayType}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#374151' }}>v{v.versionNumber}</span>
                    {v.isLive && <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>LIVE</span>}
                  </div>
                </td>
                <td className="px-5 py-3.5"><StatusPill status={v.status} /></td>
                <td className="px-5 py-3.5" style={{ fontSize: 12.5, color: '#9AA3AF', whiteSpace: 'nowrap' }}>{v.createdAt}</td>
                <td className="px-5 py-3.5" style={{ fontSize: 12.5, color: '#6B7280', maxWidth: 200 }}>{v.notes || <span style={{ color: '#C4CBD4' }}>—</span>}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-12 text-center">
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>No version history yet.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
