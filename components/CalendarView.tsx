import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { NexusObject } from '../types';
import { Calendar as CalendarIcon, Clock, MapPin } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface CalendarViewProps {
  onNavigate: (obj: NexusObject) => void;
  lang: 'en' | 'es';
}

const CalendarView: React.FC<CalendarViewProps> = ({ onNavigate, lang }) => {
  const [meetings, setMeetings] = useState<NexusObject[]>([]);
  const [selectedDate, setSelectedDate] = useState<number>(new Date().getDate());
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const fetchMeetings = async () => {
      const upcoming = await db.getUpcomingMeetings();
      setMeetings(upcoming);
    };
    fetchMeetings();
  }, []);

  return (
    <div className="flex h-full bg-slate-50 dark:bg-black/10 overflow-hidden animate-in fade-in duration-300">
      
      {/* Main Calendar Grid Area */}
      <div className="flex-1 p-8 overflow-y-auto no-scrollbar">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-3">
            <CalendarIcon className="text-blue-600" />
            {t.calendar}
        </h2>

        {/* Big Calendar Visual */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
                <span className="text-xl font-semibold text-slate-800 dark:text-slate-200 capitalize">
                    {new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'long', year: 'numeric' })}
                </span>
                <div className="flex gap-2">
                    <button className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 dark:hover:bg-slate-700">Today</button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-4 text-center">
                {(lang === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']).map(day => (
                    <div key={day} className="text-xs font-bold text-slate-400 uppercase tracking-wider">{day}</div>
                ))}
                
                {/* Empty slots for start of month */}
                <div className="h-24 p-2 bg-transparent" />
                <div className="h-24 p-2 bg-transparent" />

                {/* Days */}
                {Array.from({length: 31}).map((_, i) => {
                    const day = i + 1;
                    const isToday = day === new Date().getDate();
                    const isSelected = day === selectedDate;
                    
                    return (
                        <div 
                            key={i} 
                            onClick={() => setSelectedDate(day)}
                            className={`h-24 border rounded-lg p-2 text-left relative cursor-pointer transition-all hover:border-blue-400 dark:hover:border-blue-500
                                ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'}
                            `}
                        >
                            <span className={`text-sm font-semibold ${isToday ? 'bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full' : 'text-slate-700 dark:text-slate-300'}`}>
                                {day}
                            </span>
                            
                            {/* Mock events for visual */}
                            {day === 12 && (
                                <div className="mt-2 text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200 p-1 rounded truncate">
                                    Weekly Sync
                                </div>
                            )}
                             {day === 24 && (
                                <div className="mt-2 text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 p-1 rounded truncate">
                                    Project Launch
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
      </div>

      {/* Right Side: Agenda List */}
      <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 overflow-y-auto no-scrollbar">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">{t.agenda} {selectedDate}</h3>
        
        <div className="space-y-4">
            {meetings.map(m => (
                <div 
                    key={m.id}
                    onClick={() => onNavigate(m)}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md cursor-pointer transition-all bg-slate-50 dark:bg-slate-950/50 group"
                >
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-8 bg-blue-500 rounded-full" />
                        <div>
                            <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400">{m.title}</h4>
                            <span className="text-xs text-slate-400">10:00 AM - 11:30 AM</span>
                        </div>
                    </div>
                    <div className="pl-3 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                         <div className="flex items-center gap-1">
                             <Clock size={12} /> <span>1h 30m</span>
                         </div>
                         <div className="flex items-center gap-1">
                             <MapPin size={12} /> <span>Google Meet</span>
                         </div>
                    </div>
                </div>
            ))}

            {meetings.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                    <p>{t.noEvents}</p>
                    <button className="mt-4 text-sm text-blue-600 hover:underline">+ Add Event</button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;