import React, { useMemo } from 'react';
import { BookOpen, Users } from 'lucide-react';
import { motion } from 'motion/react';
import laicFrameworkManual from '../../../../docs/LAIC_Cross_Platform_Access_Control_Manual_v1.md?raw';
import sampleRolesDoc from '../../../../docs/sample-roles.md?raw';

type DocId = 'access-manual' | 'sample-roles';

const DOCS: Record<DocId, { title: string; file: string; icon: React.ReactNode; body: string }> = {
  'access-manual': {
    title: 'Access Control Manual',
    file: 'docs/LAIC_Cross_Platform_Access_Control_Manual_v1.md',
    icon: <BookOpen size={16} />,
    body: laicFrameworkManual,
  },
  'sample-roles': {
    title: 'Sample Roles',
    file: 'docs/sample-roles.md',
    icon: <Users size={16} />,
    body: sampleRolesDoc,
  },
};

/** Minimal markdown → React for docs (headings, lists, code, tables, paragraphs). */
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const inline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let ik = 0;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      const token = m[0];
      if (token.startsWith('**')) {
        parts.push(<strong key={`b-${ik++}`}>{token.slice(2, -2)}</strong>);
      } else {
        parts.push(
          <code
            key={`c-${ik++}`}
            className="px-1 py-0.5 rounded text-[12px]"
            style={{ background: 'rgba(0,0,0,0.06)', color: '#374151' }}
          >
            {token.slice(1, -1)}
          </code>,
        );
      }
      last = m.index + token.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '---') {
      nodes.push(<hr key={key++} className="my-5 border-0" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }} />);
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      nodes.push(
        <pre
          key={key++}
          className="my-3 p-4 rounded-2xl overflow-x-auto text-[12.5px] leading-relaxed"
          style={{ background: '#0B0F1A', color: '#E5E7EB' }}
        >
          {lang ? <span className="block mb-2 text-[10px] uppercase tracking-wide text-[#9AA3AF]">{lang}</span> : null}
          {buf.join('\n')}
        </pre>,
      );
      continue;
    }

    if (line.startsWith('|') && lines[i + 1]?.match(/^\|[\s:|-]+\|/)) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const raw = lines[i];
        if (!/^\|[\s:|-]+\|/.test(raw)) {
          rows.push(
            raw
              .split('|')
              .slice(1, -1)
              .map((c) => c.trim()),
          );
        }
        i += 1;
      }
      if (rows.length) {
        const [header, ...body] = rows;
        nodes.push(
          <div key={key++} className="my-4 overflow-x-auto rounded-2xl" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
            <table className="w-full text-left" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.03)' }}>
                  {header.map((h, hi) => (
                    <th key={hi} className="px-3 py-2.5 font-semibold" style={{ color: '#0B1220', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                      {inline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2.5 align-top" style={{ color: '#374151', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1) {
        nodes.push(
          <h1 key={key++} style={{ fontSize: 22, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.3px', marginTop: 8, marginBottom: 12 }}>
            {inline(text)}
          </h1>,
        );
      } else if (level === 2) {
        nodes.push(
          <h2 key={key++} style={{ fontSize: 16, fontWeight: 700, color: '#0B1220', marginTop: 28, marginBottom: 10 }}>
            {inline(text)}
          </h2>,
        );
      } else {
        nodes.push(
          <h3 key={key++} style={{ fontSize: 14, fontWeight: 700, color: '#0B1220', marginTop: 20, marginBottom: 8 }}>
            {inline(text)}
          </h3>,
        );
      }
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i += 1;
      }
      nodes.push(
        <ul key={key++} className="my-2 space-y-1.5 pl-5" style={{ listStyleType: 'disc', color: '#374151', fontSize: 13.5 }}>
          {items.map((item, ii) => (
            <li key={ii}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      nodes.push(
        <ol key={key++} className="my-2 space-y-1.5 pl-5" style={{ listStyleType: 'decimal', color: '#374151', fontSize: 13.5 }}>
          {items.map((item, ii) => (
            <li key={ii}>{inline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    nodes.push(
      <p key={key++} style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.65, marginBottom: 10 }}>
        {inline(line)}
      </p>,
    );
    i += 1;
  }

  return nodes;
}

export function AccessDocScreen({ docId }: { docId: DocId }) {
  const doc = DOCS[docId];
  const content = useMemo(() => renderMarkdown(doc.body), [doc.body]);

  return (
    <div className="px-6 py-6 w-full">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto p-6 md:p-8 rounded-[24px]"
        style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}
      >
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#0B0F1A', color: 'white' }}>
            LAIC platform
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
            {doc.icon}
            {doc.file}
          </span>
        </div>
        <article>{content}</article>
      </motion.div>
    </div>
  );
}
