import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { NexusObject, NexusTask } from '../types';
import { CheckSquare, Calendar, ArrowRight, FileText } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface TasksViewProps {
    lang: 'en' | 'es';
    onNavigate: (obj: NexusObject) => void;
}

const TasksView: React.FC<TasksViewProps> = ({ lang, onNavigate }) => {
    const t = TRANSLATIONS[lang];
    const [tasks, setTasks] = useState<{ task: NexusTask; object: NexusObject }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadTasks = async () => {
            const objects = await db.getObjects();
            const allTasks: { task: NexusTask; object: NexusObject }[] = [];

            objects.forEach(obj => {
                if (obj.extractedTasks && obj.extractedTasks.length > 0) {
                    obj.extractedTasks.forEach(task => {
                        if (!task.completed) {
                            allTasks.push({ task, object: obj });
                        }
                    });
                }
            });

            // Sort by date (newest first)
            allTasks.sort((a, b) => new Date(b.task.createdAt).getTime() - new Date(a.task.createdAt).getTime());

            setTasks(allTasks);
            setLoading(false);
        };

        loadTasks();
    }, []);

    if (loading) {
        return <div className="p-8 text-center text-slate-400">Loading tasks...</div>;
    }

    return (
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                        <CheckSquare size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                            {lang === 'es' ? 'Tareas Pendientes' : 'Pending Tasks'}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400">
                            {tasks.length} {lang === 'es' ? 'tareas encontradas en tus documentos' : 'tasks found in your documents'}
                        </p>
                    </div>
                </div>

                {tasks.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <CheckSquare size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                        <p className="text-slate-500 dark:text-slate-400">
                            {lang === 'es' ? 'No hay tareas pendientes. ¡Buen trabajo!' : 'No pending tasks. Great job!'}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {tasks.map(({ task, object }, index) => (
                            <div
                                key={`${task.id}-${index}`}
                                onClick={() => onNavigate(object)}
                                className="group bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all cursor-pointer"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="mt-1">
                                        <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 rounded flex items-center justify-center">
                                            {/* Empty box since it's pending */}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-slate-800 dark:text-slate-200 font-medium mb-2 line-clamp-2">
                                            {task.content}
                                        </p>
                                        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                                            <div className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                                <FileText size={14} />
                                                <span className="truncate max-w-[200px]">{object.title}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Calendar size={14} />
                                                <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 dark:text-blue-400">
                                        <ArrowRight size={20} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TasksView;
