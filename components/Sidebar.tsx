import React, { useState, useEffect } from 'react';
import {
  Search, Plus, FileText, Settings, ChevronLeft, ChevronRight,
  LayoutGrid, Users, Calendar, Briefcase, Hash, Globe, CheckSquare, Database, Cloud, Moon, Sun, Home, Network, Tag
} from 'lucide-react';
import { NexusType, NexusObject } from '../types';
import { db } from '../services/db';
import { TYPE_CONFIG, TRANSLATIONS } from '../constants';

interface SidebarProps {
  onViewChange: (view: 'dashboard' | 'graph' | 'documents' | 'calendar' | 'list' | 'settings' | 'tags') => void;
  onTypeFilter: (type: NexusType | null) => void;
  onObjectSelect: (obj: NexusObject) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  lang: 'en' | 'es';
  setLang: (lang: 'en' | 'es') => void;
  objects: NexusObject[];
  availableTypes: TypeSchema[];
}

import { TypeSchema } from '../types';

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, onTypeFilter, onObjectSelect, isDarkMode, toggleTheme, lang, setLang, objects, availableTypes }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const t = TRANSLATIONS[lang];

  const navItemClass = (view: string) => `
    flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left
    ${currentView === view
      ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}
    ${isCollapsed ? 'justify-center' : ''}
  `;

  // Helper to get count by type
  const getCount = (type: NexusType) => objects.filter(o => o.type === type).length;

  return (
    <div
      className={`${isCollapsed ? 'w-20' : 'w-72'} bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shrink-0 transition-all duration-300 relative`}
    >
      <div className={`p-6 ${isCollapsed ? 'px-4' : ''}`}>
        <div className={`flex items-center gap-2 ${isCollapsed ? 'justify-center' : ''}`}>
          <Database className="text-blue-600 shrink-0" size={24} />
          {!isCollapsed && <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap overflow-hidden">NexusDrive</h1>}
        </div>
        {!isCollapsed && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider whitespace-nowrap">Local-First OOKM</p>}
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {/* 1. INICIO */}
        <button onClick={() => { onViewChange('dashboard'); onTypeFilter(null); onObjectSelect(null); }} className={navItemClass('dashboard')} title={t.home}>
          <Home size={18} className="shrink-0" /> {!isCollapsed && <span>{t.home}</span>}
        </button>

        {/* 2. TAREAS */}
        <button onClick={() => { onViewChange('tasks'); onTypeFilter(null); onObjectSelect(null); }} className={navItemClass('tasks')} title={lang === 'es' ? 'Tareas' : 'Tasks'}>
          <CheckSquare size={18} className="shrink-0" /> {!isCollapsed && <span>{lang === 'es' ? 'Tareas' : 'Tasks'}</span>}
        </button>

        {/* 3. DOCUMENTOS */}
        <button onClick={() => { onViewChange('documents'); onTypeFilter(null); onObjectSelect(null); }} className={navItemClass('documents')} title={lang === 'es' ? 'Documentos' : 'Documents'}>
          <FileText size={18} className="shrink-0" />
          {!isCollapsed && (
            <div className="flex items-center justify-between w-full">
              <span>{lang === 'es' ? 'Documentos' : 'Documents'}</span>
              <span className="text-xs bg-slate-200 dark:bg-slate-800 px-1.5 rounded-full text-slate-500">{objects.length}</span>
            </div>
          )}
        </button>

        {/* 4. CALENDARIO */}
        <button onClick={() => { onViewChange('calendar'); onTypeFilter(null); onObjectSelect(null); }} className={navItemClass('calendar')} title={t.calendar}>
          <Calendar size={18} className="shrink-0" /> {!isCollapsed && <span>{t.calendar}</span>}
        </button>

        {/* 5. ETIQUETAS */}
        <button onClick={() => { onViewChange('tags'); onObjectSelect(null); }} className={navItemClass('tags')} title={lang === 'es' ? 'Etiquetas' : 'Tags'}>
          <Tag size={18} className="shrink-0" /> {!isCollapsed && <span>{lang === 'es' ? 'Etiquetas' : 'Tags'}</span>}
        </button>

        {/* 6. GRAFO */}
        <button onClick={() => { onViewChange('graph'); onTypeFilter(null); onObjectSelect(null); }} className={navItemClass('graph')} title={t.graph}>
          <Network size={18} className="shrink-0" /> {!isCollapsed && <span>{t.graph}</span>}
        </button>

        {/* Divider */}
        <div className="my-2 border-t border-slate-200 dark:border-slate-700" />

        {/* TIPOS DINÁMICOS */}
        <div className={`pt-2 pb-2 px-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider ${isCollapsed ? 'text-center' : ''}`}>
          {isCollapsed ? '📁' : t.types}
        </div>

        {availableTypes.map(schema => {
          const type = schema.type as NexusType;
          const count = objects.filter(o => o.type === type).length;
          const iconName = TYPE_CONFIG[type]?.icon;
          const Icon = (iconName === 'User' ? Users :
            iconName === 'Calendar' ? Calendar :
              iconName === 'Briefcase' ? Briefcase :
                FileText);

          return (
            <button
              key={type}
              onClick={() => { onViewChange('list'); onTypeFilter(type); onObjectSelect(null); }}
              className={navItemClass(type.toLowerCase())}
              title={type}
            >
              <Icon size={18} className="shrink-0" style={{ color: schema.color }} />
              {!isCollapsed && (
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">{type}</span>
                  <span className="text-xs bg-slate-200 dark:bg-slate-800 px-1.5 rounded-full text-slate-500">{count}</span>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* FOOTER: Preferencias */}
      <div className="mt-auto border-t border-slate-200 dark:border-slate-700 p-3 space-y-2">
        {!isCollapsed && (
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{lang === 'es' ? 'Preferencias' : 'Preferences'}</span>
          </div>
        )}
        <div className={`flex items-center gap-2 text-xs text-green-600 dark:text-green-400 mb-2 bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-100 dark:border-green-900/50 ${isCollapsed ? 'justify-center' : ''}`}>
          <Cloud size={12} className="shrink-0" />
          {!isCollapsed && <span>{t.syncActive}</span>}
        </div>

        <button
          onClick={toggleTheme}
          className={`flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 w-full p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
          title="Toggle Theme"
        >
          {isDarkMode ? <Sun size={16} className="shrink-0" /> : <Moon size={16} className="shrink-0" />}
          {!isCollapsed && (isDarkMode ? t.lightMode : t.darkMode)}
        </button>

        <button
          onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
          className={`flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 w-full p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
          title="Change Language"
        >
          <Globe size={16} className="shrink-0" />
          {!isCollapsed && (lang === 'en' ? 'Español' : 'English')}
        </button>

        <button
          onClick={() => { onViewChange('settings'); onObjectSelect(null); }}
          className={`flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 w-full p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
          title={lang === 'es' ? 'Tipos de objeto' : 'Object Types'}
        >
          <Settings size={16} className="shrink-0" />
          {!isCollapsed && <span>{lang === 'es' ? 'Tipos de objeto' : 'Object Types'}</span>}
        </button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1 text-slate-400 hover:text-blue-600 shadow-sm z-10"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  );
};

export default Sidebar;