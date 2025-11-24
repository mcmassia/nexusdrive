import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { NexusObject, TypeSchema } from '../types';
import RichEditor from './RichEditor';
import { Clock, Trash2 } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface DashboardProps {
  onNavigate: (obj: NexusObject) => void;
  lang: 'en' | 'es';
  objects: NexusObject[];
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate, lang, objects }) => {
  const [dailyNote, setDailyNote] = useState<NexusObject | null>(null);
  const [recentDocs, setRecentDocs] = useState<NexusObject[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [typeSchemas, setTypeSchemas] = useState<TypeSchema[]>([]);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    // Update recent docs and load type schemas
    setRecentDocs(objects.slice(0, 5));
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
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-50 dark:bg-black/10">
      {/* MAIN CONTENT AREA */}
      <div className="w-full flex flex-col overflow-hidden">
        {/* 1. TOP PANEL: RECENTS */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/50 shrink-0">
          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{lang === 'es' ? 'Recientes' : 'Recent'}</h3>
          </div>
          <div className="flex gap-4 px-8 py-4 overflow-x-auto no-scrollbar w-full">
            {recentDocs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onNavigate(doc)}
                className="shrink-0 w-48 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all p-4 flex flex-col gap-3 group relative cursor-pointer"
              >
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button
                    onClick={(e) => handleDelete(e, doc.id)}
                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
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
                  <span className="text-xs text-slate-400">{new Date(doc.lastModified).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. BOTTOM: DAILY NOTE */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {dailyNote && (
            <div className="flex-1 flex flex-col bg-white dark:bg-slate-900">
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
  );
};

export default Dashboard;