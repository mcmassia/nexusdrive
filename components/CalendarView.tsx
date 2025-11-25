
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { CalendarEvent } from '../services/calendarService';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Settings, FileText, CheckSquare, Square, LayoutGrid, List, Clock } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { NexusType, NexusObject } from '../types';
import CalendarConfig from './CalendarConfig';
import WeekView from './Calendar/WeekView';
import DayView from './Calendar/DayView';
import EventDetailsModal from './Calendar/EventDetailsModal';

interface CalendarViewProps {
    lang: 'en' | 'es';
    onNavigate: (obj: NexusObject) => void;
}

// Extended event type to include documents
interface ExtendedEvent extends CalendarEvent {
    isDocument?: boolean;
    nexusId?: string;
    nexusType?: NexusType;
    backgroundColor?: string;
    foregroundColor?: string;
}

type ViewMode = 'month' | 'week' | 'day';

const CalendarView: React.FC<CalendarViewProps> = ({ lang, onNavigate }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
    const [documentEvents, setDocumentEvents] = useState<ExtendedEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showConfig, setShowConfig] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<ExtendedEvent | null>(null);

    // Toggles
    const [showGoogleEvents, setShowGoogleEvents] = useState(true);
    const [showDocuments, setShowDocuments] = useState(true);

    const t = TRANSLATIONS[lang];

    useEffect(() => {
        loadData();
    }, [currentDate, viewMode]);

    const normalizeDate = (dateStr: string): string | null => {
        if (!dateStr) return null;
        try {
            // Handle 'DD/MM/YYYY' format
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    return `${parts[2]} -${parts[1].padStart(2, '0')} -${parts[0].padStart(2, '0')} `;
                }
            }
            // Try to parse as ISO string or other standard format
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
            }
        } catch (e) {
            return null;
        }
        return null;
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Determine date range based on view mode
            let start = new Date(currentDate);
            let end = new Date(currentDate);

            if (viewMode === 'month') {
                start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

                // Adjust start to Monday
                const day = start.getDay();
                const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
                start.setDate(diff);

                // Adjust end to Sunday
                const endDay = end.getDay();
                const endDiff = end.getDate() + (endDay === 0 ? 0 : 7 - endDay);
                end.setDate(endDiff);
            } else if (viewMode === 'week') {
                const day = start.getDay();
                const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
                start.setDate(diff);
                start.setHours(0, 0, 0, 0);

                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
            } else {
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
            }

            // 1. Load Google Events
            const gEvents = await db.getCalendarEvents(start, end);
            setGoogleEvents(gEvents);

            // 2. Load Documents with Dates
            const allObjects = await db.getObjects();
            const docEvents: ExtendedEvent[] = [];

            allObjects.forEach(obj => {
                // Check metadata for date
                const dateProp = obj.metadata.find(m => m.type === 'date' && m.value);
                if (dateProp && dateProp.value) {
                    // Try to parse as full ISO string first to capture time
                    let normalizedDate = null;
                    let isAllDay = true;

                    try {
                        const d = new Date(dateProp.value as string);
                        if (!isNaN(d.getTime())) {
                            normalizedDate = d;
                            // Check if the original string had time or if it was just date
                            // A simple heuristic: if it's YYYY-MM-DD length (10), it's all day.
                            // If it's longer, it likely has time.
                            isAllDay = (dateProp.value as string).length <= 10;
                        }
                    } catch (e) {
                        console.warn('Failed to parse date:', dateProp.value);
                    }

                    if (normalizedDate) {
                        // Check if date is within range
                        const d = new Date(normalizedDate);

                        if (d >= start && d <= end) {
                            docEvents.push({
                                id: `doc-${obj.id}`,
                                summary: obj.title,
                                start: {
                                    dateTime: isAllDay ? undefined : normalizedDate.toISOString(),
                                    date: isAllDay ? normalizedDate.toISOString().split('T')[0] : undefined
                                },
                                end: {
                                    dateTime: isAllDay ? undefined : new Date(normalizedDate.getTime() + 3600000).toISOString(), // Default 1h duration
                                    date: isAllDay ? normalizedDate.toISOString().split('T')[0] : undefined
                                },
                                isDocument: true,
                                nexusId: obj.id,
                                nexusType: obj.type
                            });
                        }
                    }
                }
            });
            setDocumentEvents(docEvents);

        } catch (error) {
            console.error('Failed to load calendar data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateDocument = async (event: CalendarEvent, type: NexusType | string = NexusType.NOTE) => {
        // Create new object from event
        const attendeesList = event.attendees?.map(a => `- ${a.displayName || a.email}`).join('\n') || 'No attendees';
        const isAllDay = !event.start.dateTime;
        const dateStr = isAllDay ? event.start.date : event.start.dateTime;
        const displayDate = isAllDay
            ? new Date(dateStr!).toLocaleDateString()
            : new Date(dateStr!).toLocaleString();

        let content = '';
        let tags = [];
        const finalType = type as NexusType; // Cast to NexusType for now, assuming valid input

        if (finalType === NexusType.MEETING) {
            content = `<h1>${event.summary || (lang === 'es' ? 'Reunión sin título' : 'Untitled Meeting')}</h1>
<p><strong>Date:</strong> ${displayDate}</p>
<h2>Attendees</h2>
${attendeesList}
<h2>Meeting Notes</h2>
<ul>
<li></li>
</ul>
<p><em>Created from Calendar Event</em></p>`;
            tags = ['meeting'];
        } else if (finalType === NexusType.PROJECT) {
            content = `<h1>${event.summary}</h1>
<p><strong>Deadline:</strong> ${displayDate}</p>
<h2>Overview</h2>
<p>${event.description || ''}</p>
<h2>Tasks</h2>
<ul>
<li>[ ] Initial setup</li>
</ul>`;
            tags = ['project'];
        } else {
            // Default for Note and other types
            content = `<h1>${event.summary || (lang === 'es' ? 'Sin título' : 'Untitled')}</h1>
<p><strong>Date:</strong> ${displayDate}</p>
<p>${event.description || ''}</p>`;
            tags = ['note'];
        }

        const newObject: NexusObject = {
            id: `${finalType.toLowerCase()}-${event.id || Date.now()}`,
            title: event.summary || (lang === 'es' ? 'Sin título' : 'Untitled'),
            type: finalType,
            content: content,
            lastModified: new Date(),
            tags: tags,
            metadata: [
                { key: 'date', label: 'Date', value: dateStr, type: 'date' },
                { key: 'googleEventId', label: 'Google Event ID', value: event.id, type: 'text' },
                { key: 'location', label: 'Location', value: event.description || '', type: 'text' }
            ]
        };

        await db.saveObject(newObject);
        setSelectedEvent(null); // Close modal
        onNavigate(newObject);
    };

    const navigateDate = (direction: 'next' | 'prev') => {
        const newDate = new Date(currentDate);
        if (viewMode === 'month') {
            newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        } else if (viewMode === 'week') {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        } else {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        }
        setCurrentDate(newDate);
    };

    const getDaysInMonth = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days = [];

        // Padding for previous month (Monday start)
        let dayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
        if (dayOfWeek === 0) dayOfWeek = 7; // Make Sunday 7

        // We want Monday (1) to be first. So we need (dayOfWeek - 1) padding days.
        for (let i = 0; i < dayOfWeek - 1; i++) {
            const d = new Date(year, month, 1 - (dayOfWeek - 1 - i));
            days.push({ date: d, isCurrentMonth: false });
        }

        // Current month
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const d = new Date(year, month, i);
            days.push({ date: d, isCurrentMonth: true });
        }

        // Padding for next month (to fill 6 rows = 42 cells)
        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            const d = new Date(year, month + 1, i);
            days.push({ date: d, isCurrentMonth: false });
        }

        return days;
    };

    const days = getDaysInMonth();
    const weekDays = lang === 'es'
        ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Combine and filter events
    const displayedEvents = [
        ...(showGoogleEvents ? googleEvents : []),
        ...(showDocuments ? documentEvents : [])
    ];

    const getTypeColor = (type?: NexusType) => {
        switch (type) {
            case NexusType.MEETING: return '#fbbf24'; // Amber-400
            case NexusType.PROJECT: return '#f87171'; // Red-400
            case NexusType.NOTE: return '#34d399'; // Emerald-400
            case NexusType.PERSON: return '#c084fc'; // Violet-400
            case NexusType.PAGE: return '#60a5fa'; // Blue-400
            default: return '#94a3b8'; // Slate-400
        }
    };

    const handleEventClick = (event: ExtendedEvent) => {
        if (event.isDocument && event.nexusId) {
            // Directly open document if it's a document event
            db.getObjectById(event.nexusId).then(obj => {
                if (obj) onNavigate(obj);
            });
        } else {
            // Open details modal for Google events
            setSelectedEvent(event);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden relative">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4 bg-slate-50 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 capitalize min-w-[200px]">
                            {currentDate.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'long', year: 'numeric' })}
                        </h2>
                        <div className="flex items-center bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                            <button onClick={() => navigateDate('prev')} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-l-lg text-slate-600 dark:text-slate-400">
                                <ChevronLeft size={20} />
                            </button>
                            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700"></div>
                            <button onClick={() => navigateDate('next')} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-r-lg text-slate-600 dark:text-slate-400">
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <button
                            onClick={() => setCurrentDate(new Date())}
                            className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                            {lang === 'es' ? 'Hoy' : 'Today'}
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* View Switcher */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mr-2">
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'month' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                {lang === 'es' ? 'Mes' : 'Month'}
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'week' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                {lang === 'es' ? 'Semana' : 'Week'}
                            </button>
                            <button
                                onClick={() => setViewMode('day')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'day' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                {lang === 'es' ? 'Día' : 'Day'}
                            </button>
                        </div>

                        <button
                            onClick={() => setShowConfig(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors text-sm font-medium shadow-sm"
                        >
                            <Settings size={18} />
                            <span>{lang === 'es' ? 'Configurar' : 'Configure'}</span>
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-4 text-sm">
                    <button
                        onClick={() => setShowGoogleEvents(!showGoogleEvents)}
                        className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${showGoogleEvents ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                        {showGoogleEvents ? <CheckSquare size={16} /> : <Square size={16} />}
                        <span>{lang === 'es' ? 'Eventos de Google' : 'Google Events'}</span>
                    </button>
                    <button
                        onClick={() => setShowDocuments(!showDocuments)}
                        className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${showDocuments ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                        {showDocuments ? <CheckSquare size={16} /> : <Square size={16} />}
                        <span>{lang === 'es' ? 'Documentos' : 'Documents'}</span>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {viewMode === 'month' && (
                    <div className="h-full flex flex-col">
                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                            {weekDays.map(day => (
                                <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar Grid */}
                        <div className="flex-1 grid grid-cols-7 grid-rows-6">
                            {days.map((dayObj, idx) => {
                                const dayEvents = displayedEvents.filter(e => {
                                    const eDate = new Date(e.start.dateTime || e.start.date!);
                                    return eDate.getDate() === dayObj.date.getDate() &&
                                        eDate.getMonth() === dayObj.date.getMonth() &&
                                        eDate.getFullYear() === dayObj.date.getFullYear();
                                });

                                const isToday = new Date().toDateString() === dayObj.date.toDateString();

                                return (
                                    <div
                                        key={idx}
                                        className={`min-h-[100px] border-b border-r border-slate-200 dark:border-slate-800 p-1 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!dayObj.isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-950/50 text-slate-400' : ''}`}
                                    >
                                        <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                            {dayObj.date.getDate()}
                                        </div>

                                        <div className="space-y-1 overflow-y-auto max-h-[calc(100%-2rem)]">
                                            {dayEvents.map((event) => {
                                                const isAllDay = !event.start.dateTime;

                                                if (event.isDocument) {
                                                    return (
                                                        <div
                                                            key={event.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEventClick(event);
                                                            }}
                                                            className="px-2 py-1.5 text-xs rounded cursor-pointer hover:brightness-110 transition-all bg-slate-900 text-white border border-slate-800 shadow-sm"
                                                        >
                                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                                <div
                                                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                                                    style={{ backgroundColor: getTypeColor(event.nexusType) }}
                                                                />
                                                                <span className="font-bold tracking-wider text-[9px] opacity-80 uppercase truncate">
                                                                    {event.nexusType || 'NOTE'}
                                                                </span>
                                                            </div>
                                                            <div className="font-medium truncate text-[10px] leading-tight">
                                                                {event.summary}
                                                            </div>
                                                            {!isAllDay && (
                                                                <div className="text-[9px] opacity-60 mt-0.5">
                                                                    {new Date(event.start.dateTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div
                                                        key={event.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEventClick(event);
                                                        }}
                                                        className="px-2 py-1 text-xs rounded cursor-pointer hover:brightness-95 transition-all truncate text-white"
                                                        style={{
                                                            backgroundColor: event.backgroundColor || '#3b82f6'
                                                        }}
                                                    >
                                                        <span className="font-medium text-[10px]">
                                                            {!isAllDay && new Date(event.start.dateTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' '}
                                                            {event.summary}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {viewMode === 'week' && (
                    <WeekView
                        currentDate={currentDate}
                        events={displayedEvents}
                        onNavigate={onNavigate}
                        lang={lang}
                        onEventClick={handleEventClick}
                    />
                )}

                {viewMode === 'day' && (
                    <DayView
                        currentDate={currentDate}
                        events={displayedEvents}
                        onNavigate={onNavigate}
                        lang={lang}
                        onEventClick={handleEventClick}
                    />
                )}
            </div>

            {/* Config Modal */}
            {showConfig && (
                <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <CalendarConfig
                        lang={lang}
                        onClose={() => {
                            setShowConfig(false);
                            loadData(); // Reload events after config change
                        }}
                    />
                </div>
            )}

            {/* Event Details Modal */}
            {selectedEvent && (
                <EventDetailsModal
                    event={selectedEvent}
                    onClose={() => setSelectedEvent(null)}
                    onCreateDocument={handleCreateDocument}
                    onOpenDocument={(id) => {
                        db.getObjectById(id).then(obj => {
                            if (obj) onNavigate(obj);
                        });
                    }}
                    lang={lang}
                />
            )}
        </div>
    );
};

export default CalendarView;