import React, { useState } from 'react';
import { CalendarEvent } from '../../services/calendarService';
import { NexusType, NexusObject } from '../../types';
import { X, Calendar, Clock, MapPin, Users, FileText, Plus, ExternalLink } from 'lucide-react';

interface ExtendedEvent extends CalendarEvent {
    isDocument?: boolean;
    nexusId?: string;
    nexusType?: NexusType;
    backgroundColor?: string;
    foregroundColor?: string;
}

interface EventDetailsModalProps {
    event: ExtendedEvent;
    onClose: () => void;
    onCreateDocument: (event: ExtendedEvent, type: NexusType) => void;
    onOpenDocument: (nexusId: string) => void;
    lang: 'en' | 'es';
}

const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
    event,
    onClose,
    onCreateDocument,
    onOpenDocument,
    lang
}) => {
    const [showTypeSelector, setShowTypeSelector] = useState(false);

    const isAllDay = !event.start.dateTime;
    const startDate = new Date(event.start.dateTime || event.start.date!);
    const endDate = new Date(event.end.dateTime || event.end.date!);

    const formatDate = (date: Date) => {
        return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const documentTypes = [
        { type: NexusType.MEETING, label: lang === 'es' ? 'Reunión' : 'Meeting', icon: Users },
        { type: NexusType.NOTE, label: lang === 'es' ? 'Nota' : 'Note', icon: FileText },
        { type: NexusType.PROJECT, label: lang === 'es' ? 'Proyecto' : 'Project', icon: Calendar },
        { type: NexusType.PAGE, label: lang === 'es' ? 'Página' : 'Page', icon: FileText },
        { type: NexusType.PERSON, label: lang === 'es' ? 'Persona' : 'Person', icon: Users },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Color */}
                <div
                    className="h-3 w-full"
                    style={{ backgroundColor: event.backgroundColor || '#3b82f6' }}
                />

                <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                            {event.summary || (lang === 'es' ? '(Sin título)' : '(No title)')}
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* Time */}
                        <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                            <Clock size={18} className="mt-0.5 shrink-0" />
                            <div>
                                <div className="font-medium">{formatDate(startDate)}</div>
                                {!isAllDay && (
                                    <div className="text-sm opacity-80">
                                        {formatTime(startDate)} - {formatTime(endDate)}
                                    </div>
                                )}
                                {isAllDay && (
                                    <div className="text-sm opacity-80">
                                        {lang === 'es' ? 'Todo el día' : 'All day'}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Location */}
                        {event.location && (
                            <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                                <MapPin size={18} className="mt-0.5 shrink-0" />
                                <div className="text-sm whitespace-pre-wrap line-clamp-4">
                                    {event.location}
                                </div>
                            </div>
                        )}

                        {/* Attendees */}
                        {event.attendees && event.attendees.length > 0 && (
                            <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                                <Users size={18} className="mt-0.5 shrink-0" />
                                <div className="text-sm">
                                    <div className="font-medium mb-1">{lang === 'es' ? 'Asistentes' : 'Attendees'}</div>
                                    <ul className="space-y-1">
                                        {event.attendees.map((attendee, i) => (
                                            <li key={i} className="opacity-80 truncate max-w-[250px]" title={attendee.email}>
                                                {attendee.displayName || attendee.email}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Calendar & Account Info */}
                        <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <Calendar size={18} className="mt-0.5 shrink-0" />
                            <div className="text-sm">
                                <div className="font-medium mb-1">{lang === 'es' ? 'Calendario' : 'Calendar'}</div>
                                <div className="flex flex-col gap-1">
                                    {(event as any).calendarSummary && (
                                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            {(event as any).calendarSummary}
                                        </div>
                                    )}
                                    {(event as any).accountEmail && (
                                        <div className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-400 inline-block self-start">
                                            {(event as any).accountEmail}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-3">
                        {event.isDocument && event.nexusId ? (
                            <button
                                onClick={() => onOpenDocument(event.nexusId!)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium"
                            >
                                <ExternalLink size={18} />
                                {lang === 'es' ? 'Abrir Documento' : 'Open Document'}
                            </button>
                        ) : (
                            <>
                                {!showTypeSelector ? (
                                    <button
                                        onClick={() => setShowTypeSelector(true)}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                                    >
                                        <Plus size={18} />
                                        {lang === 'es' ? 'Crear Documento Vinculado' : 'Create Linked Document'}
                                    </button>
                                ) : (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2 text-center">
                                            {lang === 'es' ? 'Selecciona el tipo:' : 'Select type:'}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {documentTypes.map((dt) => (
                                                <button
                                                    key={dt.type}
                                                    onClick={() => onCreateDocument(event, dt.type)}
                                                    className="flex flex-col items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    <dt.icon size={20} className="text-blue-600 dark:text-blue-400" />
                                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{dt.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => setShowTypeSelector(false)}
                                            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-2"
                                        >
                                            {lang === 'es' ? 'Cancelar' : 'Cancel'}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventDetailsModal;
