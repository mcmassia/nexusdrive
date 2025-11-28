import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { NexusObject, TypeSchema } from '../types';
import RichEditor from './RichEditor';
import { Clock, Trash2, Pin } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import EmailsPanel from './EmailsPanel';

interface DashboardProps {
  onNavigate: (obj: NexusObject) => void;
  lang: 'en' | 'es';
  objects: NexusObject[];
  onRefresh?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, lang, objects, onRefresh }) => {
  const [dailyNote, setDailyNote] = useState<NexusObject | null>(null);
  const [recentDocs, setRecentDocs] = useState<NexusObject[]>([]);
  const [pinnedDocs, setPinnedDocs] = useState<NexusObject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [typeSchemas, setTypeSchemas] = useState<TypeSchema[]>([]);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    // Update recent docs and load type schemas
    const sorted = [...objects].sort((a, b) =>
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );

    // Filter pinned docs
    const pinned = sorted.filter(doc => doc.pinned);
    setPinnedDocs(pinned);

    // Recent docs (excluding pinned ones to avoid duplication, or keep them? 
    // Usually pinned items are also recent, but let's keep them in Recents too for continuity, 
    // OR remove them to make Pinned feel special. Let's keep them in Recents for now, 
    // but maybe limit Recents to non-pinned if the user wants a clear separation. 
    // User said "appear in a section Pinned". I'll show both.)
    setRecentDocs(sorted.slice(0, 5));

    db.getAllTypeSchemas().then(schemas => setTypeSchemas(schemas));
  }, [objects]);

  const getTypeColor = (type: string): string => {
    const schema = typeSchemas.find(s => s.type === type);
    return schema?.color || '#3b82f6'; // Default blue if not found
  };

  const handleDailyNoteChange = async (html: string) => {
    if (!dailyNote) return;
    setIsSaving(true);

    // Auto-extract hashtags from html before saving
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const tags = Array.from(tempDiv.querySelectorAll('.nexus-tag')).map(el => el.textContent?.replace('#', '') || '');
    const uniqueTags = Array.from(new Set([...dailyNote.tags, ...tags.filter(t => t)]));

    const updated = { ...dailyNote, content: html, lastModified: new Date(), tags: uniqueTags };
    await db.saveObject(updated);
    setDailyNote(updated);
    setTimeout(() => setIsSaving(false), 800);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm(lang === 'es' ? '¿Eliminar documento?' : 'Delete document?')) {
      await db.deleteObject(id);
      if (onRefresh) onRefresh();
    }
  };

  const handlePin = async (e: React.MouseEvent, doc: NexusObject) => {
    e.stopPropagation();
    const updated = { ...doc, pinned: !doc.pinned };
    await db.saveObject(updated);
    if (onRefresh) onRefresh();
  };

  const renderDocCard = (doc: NexusObject) => (
    <div
      key={doc.id}
      onClick={() => onNavigate(doc)}
      className="shrink-0 w-48 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all p-4 flex flex-col gap-3 group relative cursor-pointer"
    >
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <button
          onClick={(e) => handlePin(e, doc)}
          className={`p-1 transition-opacity ${doc.pinned ? 'text-blue-500 opacity-100' : 'text-slate-300 hover:text-blue-500 opacity-0 group-hover:opacity-100'}`}
          title={doc.pinned ? (lang === 'es' ? 'Desfijar' : 'Unpin') : (lang === 'es' ? 'Fijar' : 'Pin')}
        >
          <Pin size={12} fill={doc.pinned ? "currentColor" : "none"} />
        </button>
        <button
          onClick={(e) => handleDelete(e, doc.id)}
          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
          title={lang === 'es' ? 'Eliminar' : 'Delete'}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded"
          style={{
            backgroundColor: getTypeColor(doc.type),
            color: 'white'
          }}
        >
          {doc.type}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 text-left">{doc.title}</h3>
      <div className="flex items-center gap-2 mt-auto">
        <Clock size={12} className="text-slate-400" />
        <span className="text-xs text-slate-400">
          {new Date(doc.lastModified).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', {
            dateStyle: 'short',
            timeStyle: 'short'
          })}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden bg-slate-50 dark:bg-black/10">
      {/* 2-COLUMN LAYOUT: Emails | Recent Docs + Daily Note */}
      <div className="w-full flex gap-4 p-4 overflow-hidden">

        {/* LEFT COLUMN: EMAILS PANEL */}
        <div className="flex-shrink-0 transition-all duration-300">
          <EmailsPanel lang={lang} onNavigate={onNavigate} />
        </div>

        {/* RIGHT COLUMN: RECENT DOCS + DAILY NOTE */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden min-w-0">

          {/* 1. TOP: PINNED & RECENTS */}
          <div className="shrink-0 flex flex-col gap-4">

            {/* PINNED SECTION */}
            {pinnedDocs.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Pin size={20} className="text-blue-500" />
                  {lang === 'es' ? 'Fijados' : 'Pinned'}
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  {pinnedDocs.map(renderDocCard)}
                </div>
              </div>
            )}

            {/* RECENT SECTION */}
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-100">{t.recent}</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {recentDocs.map(renderDocCard)}
              </div>
            </div>
          </div>

          {/* 2. BOTTOM: DAILY NOTE */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {dailyNote && (
              <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{dailyNote.title}</h2>
                  <span className="text-xs text-slate-400">{isSaving ? t.saving : t.synced}</span>
                </div>
                <div className="flex-1 overflow-y-auto px-6 pt-6 no-scrollbar">
                  <RichEditor
                    content={dailyNote.content}
                    onChange={handleDailyNoteChange}
                    placeholder={lang === 'es' ? 'Escribe tus pensamientos del día...' : 'Write your thoughts for the day...'}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;