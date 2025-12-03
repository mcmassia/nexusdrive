import React from 'react';
import { UserSelector } from './UserSelector';
import { useSettings } from './SettingsContext';

interface UserContextSettingsProps {
    lang: 'en' | 'es';
}

export function UserContextSettings({ lang }: UserContextSettingsProps) {
    const { preferences, updateCurrentUser } = useSettings();

    return (
        <div className="p-8 max-w-4xl">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                    {lang === 'es' ? 'Contexto de Usuario' : 'User Context'}
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                    {lang === 'es'
                        ? 'Configura tu documento de persona para búsquedas personalizadas'
                        : 'Configure your person document for personalized searches'}
                </p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
                <UserSelector
                    currentUser={preferences.currentUser}
                    onSelect={updateCurrentUser}
                />

                {preferences.currentUser && (
                    <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            <strong>{lang === 'es' ? 'Usuario actual:' : 'Current user:'}</strong> {preferences.currentUser.name}
                        </p>
                        <p className="text-sm text-blue-600 dark:text-blue-300 mt-2">
                            {lang === 'es'
                                ? 'Ahora puedes usar búsquedas como "mis reuniones", "donde participo", etc.'
                                : 'You can now use searches like "my meetings", "where I participate", etc.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
