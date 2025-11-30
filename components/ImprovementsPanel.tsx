import React, { useState, useEffect } from 'react';
import { useSettings } from './SettingsContext';
import {
    Sparkles, Zap, Moon, Mic, Layout, Timer, BookOpen, Database, FileText, Palette, Link, ListTree, PieChart, Mail, WifiOff, Command, PlusCircle, MonitorPlay, MessageSquare, Smile, CheckCircle, XCircle, ArrowRight, Brain, Globe, Code, PenTool, History, Users, Volume2, Eye, Activity, Target, Calendar as CalendarIcon, MessageCircle, GitBranch, FileDigit, Image, Speaker, Book, Music, BarChart, Flag, Sun, Cloud, TrendingUp, Rss
} from 'lucide-react';

interface Improvement {
    id: string;
    title: string;
    description: string;
    icon: React.ElementType;
    category: 'AI' | 'Productivity' | 'Visual' | 'Integration';
}

const ALL_IMPROVEMENTS: Improvement[] = [
    // Original 20
    { id: 'smart_tags', title: 'Smart Tags', description: 'AI automatically suggests tags for your documents based on content analysis.', icon: Zap, category: 'AI' },
    { id: 'focus_mode', title: 'Focus Mode', description: 'Hide all sidebars and distractions to focus purely on your content.', icon: Layout, category: 'Visual' },
    { id: 'daily_digest', title: 'Daily Digest', description: 'Receive a morning email summary of your daily tasks and upcoming events.', icon: Mail, category: 'Productivity' },
    { id: 'voice_memos', title: 'Voice Memos', description: 'Record audio notes directly in documents and get automatic transcriptions.', icon: Mic, category: 'Productivity' },
    { id: 'graph_3d', title: 'Graph 3D View', description: 'Visualize your knowledge graph in an immersive 3D environment.', icon: Database, category: 'Visual' },
    { id: 'pomodoro', title: 'Pomodoro Timer', description: 'Built-in focus timer to boost your productivity with work/break intervals.', icon: Timer, category: 'Productivity' },
    { id: 'readwise_sync', title: 'Readwise Sync', description: 'Automatically sync your highlights from Kindle, Pocket, and more via Readwise.', icon: BookOpen, category: 'Integration' },
    { id: 'notion_import', title: 'Notion Import', description: 'Seamlessly import your pages and databases from Notion.', icon: FileText, category: 'Integration' },
    { id: 'markdown_export', title: 'Markdown Export', description: 'Export your entire knowledge base as standard Markdown files.', icon: FileText, category: 'Integration' },
    { id: 'custom_themes', title: 'Custom Themes', description: 'Create and save your own color themes to personalize NexusDrive.', icon: Palette, category: 'Visual' },
    { id: 'bi_linking', title: 'Bi-directional Linking', description: 'Auto-detect potential links between documents as you type.', icon: Link, category: 'AI' },
    { id: 'task_deps', title: 'Task Dependencies', description: 'Link tasks that depend on others and visualize the critical path.', icon: ListTree, category: 'Productivity' },
    { id: 'cal_analytics', title: 'Calendar Analytics', description: 'Visualize time spent on different categories and projects.', icon: PieChart, category: 'Productivity' },
    { id: 'email_templates', title: 'Email Templates', description: 'Save and reuse common email responses to save time.', icon: Mail, category: 'Productivity' },
    { id: 'offline_mode', title: 'Offline Mode', description: 'Full offline support. Work anywhere, sync when you are back online.', icon: WifiOff, category: 'Productivity' },
    { id: 'kbd_shortcuts', title: 'Keyboard Shortcuts', description: 'Customize keybindings for every action in the application.', icon: Command, category: 'Productivity' },
    { id: 'quick_capture', title: 'Quick Capture', description: 'Global hotkey to add a note from anywhere in the OS.', icon: PlusCircle, category: 'Productivity' },
    { id: 'presentation_mode', title: 'Presentation Mode', description: 'Turn any document into a beautiful slide deck instantly.', icon: MonitorPlay, category: 'Visual' },
    { id: 'chat_data', title: 'Chat with Data', description: 'Ask AI questions about your documents and get answers with citations.', icon: MessageSquare, category: 'AI' },
    { id: 'mood_tracker', title: 'Mood Tracker', description: 'Track your daily mood and correlate it with your productivity metrics.', icon: Smile, category: 'Productivity' },

    // New 30
    { id: 'auto_summarize', title: 'Auto Summarize', description: 'AI automatically generates concise summaries for long documents.', icon: Brain, category: 'AI' },
    { id: 'sentiment_analysis', title: 'Sentiment Analysis', description: 'Analyze the tone and sentiment of your emails and documents.', icon: Activity, category: 'AI' },
    { id: 'lang_translation', title: 'Real-time Translation', description: 'Instantly translate documents and emails into over 50 languages.', icon: Globe, category: 'AI' },
    { id: 'code_highlight', title: 'Code Highlighting', description: 'Enhanced syntax highlighting for over 100 programming languages.', icon: Code, category: 'Visual' },
    { id: 'zen_writing', title: 'Zen Writing', description: 'Typewriter mode that keeps your cursor in the center of the screen.', icon: PenTool, category: 'Visual' },
    { id: 'version_history', title: 'Visual Version History', description: 'See a visual timeline of changes and diffs for every document.', icon: History, category: 'Productivity' },
    { id: 'collab_cursors', title: 'Collaborative Cursors', description: 'See real-time cursors of other users editing the same document.', icon: Users, category: 'Integration' },
    { id: 'voice_commands', title: 'Voice Commands', description: 'Control the entire application using natural voice commands.', icon: Volume2, category: 'Productivity' },
    { id: 'dark_mode_oled', title: 'OLED Dark Mode', description: 'True black theme optimized for OLED screens to save battery.', icon: Moon, category: 'Visual' },
    { id: 'dyslexia_font', title: 'Dyslexia Support', description: 'Enable OpenDyslexic font to improve readability for dyslexic users.', icon: Eye, category: 'Visual' },
    { id: 'mind_map', title: 'Auto Mind Map', description: 'Automatically generate mind maps from your document structure.', icon: GitBranch, category: 'Visual' },
    { id: 'kanban_board', title: 'Kanban Board', description: 'Turn any task list into a fully functional Kanban board.', icon: Layout, category: 'Productivity' },
    { id: 'gantt_chart', title: 'Gantt Chart', description: 'Visualize your projects and tasks on a timeline view.', icon: Activity, category: 'Productivity' },
    { id: 'calendar_sync_outlook', title: 'Outlook Sync', description: 'Two-way synchronization with Microsoft Outlook Calendar.', icon: CalendarIcon, category: 'Integration' },
    { id: 'slack_integration', title: 'Slack Integration', description: 'Send documents and tasks directly to Slack channels.', icon: MessageCircle, category: 'Integration' },
    { id: 'jira_integration', title: 'Jira Integration', description: 'Create Jira issues directly from NexusDrive tasks.', icon: Target, category: 'Integration' },
    { id: 'github_sync', title: 'GitHub Sync', description: 'Sync code snippets and documentation with GitHub repositories.', icon: Code, category: 'Integration' },
    { id: 'pdf_annotation', title: 'PDF Annotation', description: 'Draw, highlight, and add notes directly onto PDF files.', icon: FileDigit, category: 'Productivity' },
    { id: 'ocr_text', title: 'OCR Extraction', description: 'Extract editable text from images and scanned documents.', icon: Image, category: 'AI' },
    { id: 'text_to_speech', title: 'Text to Speech', description: 'Have your documents read aloud to you with natural voices.', icon: Speaker, category: 'Productivity' },
    { id: 'speed_reading', title: 'Speed Reading', description: 'RSVP reader to help you read documents up to 3x faster.', icon: Book, category: 'Productivity' },
    { id: 'focus_sounds', title: 'Focus Sounds', description: 'Play ambient background noise to help you concentrate.', icon: Music, category: 'Productivity' },
    { id: 'pomodoro_analytics', title: 'Deep Work Stats', description: 'Detailed analytics on your focus sessions and productivity.', icon: BarChart, category: 'Productivity' },
    { id: 'goal_tracking', title: 'Goal Tracking', description: 'Set and track OKRs and personal goals within the app.', icon: Flag, category: 'Productivity' },
    { id: 'habit_tracker', title: 'Habit Tracker', description: 'Track daily habits and build streaks directly in your dashboard.', icon: CheckCircle, category: 'Productivity' },
    { id: 'journaling_prompts', title: 'Journaling Prompts', description: 'Get daily writing prompts to inspire your journaling habit.', icon: PenTool, category: 'Productivity' },
    { id: 'quote_day', title: 'Quote of the Day', description: 'Start your day with an inspirational quote on your dashboard.', icon: Sun, category: 'Visual' },
    { id: 'weather_widget', title: 'Weather Widget', description: 'See the daily forecast directly in your daily note.', icon: Cloud, category: 'Integration' },
    { id: 'stock_ticker', title: 'Stock Ticker', description: 'Track your favorite stocks and crypto in real-time.', icon: TrendingUp, category: 'Integration' },
    { id: 'news_feed', title: 'Tech News Feed', description: 'Curated feed of the latest technology news relevant to you.', icon: Rss, category: 'Integration' },
];

interface ImprovementsPanelProps {
    lang: 'en' | 'es';
}

const ImprovementsPanel: React.FC<ImprovementsPanelProps> = ({ lang }) => {
    const { prefs, isFeatureEnabled, applyFeature, rejectFeature } = useSettings();
    const [filter, setFilter] = useState<'all' | 'pending' | 'applied' | 'rejected'>('all');
    const [simulatingId, setSimulatingId] = useState<string | null>(null);

    // We maintain a local state of "visible" improvements to ensure we always show 20
    const [visibleImprovements, setVisibleImprovements] = useState<Improvement[]>([]);

    useEffect(() => {
        // Initialize visible improvements
        // We want to show:
        // 1. All applied/rejected improvements (so they appear in their respective tabs)
        // 2. Enough pending improvements to fill the grid up to 20 (or more if we have many applied/rejected)

        // Actually, the requirement is "when one is rejected or applied, another new one appears".
        // This implies a "Deck" of pending cards.

        const handledIds = new Set([...prefs.appliedImprovements, ...prefs.rejectedImprovements]);

        // Get all handled improvements
        const handled = ALL_IMPROVEMENTS.filter(i => handledIds.has(i.id));

        // Get pending improvements
        const pending = ALL_IMPROVEMENTS.filter(i => !handledIds.has(i.id));

        // We want to show all handled + first 20 pending
        // But wait, if we filter by "Pending", we want to see 20.
        // If we filter by "All", we want to see handled + 20 pending.

        // Let's just take the first 20 pending items to be "Active Pending"
        const activePending = pending.slice(0, 20);

        setVisibleImprovements([...handled, ...activePending]);

    }, [prefs.appliedImprovements.length, prefs.rejectedImprovements.length]); // Re-calc when counts change

    const handleDecision = async (id: string, accepted: boolean) => {
        if (accepted) {
            setSimulatingId(id);
            // Simulate AI implementation delay
            setTimeout(async () => {
                await applyFeature(id);
                setSimulatingId(null);
            }, 2000);
        } else {
            await rejectFeature(id);
        }
    };

    const getStatus = (id: string): 'pending' | 'applied' | 'rejected' => {
        if (prefs.appliedImprovements.includes(id)) return 'applied';
        if (prefs.rejectedImprovements.includes(id)) return 'rejected';
        return 'pending';
    };

    const filteredImprovements = visibleImprovements.filter(imp => {
        const status = getStatus(imp.id);
        if (filter === 'all') return true;
        return status === filter;
    });

    // Sort: Pending first, then Applied, then Rejected (for 'all' view)
    const sortedImprovements = [...filteredImprovements].sort((a, b) => {
        const statusA = getStatus(a.id);
        const statusB = getStatus(b.id);
        const score = (s: string) => s === 'pending' ? 0 : s === 'applied' ? 1 : 2;
        return score(statusA) - score(statusB);
    });

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                    {lang === 'es' ? 'Mejoras Disponibles' : 'Available Improvements'}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                    {lang === 'es'
                        ? 'Descubre y activa nuevas funciones para potenciar tu experiencia.'
                        : 'Discover and activate new features to supercharge your experience.'}
                </p>

                {/* Filters */}
                <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-1">
                    {(['all', 'pending', 'applied', 'rejected'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative top-[1px] ${filter === f
                                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-slate-50 dark:bg-slate-800/50'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                            <span className="ml-2 text-xs opacity-60 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                                {f === 'all'
                                    ? visibleImprovements.length
                                    : visibleImprovements.filter(i => getStatus(i.id) === f).length}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedImprovements.map(imp => {
                    const status = getStatus(imp.id);
                    const isSimulating = simulatingId === imp.id;

                    return (
                        <div
                            key={imp.id}
                            className={`bg-white dark:bg-slate-900 rounded-xl border transition-all duration-200 flex flex-col relative overflow-hidden ${status === 'applied'
                                    ? 'border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]'
                                    : status === 'rejected'
                                        ? 'border-slate-200 dark:border-slate-800 opacity-75 grayscale-[0.5]'
                                        : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg'
                                }`}
                        >
                            {isSimulating && (
                                <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 z-10 flex flex-col items-center justify-center text-center p-6 backdrop-blur-sm">
                                    <div className="relative mb-4">
                                        <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
                                        <Sparkles size={48} className="text-blue-600 animate-pulse relative z-10" />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
                                        {lang === 'es' ? 'Implementando...' : 'Implementing...'}
                                    </h4>
                                    <p className="text-sm text-slate-500">
                                        {lang === 'es' ? 'La IA está escribiendo el código...' : 'AI is writing the code...'}
                                    </p>
                                </div>
                            )}

                            <div className={`h-1.5 w-full rounded-t-xl bg-gradient-to-r ${imp.category === 'AI' ? 'from-purple-500 to-pink-500' :
                                    imp.category === 'Productivity' ? 'from-blue-500 to-cyan-500' :
                                        imp.category === 'Visual' ? 'from-amber-500 to-orange-500' :
                                            'from-emerald-500 to-teal-500'
                                }`} />

                            <div className="p-5 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                        <imp.icon size={24} className="text-slate-700 dark:text-slate-200" />
                                    </div>
                                    {status === 'applied' && (
                                        <span className="text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                                            <CheckCircle size={12} /> ACTIVE
                                        </span>
                                    )}
                                    {status === 'rejected' && (
                                        <span className="text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                                            <XCircle size={12} /> REJECTED
                                        </span>
                                    )}
                                </div>

                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
                                    {imp.title}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 flex-1">
                                    {imp.description}
                                </p>

                                {status === 'pending' ? (
                                    <div className="flex gap-2 mt-auto">
                                        <button
                                            onClick={() => handleDecision(imp.id, false)}
                                            className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            {lang === 'es' ? 'Rechazar' : 'Reject'}
                                        </button>
                                        <button
                                            onClick={() => handleDecision(imp.id, true)}
                                            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                                        >
                                            {lang === 'es' ? 'Aplicar' : 'Apply'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800/50 flex justify-end">
                                        <button
                                            onClick={() => status === 'applied' ? rejectFeature(imp.id) : applyFeature(imp.id)}
                                            className="text-xs text-slate-400 hover:text-blue-500 underline decoration-dotted"
                                        >
                                            {status === 'applied'
                                                ? (lang === 'es' ? 'Desactivar' : 'Deactivate')
                                                : (lang === 'es' ? 'Reconsiderar' : 'Reconsider')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredImprovements.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                    <Sparkles size={48} className="mx-auto mb-4 opacity-20" />
                    <p>{lang === 'es' ? 'No hay mejoras en esta categoría.' : 'No improvements found in this category.'}</p>
                </div>
            )}
        </div>
    );
};

export default ImprovementsPanel;
