import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { GmailPreferences, ConnectedAccount } from '../types';
import { Save, RefreshCw, Clock, Filter, Folder, Mail, Plus, Trash2, User } from 'lucide-react';
import { gmailService } from '../services/gmailService';
import { authService } from '../services/authService';

interface GmailConfigProps {
    lang: 'en' | 'es';
}

const GmailConfig: React.FC<GmailConfigProps> = ({ lang }) => {
    const [prefs, setPrefs] = useState<GmailPreferences | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [availableLabels, setAvailableLabels] = useState<{ id: string; name: string }[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [currentUser, setCurrentUser] = useState(authService.getUser());

    useEffect(() => {
        loadPreferences();
        loadLabels();
    }, []);

    const loadPreferences = async () => {
        const p = await db.getGmailPreferences();
        setPrefs(p);
    };

    const loadLabels = async () => {
        // In a real app, we would fetch this from Gmail API
        // For now, we'll hardcode common system labels and allow custom input
        setAvailableLabels([
            { id: 'INBOX', name: 'Inbox' },
            { id: 'IMPORTANT', name: 'Important' },
            { id: 'STARRED', name: 'Starred' },
            { id: 'SENT', name: 'Sent' },
            { id: 'SPAM', name: 'Spam' },
            { id: 'TRASH', name: 'Trash' }
        ]);
    };

    const handleAddAccount = async () => {
        try {
            const newAccount = await authService.addAccount();
            if (newAccount && prefs) {
                // Check if already exists
                const existing = prefs.connectedAccounts || [];
                if (existing.some(a => a.email === newAccount.email)) {
                    alert(lang === 'es' ? 'Esta cuenta ya está conectada' : 'This account is already connected');
                    return;
                }

                const updatedAccounts = [...existing, newAccount];
                const updatedPrefs = { ...prefs, connectedAccounts: updatedAccounts };

                await db.saveGmailPreferences(updatedPrefs);
                setPrefs(updatedPrefs);
                alert(lang === 'es' ? 'Cuenta añadida correctamente' : 'Account added successfully');
            }
        } catch (error) {
            console.error('Error adding account:', error);
            alert(lang === 'es' ? 'Error al añadir cuenta' : 'Error adding account');
        }
    };

    const handleRemoveAccount = async (email: string) => {
        if (!prefs) return;
        if (!window.confirm(lang === 'es' ? '¿Desconectar esta cuenta?' : 'Disconnect this account?')) return;

        const updatedAccounts = (prefs.connectedAccounts || []).filter(a => a.email !== email);
        const updatedPrefs = { ...prefs, connectedAccounts: updatedAccounts };

        await db.saveGmailPreferences(updatedPrefs);
        setPrefs(updatedPrefs);
    };

    const handleSave = async () => {
        if (!prefs) return;
        setIsSaving(true);
        try {
            // Construct syncQuery based on filters
            let queryParts = [];

            // Labels
            if (prefs.syncLabels && prefs.syncLabels.length > 0) {
                const labelQuery = prefs.syncLabels.map(l => `label:${l}`).join(' OR ');
                queryParts.push(`(${labelQuery})`);
            }

            // Sender
            if (prefs.filterSender) {
                queryParts.push(`from:${prefs.filterSender}`);
            }

            // Date
            if (prefs.filterAfterDate) {
                // Format date as YYYY/MM/DD
                const d = new Date(prefs.filterAfterDate);
                const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                queryParts.push(`after:${dateStr}`);
            }

            const finalQuery = queryParts.join(' ');
            const updatedPrefs = { ...prefs, syncQuery: finalQuery };

            await db.saveGmailPreferences(updatedPrefs);
            setPrefs(updatedPrefs);
            alert(lang === 'es' ? 'Configuración guardada' : 'Settings saved');
        } catch (error) {
            console.error('Error saving preferences:', error);
            alert(lang === 'es' ? 'Error al guardar' : 'Error saving');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleLabel = (labelId: string) => {
        if (!prefs) return;
        const currentLabels = prefs.syncLabels || [];
        const newLabels = currentLabels.includes(labelId)
            ? currentLabels.filter(l => l !== labelId)
            : [...currentLabels, labelId];

        setPrefs({ ...prefs, syncLabels: newLabels });
    };

    if (!prefs) return <div className="p-8 text-center">Loading settings...</div>;

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-xl text-red-600 dark:text-red-400">
                    <Mail size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                        {lang === 'es' ? 'Configuración de Gmail' : 'Gmail Configuration'}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400">
                        {lang === 'es' ? 'Gestiona la sincronización y filtros de tus correos' : 'Manage email synchronization and filters'}
                    </p>
                </div>
            </div>

            {/* 0. Connected Accounts */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <User size={18} className="text-indigo-500" />
                    {lang === 'es' ? 'Cuentas Conectadas' : 'Connected Accounts'}
                </h3>

                <div className="space-y-3">
                    {/* Primary Account */}
                    {currentUser && (
                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <img src={currentUser.picture} alt={currentUser.name} className="w-8 h-8 rounded-full" />
                                <div>
                                    <div className="font-medium text-slate-800 dark:text-slate-200">{currentUser.name}</div>
                                    <div className="text-xs text-slate-500">{currentUser.email}</div>
                                </div>
                            </div>
                            <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                                {lang === 'es' ? 'Principal' : 'Primary'}
                            </span>
                        </div>
                    )}

                    {/* Secondary Accounts */}
                    {prefs.connectedAccounts?.map(account => (
                        <div key={account.email} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <img src={account.picture} alt={account.name} className="w-8 h-8 rounded-full" />
                                <div>
                                    <div className="font-medium text-slate-800 dark:text-slate-200">{account.name}</div>
                                    <div className="text-xs text-slate-500">{account.email}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRemoveAccount(account.email)}
                                className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-2 rounded-full transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}

                    <button
                        onClick={handleAddAccount}
                        className="w-full py-2 flex items-center justify-center gap-2 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        <Plus size={16} />
                        {lang === 'es' ? 'Añadir otra cuenta' : 'Add another account'}
                    </button>
                </div>
            </div>

            {/* 1. Labels Selection */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <Folder size={18} className="text-blue-500" />
                    {lang === 'es' ? 'Carpetas a Sincronizar' : 'Folders to Sync'}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {availableLabels.map(label => (
                        <button
                            key={label.id}
                            onClick={() => toggleLabel(label.id)}
                            className={`
                                flex items-center gap-2 p-3 rounded-lg border transition-all
                                ${prefs.syncLabels?.includes(label.id)
                                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300'
                                }
                            `}
                        >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${prefs.syncLabels?.includes(label.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-400'}`}>
                                {prefs.syncLabels?.includes(label.id) && <div className="w-2 h-2 bg-white rounded-sm" />}
                            </div>
                            {label.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. Filters */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <Filter size={18} className="text-purple-500" />
                    {lang === 'es' ? 'Filtros de Contenido' : 'Content Filters'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {lang === 'es' ? 'Solo correos de (remitente)' : 'Only emails from (sender)'}
                        </label>
                        <input
                            type="text"
                            value={prefs.filterSender || ''}
                            onChange={(e) => setPrefs({ ...prefs, filterSender: e.target.value })}
                            placeholder="example@domain.com"
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {lang === 'es' ? 'Solo correos posteriores a' : 'Only emails after'}
                        </label>
                        <input
                            type="date"
                            value={prefs.filterAfterDate ? new Date(prefs.filterAfterDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => setPrefs({ ...prefs, filterAfterDate: e.target.value ? new Date(e.target.value) : undefined })}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* 3. Sync Settings */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <Clock size={18} className="text-green-500" />
                    {lang === 'es' ? 'Frecuencia de Sincronización' : 'Sync Frequency'}
                </h3>

                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h4 className="font-medium text-slate-800 dark:text-slate-200">
                            {lang === 'es' ? 'Sincronización Automática' : 'Automatic Synchronization'}
                        </h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {lang === 'es' ? 'Sincronizar correos en segundo plano' : 'Sync emails in background'}
                        </p>
                    </div>
                    <button
                        onClick={() => setPrefs({ ...prefs, autoSync: !prefs.autoSync })}
                        className={`
                            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                            ${prefs.autoSync ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}
                        `}
                    >
                        <span
                            className={`
                                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                                ${prefs.autoSync ? 'translate-x-6' : 'translate-x-1'}
                            `}
                        />
                    </button>
                </div>

                {prefs.autoSync && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {lang === 'es' ? 'Intervalo (minutos)' : 'Interval (minutes)'}
                        </label>
                        <select
                            value={prefs.syncFrequency || 60}
                            onChange={(e) => setPrefs({ ...prefs, syncFrequency: parseInt(e.target.value) })}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none"
                        >
                            <option value={15}>15 {lang === 'es' ? 'minutos' : 'minutes'}</option>
                            <option value={30}>30 {lang === 'es' ? 'minutos' : 'minutes'}</option>
                            <option value={60}>1 {lang === 'es' ? 'hora' : 'hour'}</option>
                            <option value={120}>2 {lang === 'es' ? 'horas' : 'hours'}</option>
                            <option value={360}>6 {lang === 'es' ? 'horas' : 'hours'}</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-4">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                    {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                    {lang === 'es' ? 'Guardar Configuración' : 'Save Configuration'}
                </button>
            </div>
        </div>
    );
};

export default GmailConfig;
