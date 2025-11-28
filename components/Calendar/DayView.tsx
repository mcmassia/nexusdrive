import React, { useEffect, useRef } from 'react';
import { CalendarEvent } from '../../services/calendarService';
import { NexusObject, NexusType } from '../../types';
import { FileText, Users, Calendar, StickyNote } from 'lucide-react';

interface ExtendedEvent extends CalendarEvent {
    isDocument?: boolean;
    nexusId?: string;
    nexusType?: NexusType;
    backgroundColor?: string;
    foregroundColor?: string;
}

interface DayViewProps {
    currentDate: Date;
    events: ExtendedEvent[];
    onNavigate: (obj: NexusObject) => void;
    lang: 'en' | 'es';
    onEventClick: (event: ExtendedEvent) => void;
}

const DayView: React.FC<DayViewProps> = ({ currentDate, events, onNavigate, lang, onEventClick }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const hours = Array.from({ length: 24 }, (_, i) => i);

    useEffect(() => {
        // Scroll to 07:00 on mount
        if (scrollRef.current) {
            const hourHeight = 60;
            scrollRef.current.scrollTop = 7 * hourHeight;
        }
    }, []);

    const getEventStyle = (event: ExtendedEvent) => {
        const start = new Date(event.start.dateTime || event.start.date!);
        const end = new Date(event.end.dateTime || event.end.date!);

        // If all day, it's handled separately (simplified for now)
        if (!event.start.dateTime) return {};

        const startHour = start.getHours() + start.getMinutes() / 60;
        const endHour = end.getHours() + end.getMinutes() / 60;
        const duration = Math.max(endHour - startHour, 0.5); // Min 30 mins

        if (event.isDocument) {
            return {
                top: `${startHour * 60}px`,
                height: `${duration * 60}px`,
                backgroundColor: '#0f172a', // slate-900
                color: '#ffffff',
                border: '1px solid #1e293b', // slate-800
                borderRadius: '0.5rem',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
            };
        }

        return {
            top: `${startHour * 60}px`,
            height: `${duration * 60}px`,
            backgroundColor: event.backgroundColor || '#3b82f6',
            color: '#ffffff',
            borderRadius: '0.25rem',
        };
    };

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

    const dayEvents = events.filter(e => {
        const eDate = new Date(e.start.dateTime || e.start.date!);
        return eDate.getDate() === currentDate.getDate() &&
            eDate.getMonth() === currentDate.getMonth() &&
            eDate.getFullYear() === currentDate.getFullYear();
    });

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
                <div className="w-16 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"></div>
                <div className="flex-1 p-2 text-center bg-slate-50 dark:bg-slate-950">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                        {currentDate.toLocaleDateString(lang, { weekday: 'long' })}
                    </div>
                    <div className="text-lg font-medium text-blue-600 dark:text-blue-400">
                        {currentDate.getDate()}
                    </div>
                </div>
            </div>


            {/* All Day Row */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 min-h-[40px]">
                <div className="w-16 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-[10px] text-slate-500 text-right flex items-center justify-end">
                    {lang === 'es' ? 'Todo el día' : 'All day'}
                </div>
                <div className="flex-1 p-1 space-y-1 bg-slate-50/30 dark:bg-slate-900/30">
                    {events.filter(e => {
                        if (e.start.dateTime) return false;
                        if (!e.start.date) return false;

                        // Parse YYYY-MM-DD manually
                        const [y, m, d] = e.start.date.split('-').map(Number);
                        const eDate = new Date(y, m - 1, d);

                        return eDate.getDate() === currentDate.getDate() &&
                            eDate.getMonth() === currentDate.getMonth() &&
                            eDate.getFullYear() === currentDate.getFullYear();
                    }).map(event => (
                        <div
                            key={event.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                onEventClick(event);
                            }}
                            className={`px-2 py-1 text-xs rounded cursor-pointer hover:brightness-110 transition-all truncate border ${event.isDocument
                                ? 'bg-slate-900 text-white border-slate-800'
                                : 'text-white border-transparent'
                                }`}
                            style={!event.isDocument ? { backgroundColor: event.backgroundColor || '#3b82f6' } : {}}
                        >
                            {event.isDocument && (
                                <span
                                    className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                                    style={{ backgroundColor: getTypeColor(event.nexusType) }}
                                />
                            )}
                            <span className="font-medium">{event.summary}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto relative" ref={scrollRef}>
                <div className="flex min-h-[1440px]"> {/* 24 hours * 60px */}
                    {/* Time labels */}
                    <div className="w-16 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        {hours.map(hour => (
                            <div key={hour} className="h-[60px] text-xs text-slate-400 text-right pr-2 pt-1 relative">
                                <span className="-top-2 relative">{hour}:00</span>
                            </div>
                        ))}
                    </div>

                    {/* Day column */}
                    <div className="flex-1 relative">
                        {/* Grid lines */}
                        {hours.map(hour => (
                            <div key={hour} className="h-[60px] border-b border-slate-100 dark:border-slate-800/50"></div>
                        ))}

                        {/* Events */}
                        {events.map((event, i) => {
                            const isAllDay = !event.start.dateTime;
                            if (isAllDay) return null;

                            const start = new Date(event.start.dateTime!);
                            const end = new Date(event.end.dateTime!);
                            const style = getEventStyle(event);

                            return (
                                <div
                                    key={event.id}
                                    className={`absolute inset-x-2 p-3 text-sm overflow-hidden cursor-pointer hover:brightness-110 transition-all flex flex-col`}
                                    style={style}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEventClick(event);
                                    }}
                                >
                                    {event.isDocument ? (
                                        <>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <div
                                                    className="w-2.5 h-2.5 rounded-full"
                                                    style={{ backgroundColor: getTypeColor(event.nexusType) }}
                                                />
                                                <span className="font-bold tracking-wider text-xs opacity-80 uppercase">
                                                    {event.nexusType || 'NOTE'}
                                                </span>
                                            </div>
                                            <div className="font-bold text-base leading-tight mb-auto">
                                                {event.summary || (lang === 'es' ? '(Sin título)' : '(No title)')}
                                            </div>
                                            <div className="text-xs opacity-60 mt-1">
                                                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="font-bold flex items-center gap-2">
                                                {event.summary || (lang === 'es' ? '(Sin título)' : '(No title)')}
                                            </div>
                                            <div className="text-xs opacity-90 mt-1">
                                                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                                                {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            {event.description && (
                                                <div className="text-xs mt-2 opacity-80 line-clamp-2">
                                                    {event.description}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div >
    );
};

export default DayView;
