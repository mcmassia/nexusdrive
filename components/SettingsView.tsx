import React, { useState } from 'react';
import { Database, Mail, User, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import TypeManager from './TypeManager';
import GmailConfig from './GmailConfig';
import ImprovementsPanel from './ImprovementsPanel';
import { UserContextSettings } from './UserContextSettings';

import { NexusObject } from '../types';

interface SettingsViewProps {
    lang: 'en' | 'es';
    objects: NexusObject[];
    initialTab?: 'types' | 'gmail' | 'user' | 'improvements';
    initialImprovementFilter?: 'all' | 'pending' | 'applied' | 'rejected';
}

const SettingsView: React.FC<SettingsViewProps> = ({ lang, objects, initialTab = 'types', initialImprovementFilter }) => {
    const [activeTab, setActiveTab] = useState<'types' | 'gmail' | 'user' | 'improvements'>(initialTab);

    return (
        <div className="flex h-full bg-slate-50 dark:bg-black/10">
            {/* Sidebar */}
            <div className="w-64 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <SettingsIcon className="text-slate-600 dark:text-slate-400" size={24} />
                        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                            {lang === 'es' ? 'Ajustes' : 'Settings'}
                        </h1>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <button
                        onClick={() => setActiveTab('types')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'types'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                    >
                        <Database size={20} />
                        {lang === 'es' ? 'Tipos de Datos' : 'Data Types'}
                    </button>

                    <button
                        onClick={() => setActiveTab('gmail')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'gmail'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                    >
                        <Mail size={20} />
                        {lang === 'es' ? 'Integración Gmail' : 'Gmail Integration'}
                    </button>

                    <button
                        onClick={() => setActiveTab('user')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'user'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                    >
                        <User size={20} />
                        {lang === 'es' ? 'Usuario' : 'User'}
                    </button>

                    <button
                        onClick={() => setActiveTab('improvements')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'improvements'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                    >
                        <Sparkles size={20} className={activeTab === 'improvements' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} />
                        {lang === 'es' ? 'Mejoras' : 'Improvements'}
                    </button>
                </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'types' && <TypeManager objects={objects} />}
                {activeTab === 'gmail' && <GmailConfig lang={lang} />}
                {activeTab === 'user' && <UserContextSettings lang={lang} />}
                {activeTab === 'improvements' && <ImprovementsPanel lang={lang} initialFilter={initialImprovementFilter} />}
            </div>
        </div>
    );
};

export default SettingsView;
