import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { NexusObject, NexusTask, NexusType, TypeSchema } from '../types';
import { CheckSquare, Calendar, ArrowRight, FileText, Search, Filter, Tag, User, Briefcase } from 'lucide-react';
import { TRANSLATIONS, TYPE_CONFIG } from '../constants';

interface TasksViewProps {
    lang: 'en' | 'es';
    onNavigate: (obj: NexusObject) => void;
    availableTypes: TypeSchema[];
}

const TasksView: React.FC<TasksViewProps> = ({ lang, onNavigate, availableTypes }) => {
    const t = TRANSLATIONS[lang];
    const [tasks, setTasks] = useState<{ task: NexusTask; object: NexusObject }[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('pending');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        const objects = await db.getObjects();
        const allTasks: { task: NexusTask; object: NexusObject }[] = [];

        objects.forEach(obj => {
            if (obj.extractedTasks && obj.extractedTasks.length > 0) {
                obj.extractedTasks.forEach(task => {
                    allTasks.push({ task, object: obj });
                });
            }
        });

        // Sort by date (newest first)
        allTasks.sort((a, b) => new Date(b.task.createdAt).getTime() - new Date(a.task.createdAt).getTime());

        setTasks(allTasks);
        setLoading(false);
    };

    const filteredTasks = tasks.filter(({ task, object }) => {
        const matchesSearch =
            task.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            object.title.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus =
            statusFilter === 'all' ? true :
                statusFilter === 'pending' ? !task.completed :
                    task.completed;

        const matchesType = typeFilter === 'all' ? true : object.type === typeFilter;

        return matchesSearch && matchesStatus && matchesType;
    });

    const renderRichText = (text: string) => {
        const parts = text.split(/(\s+)/);
        return parts.map((part, i) => {
            if (part.startsWith('#')) {
                return <span key={i} className="text-blue-500 dark:text-blue-400 font-medium">{part}</span>;
            }
            if (part.startsWith('@')) {
                return <span key={i} className="text-purple-500 dark:text-purple-400 font-medium">{part}</span>;
            }
            return part;
        });
    };

    const getTypeColor = (type: string) => {
        const schema = availableTypes.find(t => t.type === type);
        if (schema && schema.color) return schema.color;
        return TYPE_CONFIG[type as NexusType]?.color || '#6b7280';
    };

    if (loading) {
        return <div className="p-8 text-center text-slate-400">Loading tasks...</div>;
    }

    const uniqueTypes = Array.from(new Set(tasks.map(t => t.object.type)));

    return (
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
            <div className="max-w-[95%] mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <CheckSquare size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                                {lang === 'es' ? 'Tareas' : 'Tasks'}
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400">
                                {filteredTasks.length} {lang === 'es' ? 'tareas encontradas' : 'tasks found'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mb-6 flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder={lang === 'es' ? 'Buscar tareas...' : 'Search tasks...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    >
                        <option value="all">{lang === 'es' ? 'Todas' : 'All'}</option>
                        <option value="pending">{lang === 'es' ? 'Pendientes' : 'Pending'}</option>
                        <option value="completed">{lang === 'es' ? 'Completadas' : 'Completed'}</option>
                    </select>

                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    >
                        <option value="all">{lang === 'es' ? 'Todos los tipos' : 'All Types'}</option>
                        {uniqueTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                {filteredTasks.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <CheckSquare size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                        <p className="text-slate-500 dark:text-slate-400">
                            {lang === 'es' ? 'No se encontraron tareas.' : 'No tasks found.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {filteredTasks.map(({ task, object }, index) => {
                            const iconName = TYPE_CONFIG[object.type as NexusType]?.icon;
                            const Icon = (iconName === 'User' ? User :
                                iconName === 'Calendar' ? Calendar :
                                    iconName === 'Briefcase' ? Briefcase :
                                        FileText);
                            const typeColor = getTypeColor(object.type);

                            return (
                                <div
                                    key={`${task.id} -${index} `}
                                    onClick={() => onNavigate(object)}
                                    className="group bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all cursor-pointer"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="mt-1">
                                            <div className={`w - 5 h - 5 border - 2 rounded flex items - center justify - center ${task.completed ? 'bg-green-500 border-green-500' : 'border-slate-300 dark:border-slate-600'} `}>
                                                {task.completed && <CheckSquare size={14} className="text-white" />}
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text - lg font - medium mb - 3 ${task.completed ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-200'} `}>
                                                {renderRichText(task.content)}
                                            </p>

                                            {/* Document Context Card */}
                                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/10 transition-colors">
                                                <div className="p-2 rounded-md bg-white dark:bg-slate-800 shadow-sm">
                                                    <Icon size={16} style={{ color: typeColor }} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span
                                                            className="text-[10px] font-bold uppercase tracking-wider"
                                                            style={{ color: typeColor }}
                                                        >
                                                            {object.type}
                                                        </span>
                                                        <span className="text-slate-300 dark:text-slate-600">•</span>
                                                        <span className="text-xs text-slate-400">
                                                            {new Date(task.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                                                        {object.title}
                                                    </p>
                                                </div>
                                                <ArrowRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TasksView;
