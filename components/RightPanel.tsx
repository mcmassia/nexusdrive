import React, { useState, useEffect } from 'react';
import { NexusObject, TypeSchema } from '../types';
import { db } from '../services/db';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface RightPanelProps {
    objects: NexusObject[];
    lang: 'en' | 'es';
    onNavigate: (obj: NexusObject) => void;
}

const RightPanel: React.FC<RightPanelProps> = ({ objects, lang, onNavigate }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [viewDate, setViewDate] = useState(new Date());
    // Initialize with local date instead of UTC
    const today = new Date();
    const initialDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const [selectedDate, setSelectedDate] = useState(initialDate);
    const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
    const [dailyObjects, setDailyObjects] = useState<NexusObject[]>([]);
    const [typeSchemas, setTypeSchemas] = useState<TypeSchema[]>([]);

    const t = TRANSLATIONS[lang];

    useEffect(() => {
        // Update active dates and load type schemas
        db.getActiveDates().then(dates => setActiveDates(new Set(dates)));
        db.getAllTypeSchemas().then(schemas => setTypeSchemas(schemas));
    }, [objects]);

    const getTypeColor = (type: string): string => {
        const schema = typeSchemas.find(s => s.type === type);
        return schema?.color || '#3b82f6'; // Default blue if not found
    };

    useEffect(() => {
        // Update daily objects when selected date changes or objects change
        const dateStr = selectedDate;
        const matches = objects.filter(obj => {
            // Check metadata dates ONLY
            return obj.metadata?.some(m => {
                if (m.type === 'date' && m.value) {
                    // Normalize date
                    let normalized = m.value as string;
                    if (normalized.includes('/')) {
                        const parts = normalized.split('/');
                        if (parts.length === 3) {
                            normalized = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        }
                    } else {
                        const d = new Date(normalized);
                        if (!isNaN(d.getTime())) {
                            normalized = d.toISOString().split('T')[0];
                        }
                    }
                    return normalized === dateStr;
                }
                return false;
            });
        });
        setDailyObjects(matches);
    }, [selectedDate, objects]);

    const getCalendarDays = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        let firstDay = new Date(year, month, 1).getDay();
        firstDay = firstDay === 0 ? 6 : firstDay - 1;

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };

    const changeMonth = (delta: number) => {
        const newDate = new Date(viewDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setViewDate(newDate);
    };

    return (
        <div className="relative flex shrink-0 h-full">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`absolute top-1/2 -translate-y-1/2 -left-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1 text-slate-400 hover:text-blue-600 shadow-sm z-20 transition-transform duration-300 ${isOpen ? '' : 'rotate-180'}`}
            >
                <ChevronRight size={14} />
            </button>

            <div className={`${isOpen ? 'w-80' : 'w-0'} transition-all duration-300 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden`}>
                <div className="p-4 h-full overflow-y-auto no-scrollbar">
                    <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-slate-200 font-semibold">
                        <Calendar size={18} />
                        <span>{t.calendar}</span>
                    </div>

                    {/* Calendar Widget */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 shadow-sm mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><ChevronLeft size={14} className="text-slate-400" /></button>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 capitalize">
                                {viewDate.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"><ChevronRight size={14} className="text-slate-400" /></button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                            {(lang === 'en' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['L', 'M', 'X', 'J', 'V', 'S', 'D']).map((d, idx) => <div key={`day-${idx}`} className="text-[10px] text-slate-400 font-bold">{d}</div>)}
                            {getCalendarDays().map((date, i) => {
                                if (!date) return <div key={i} />;
                                // Use local date formatting to avoid UTC offset issues
                                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                                const isActive = activeDates.has(dateStr);
                                const isSelected = selectedDate === dateStr;
                                // Today's date in local timezone
                                const today = new Date();
                                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                const isToday = dateStr === todayStr;

                                return (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedDate(dateStr)}
                                        className={`
                                        h-6 w-6 text-[10px] rounded-full flex items-center justify-center mx-auto relative transition-colors
                                        ${isSelected ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}
                                        ${isToday && !isSelected ? 'text-blue-600 font-bold' : ''}
                                    `}
                                    >
                                        {date.getDate()}
                                        {isActive && !isSelected && (
                                            <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-blue-400"></div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Daily Events */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                            {t.eventsFor} {new Date(selectedDate + 'T00:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric' })}
                        </h3>
                        <div className="space-y-2">
                            {dailyObjects.length > 0 ? (
                                dailyObjects.map(obj => (
                                    <button
                                        key={obj.id}
                                        onClick={() => onNavigate(obj)}
                                        className="w-full text-left p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-blue-400 dark:hover:border-blue-600 transition-all group"
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getTypeColor(obj.type) }}></span>
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{obj.type}</span>
                                        </div>
                                        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
                                            {obj.title}
                                        </h4>
                                    </button>
                                ))
                            ) : (
                                <div className="text-xs text-slate-400 italic text-center py-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                                    {t.emptyCalendar}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RightPanel;
