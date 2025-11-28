import React, { useEffect, useState } from 'react';
import { calendarService } from '../services/calendarService';
import { authService } from '../services/authService';
import { db } from '../services/db';
import { Save, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface CalendarConfigProps {
    lang: 'en' | 'es';
    onClose: () => void;
}

const CalendarConfig: React.FC<CalendarConfigProps> = ({ lang, onClose }) => {
    // Store calendars grouped by account email
    const [accountCalendars, setAccountCalendars] = useState<{
        email: string;
        calendars: { id: string; summary: string; primary?: boolean; backgroundColor?: string; foregroundColor?: string }[]
    }[]>([]);

    // Store selected IDs as a Set of "email:calendarId" strings to ensure uniqueness across accounts
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const t = TRANSLATIONS[lang];

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [prefs, gmailPrefs] = await Promise.all([
                db.getCalendarPreferences(),
                db.getGmailPreferences()
            ]);

            // 1. Fetch Primary Calendars
            const primaryCalendars = await calendarService.listCalendars();
            const primaryEmail = authService.getUser()?.email || 'Primary Account';

            const allAccounts = [{ email: primaryEmail, calendars: primaryCalendars }];

            // 2. Fetch Secondary Calendars
            if (gmailPrefs?.connectedAccounts) {
                for (const account of gmailPrefs.connectedAccounts) {
                    if (account.accessToken) {
                        try {
                            const secondaryCalendars = await calendarService.listCalendars(account.accessToken);
                            allAccounts.push({ email: account.email, calendars: secondaryCalendars });
                        } catch (err) {
                            console.error(`Failed to fetch calendars for ${account.email}:`, err);
                        }
                    }
                }
            }

            setAccountCalendars(allAccounts);

            // Restore selection
            // The stored preferences might not have ownerEmail if from old version.
            // We'll try to match by ID.
            const newSelected = new Set<string>();

            prefs.calendars.forEach(savedCal => {
                // If savedCal has ownerEmail (future proof), use it
                if ((savedCal as any).ownerEmail) {
                    newSelected.add(`${(savedCal as any).ownerEmail}:${savedCal.id}`);
                } else {
                    // Fallback: try to find this ID in primary account first, then others
                    // This is imperfect but handles migration
                    const foundInPrimary = primaryCalendars.find(c => c.id === savedCal.id);
                    if (foundInPrimary) {
                        newSelected.add(`${primaryEmail}:${savedCal.id}`);
                    } else {
                        // Search in others
                        for (const acc of allAccounts) {
                            if (acc.email === primaryEmail) continue;
                            if (acc.calendars.find(c => c.id === savedCal.id)) {
                                newSelected.add(`${acc.email}:${savedCal.id}`);
                                break;
                            }
                        }
                    }
                }
            });

            setSelectedIds(newSelected);

        } catch (error) {
            console.error('Failed to load calendar config:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggle = (email: string, calendarId: string) => {
        const key = `${email}:${calendarId}`;
        const newSelected = new Set(selectedIds);
        if (newSelected.has(key)) {
            newSelected.delete(key);
        } else {
            newSelected.add(key);
        }
        setSelectedIds(newSelected);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const selectedCalendars: any[] = [];

            accountCalendars.forEach(account => {
                account.calendars.forEach(cal => {
                    const key = `${account.email}:${cal.id}`;
                    if (selectedIds.has(key)) {
                        selectedCalendars.push({
                            id: cal.id,
                            summary: cal.summary, // Save summary
                            backgroundColor: cal.backgroundColor,
                            foregroundColor: cal.foregroundColor,
                            ownerEmail: account.email
                        });
                    }
                });
            });

            await db.saveCalendarPreferences(selectedCalendars);
            // Trigger sync immediately after save
            await db.syncCalendarEvents();
            onClose();
        } catch (error) {
            console.error('Failed to save preferences:', error);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <RefreshCw className="animate-spin text-slate-400" />
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-slate-50 dark:bg-slate-950">
                <CalendarIcon className="text-blue-600" size={20} />
                <h2 className="font-semibold text-slate-800 dark:text-slate-100">
                    {lang === 'es' ? 'Configurar Calendarios' : 'Configure Calendars'}
                </h2>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    {lang === 'es'
                        ? 'Selecciona los calendarios que deseas sincronizar con NexusDrive.'
                        : 'Select the calendars you want to sync with NexusDrive.'}
                </p>

                <div className="space-y-6">
                    {accountCalendars.map(account => (
                        <div key={account.email} className="space-y-2">
                            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
                                {account.email}
                            </h3>
                            {account.calendars.map(cal => (
                                <label
                                    key={`${account.email}:${cal.id}`}
                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(`${account.email}:${cal.id}`)}
                                        onChange={() => handleToggle(account.email, cal.id)}
                                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                    />
                                    <div className="flex-1 flex items-center justify-between">
                                        <div className="font-medium text-slate-700 dark:text-slate-200">{cal.summary}</div>
                                        <div className="flex items-center gap-2">
                                            {cal.backgroundColor && (
                                                <div
                                                    className="w-3 h-3 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm"
                                                    style={{ backgroundColor: cal.backgroundColor }}
                                                    title="Calendar Color"
                                                />
                                            )}
                                            {cal.primary && (
                                                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded uppercase tracking-wider font-bold">
                                                    Primary
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-950">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                    {lang === 'es' ? 'Cancelar' : 'Cancel'}
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                    {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    {lang === 'es' ? 'Guardar y Sincronizar' : 'Save & Sync'}
                </button>
            </div>
        </div>
    );
};

export default CalendarConfig;
