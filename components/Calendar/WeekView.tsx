import React, { useEffect, useRef } from 'react';
import { CalendarEvent } from '../../services/calendarService';
import { NexusObject, NexusType } from '../../types';
import { FileText, MapPin, Users, Calendar, StickyNote } from 'lucide-react';

interface ExtendedEvent extends CalendarEvent {
    isDocument?: boolean;
    nexusId?: string;
    nexusType?: NexusType;
    backgroundColor?: string;
    foregroundColor?: string;
}

interface WeekViewProps {
    currentDate: Date;
    events: ExtendedEvent[];
    onNavigate: (obj: NexusObject) => void;
    lang: 'en' | 'es';
    onEventClick: (event: ExtendedEvent) => void;
}

const WeekView: React.FC<WeekViewProps> = ({ currentDate, events, onNavigate, lang, onEventClick }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const weekDays = lang === 'es'
        ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Get start of week (Monday)
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Generate days of the week
    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        return d;
    });

    // Generate hours
    const hours = Array.from({ length: 24 }, (_, i) => i);

    useEffect(() => {
        // Scroll to 07:00 on mount
        if (scrollRef.current) {
            const hourHeight = 60;
            scrollRef.current.scrollTop = 7 * hourHeight;
        }
    }, []);

    const getEventStyle = (event: ExtendedEvent, dayStart: Date) => {
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

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
                <div className="w-16 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"></div>
                {days.map((day, i) => (
                    <div key={i} className="flex-1 p-2 text-center border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{weekDays[i]}</div>
                        <div className={`text-lg font-medium ${day.toDateString() === new Date().toDateString()
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-700 dark:text-slate-200'
                            }`}>
                            {day.getDate()}
                        </div>
                    </div>
                ))}
            </div>


            {/* All Day Row */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 min-h-[40px]">
                <div className="w-16 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-[10px] text-slate-500 text-right flex items-center justify-end">
                    {lang === 'es' ? 'Todo el día' : 'All day'}
                </div>
                {days.map((day, i) => {
                    const dayEvents = events.filter(e => {
                        let start: Date;
                        let end: Date;

                        if (e.start.dateTime) {
                            // Timed event: only show if it starts on this day
                            start = new Date(e.start.dateTime);
                            return start.getDate() === day.getDate() &&
                                start.getMonth() === day.getMonth() &&
                                start.getFullYear() === day.getFullYear();
                        } else if (e.start.date) {
                            // All-day event: show if day is within [start, end)
                            const [y, m, d] = e.start.date.split('-').map(Number);
                            start = new Date(y, m - 1, d);

                            if (e.end.date) {
                                const [ey, em, ed] = e.end.date.split('-').map(Number);
                                end = new Date(ey, em - 1, ed);
                            } else {
                                // Fallback if no end date (shouldn't happen for Google events)
                                end = new Date(start);
                                end.setDate(end.getDate() + 1);
                            }

                            // Check overlap: day >= start && day < end
                            // Normalize day to 00:00:00
                            const currentDay = new Date(day);
                            currentDay.setHours(0, 0, 0, 0);

                            return currentDay >= start && currentDay < end;
                        }
                        return false;
                    });

                    const allDayEvents = dayEvents.filter(e => !e.start.dateTime).sort((a, b) => {
                        // Sort by:
                        // 1. Start Date (earlier first)
                        // 2. Duration (longer first)
                        // 3. Title (alphabetical)

                        const startA = new Date(a.start.date!).getTime();
                        const startB = new Date(b.start.date!).getTime();
                        if (startA !== startB) return startA - startB;

                        const endA = a.end.date ? new Date(a.end.date).getTime() : startA + 86400000;
                        const endB = b.end.date ? new Date(b.end.date).getTime() : startB + 86400000;
                        const durA = endA - startA;
                        const durB = endB - startB;
                        if (durA !== durB) return durB - durA; // Longer first

                        return (a.summary || '').localeCompare(b.summary || '');
                    });

                    return (
                        <div key={i} className="flex-1 border-r border-slate-200 dark:border-slate-800 p-1 space-y-1 bg-slate-50/30 dark:bg-slate-900/30">
                            {allDayEvents.map(event => (
                                <div
                                    key={event.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEventClick(event);
                                    }}
                                    className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer hover:brightness-110 transition-all truncate border ${event.isDocument
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
                    );
                })}
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

                    {/* Days columns */}
                    {days.map((day, i) => {
                        const dayEvents = events.filter(e => {
                            let eDate: Date;
                            if (e.start.dateTime) {
                                eDate = new Date(e.start.dateTime);
                            } else if (e.start.date) {
                                const [y, m, d] = e.start.date.split('-').map(Number);
                                eDate = new Date(y, m - 1, d);
                            } else {
                                return false;
                            }

                            return eDate.getDate() === day.getDate() &&
                                eDate.getMonth() === day.getMonth() &&
                                eDate.getFullYear() === day.getFullYear();
                        });

                        return (
                            <div key={i} className="flex-1 border-r border-slate-200 dark:border-slate-800 relative">
                                {/* Grid lines */}
                                {hours.map(hour => (
                                    <div key={hour} className="h-[60px] border-b border-slate-100 dark:border-slate-800/50"></div>
                                ))}

                                {/* Events */}
                                {dayEvents.map((event, idx) => {
                                    const isAllDay = !event.start.dateTime;
                                    if (isAllDay) return null; // Skip all-day events in time grid

                                    const start = new Date(event.start.dateTime!);
                                    const end = new Date(event.end.dateTime!);
                                    const style = getEventStyle(event, day);

                                    return (
                                        <div
                                            key={event.id}
                                            className={`absolute inset-x-1 p-2 text-xs overflow-hidden cursor-pointer hover:brightness-110 transition-all flex flex-col`}
                                            style={style}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEventClick(event);
                                            }}
                                            title={event.summary}
                                        >
                                            {event.isDocument ? (
                                                <>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <div
                                                            className="w-2 h-2 rounded-full"
                                                            style={{ backgroundColor: getTypeColor(event.nexusType) }}
                                                        />
                                                        <span className="font-bold tracking-wider text-[9px] opacity-80 uppercase">
                                                            {event.nexusType || 'NOTE'}
                                                        </span>
                                                    </div>
                                                    <div className="font-semibold text-sm leading-tight mb-auto">
                                                        {event.summary || (lang === 'es' ? '(Sin título)' : '(No title)')}
                                                    </div>
                                                    <div className="text-[10px] opacity-60 mt-1">
                                                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="font-medium truncate">
                                                        {event.summary || (lang === 'es' ? '(Sin título)' : '(No title)')}
                                                    </div>
                                                    <div className="text-[10px] opacity-90">
                                                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div >
    );
};

export default WeekView;
