import React, { useEffect, useState, useRef } from 'react';
import { db } from '../services/db';
import { Mail, RefreshCw, Paperclip, Calendar, Inbox, ExternalLink, FileText, ChevronLeft, ChevronRight, Trash2, EyeOff } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import DocumentTypeSelector, { DocumentType } from './DocumentTypeSelector';
import { ConfirmDialog } from './ConfirmDialog';

import { NexusObject } from '../types';

interface EmailsPanelProps {
    lang: 'en' | 'es';
    onNavigate?: (obj: NexusObject) => void;
}

interface EmailPreview {
    id: string;
    from: string;
    subject: string;
    date: Date;
    snippet: string;
    hasAttachments: boolean;
    labels: string[];
    owner?: string;
}

const EmailsPanel: React.FC<EmailsPanelProps> = ({ lang, onNavigate }) => {
    const [emails, setEmails] = useState<EmailPreview[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [syncedCount, setSyncedCount] = useState(0);
    const [emailToDelete, setEmailToDelete] = useState<string | null>(null);
    const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
    const [accountMap, setAccountMap] = useState<Record<string, { color: string, name: string }>>({});
    const [hiddenEmails, setHiddenEmails] = useState<Set<string>>(new Set());

    // State for document creation
    const [creationEmail, setCreationEmail] = useState<EmailPreview | null>(null);
    const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

    const t = TRANSLATIONS[lang];

    useEffect(() => {
        loadEmails();
        loadAccountInfo();
        loadHiddenEmails();
    }, []);

    const loadHiddenEmails = () => {
        const stored = localStorage.getItem('hiddenEmails');
        if (stored) {
            setHiddenEmails(new Set(JSON.parse(stored)));
        }
    };

    const loadAccountInfo = async () => {
        const prefs = await db.getGmailPreferences();
        const map: Record<string, { color: string, name: string }> = {};

        // Primary account (we don't have its picture easily here without authService, but we can use a default color)
        // Actually, let's just map secondary accounts for now, or fetch user from authService if possible?
        // db.ts doesn't expose authService directly. 
        // We can assume if owner is not in connectedAccounts, it's primary.

        if (prefs?.connectedAccounts) {
            prefs.connectedAccounts.forEach((acc, index) => {
                // Generate a consistent color based on index or name
                const colors = ['bg-purple-500', 'bg-green-500', 'bg-yellow-500', 'bg-pink-500'];
                map[acc.email] = {
                    color: colors[index % colors.length],
                    name: acc.email
                };
            });
        }
        setAccountMap(map);
    };

    const loadEmails = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const messages = await db.getGmailMessages(20); // Increased limit to see more
            setEmails(messages as EmailPreview[]);
            const total = await db.getGmailMessageCount();
            setSyncedCount(total);
        } catch (err) {
            console.error('Error loading emails:', err);
            setError(lang === 'es' ? 'Error al cargar correos' : 'Error loading emails');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setError(null);
        try {
            await db.syncGmailMessages();
            await loadEmails();
        } catch (err) {
            console.error('Error syncing emails:', err);
            setError(lang === 'es' ? 'Error al sincronizar' : 'Error syncing');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteClick = (emailId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEmailToDelete(emailId);
    };

    const handleBulkDeleteClick = () => {
        if (selectedEmails.size === 0) return;
        // Trigger confirmation for bulk delete
        // We use a special ID 'BULK' to indicate bulk delete in the state, 
        // or we could add a separate state. For simplicity, let's use a separate state or just reuse emailToDelete with a flag?
        // Better to use a separate state or just handle it in confirmDelete.
        // Let's use emailToDelete = 'BULK' as a flag.
        setEmailToDelete('BULK');
    };

    const handleHideClick = (emailId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newHidden = new Set(hiddenEmails);
        newHidden.add(emailId);
        setHiddenEmails(newHidden);
        localStorage.setItem('hiddenEmails', JSON.stringify(Array.from(newHidden)));
    };

    const confirmDelete = async () => {
        if (!emailToDelete) return;

        try {
            if (emailToDelete === 'BULK') {
                // Bulk delete
                for (const id of selectedEmails) {
                    await db.deleteGmailMessage(id);
                }
                setSelectedEmails(new Set());
            } else {
                // Single delete
                await db.deleteGmailMessage(emailToDelete);
            }
            await loadEmails();
        } catch (err) {
            console.error('Error deleting email:', err);
            alert(lang === 'es' ? 'Error al eliminar' : 'Error deleting');
        } finally {
            setEmailToDelete(null);
        }
    };

    const openInGmail = (emailId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        // Find the email object to get the owner
        const email = emails.find(e => e.id === emailId);
        const ownerEmail = email?.owner;

        let gmailUrl;
        if (ownerEmail) {
            // Use authuser query param which is more reliable than /u/X/
            gmailUrl = `https://mail.google.com/mail/u/?authuser=${ownerEmail}#inbox/${emailId}`;
        } else {
            gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${emailId}`;
        }
        window.open(gmailUrl, '_blank');
    };

    const handleCreateDocumentClick = (email: EmailPreview, e: React.MouseEvent) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setTriggerRect(rect);
        setCreationEmail(email);
    };

    const handleTypeSelect = async (type: DocumentType) => {
        if (!creationEmail) return;

        try {
            const docId = await db.createDocumentFromEmail(creationEmail.id, type);
            const newDoc = await db.getObjectById(docId);

            if (newDoc && onNavigate) {
                onNavigate(newDoc);
            }
        } catch (error) {
            console.error('Failed to create document from email:', error);
            alert(lang === 'es' ? 'Error al crear documento' : 'Failed to create document');
        }

        setCreationEmail(null);
        setTriggerRect(null);
    };

    const toggleSelection = (emailId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSelected = new Set(selectedEmails);
        if (newSelected.has(emailId)) {
            newSelected.delete(emailId);
        } else {
            newSelected.add(emailId);
        }
        setSelectedEmails(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedEmails.size === emails.length) {
            setSelectedEmails(new Set());
        } else {
            setSelectedEmails(new Set(emails.map(e => e.id)));
        }
    };

    const extractSender = (from: string): string => {
        const match = from.match(/^(.+?)\s*<(.+?)>$/);
        return match ? match[1].trim() : from;
    };

    const formatDate = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (hours < 1) return lang === 'es' ? 'hace un momento' : 'just now';
        if (hours < 24) return lang === 'es' ? `hace ${hours}h` : `${hours}h ago`;
        if (days < 7) return lang === 'es' ? `hace ${days}d` : `${days}d ago`;

        return new Date(date).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <div className={`h-full flex flex-col bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-96'}`}>
            {/* Header */}
            <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'} p-4 border-b border-slate-200 dark:border-slate-700`}>
                <div className="flex items-center gap-2">
                    {!isCollapsed && (
                        <input
                            type="checkbox"
                            checked={emails.length > 0 && selectedEmails.size === emails.length}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                    )}
                    <Mail className="w-5 h-5 text-blue-500" />
                    {!isCollapsed && (
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                            {selectedEmails.size > 0 ? `${selectedEmails.size} selected` : (lang === 'es' ? 'Correos' : 'Emails')}
                        </h3>
                    )}
                </div>

                <div className={`flex items-center gap-1 ${isCollapsed ? 'flex-col' : ''}`}>
                    {!isCollapsed && selectedEmails.size > 0 && (
                        <button
                            onClick={handleBulkDeleteClick}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                            title={lang === 'es' ? 'Eliminar seleccionados' : 'Delete selected'}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50"
                        title={lang === 'es' ? 'Sincronizar' : 'Sync'}
                    >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                    >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
                {error && !isCollapsed && (
                    <div className="p-4 m-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center h-48">
                        <div className="text-slate-500 dark:text-slate-400">
                            {isCollapsed ? <RefreshCw className="animate-spin w-4 h-4" /> : (lang === 'es' ? 'Cargando...' : 'Loading...')}
                        </div>
                    </div>
                ) : emails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400 p-4 text-center">
                        <Inbox className="w-8 h-8 mb-2" />
                        {!isCollapsed && (
                            <>
                                <p className="text-sm">
                                    {lang === 'es' ? 'No hay correos' : 'No emails'}
                                </p>
                                <button
                                    onClick={handleSync}
                                    className="mt-2 text-xs text-blue-500 hover:underline"
                                >
                                    {lang === 'es' ? 'Sincronizar' : 'Sync'}
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {emails.filter(email => !hiddenEmails.has(email.id)).map((email) => {
                            const isUnread = email.labels?.includes('UNREAD');
                            const isSelected = selectedEmails.has(email.id);

                            if (isCollapsed) {
                                return (
                                    <div
                                        key={email.id}
                                        className="p-3 flex justify-center hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                                        title={email.subject}
                                        onClick={(e) => openInGmail(email.id, e)}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${isUnread ? 'bg-blue-500' : 'bg-slate-300'}`} />
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={email.id}
                                    className={`
                    px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 
                    transition-colors group
                    ${isUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                    ${isSelected ? 'bg-blue-100/50 dark:bg-blue-900/30' : ''}
                  `}
                                >
                                    {/* Email Info */}
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => toggleSelection(email.id, e)}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 opacity-0 group-hover:opacity-100 transition-opacity data-[checked=true]:opacity-100"
                                                data-checked={isSelected}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {email.owner && accountMap[email.owner] && (
                                                        <div
                                                            className={`w-2 h-2 rounded-full ${accountMap[email.owner].color}`}
                                                            title={accountMap[email.owner].name}
                                                        />
                                                    )}
                                                    <span className={`text-sm truncate ${isUnread ? 'font-semibold' : 'font-medium'} text-slate-900 dark:text-white`}>
                                                        {extractSender(email.from)}
                                                    </span>
                                                    {email.hasAttachments && (
                                                        <Paperclip className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                    )}
                                                </div>
                                                <div className={`text-sm truncate ${isUnread ? 'font-medium' : ''} text-slate-700 dark:text-slate-300`}>
                                                    {email.subject || <span className="italic text-slate-400">(No subject)</span>}
                                                </div>
                                                {email.snippet && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                                                        {email.snippet}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                                                <Calendar className="w-3 h-3" />
                                                <span>{formatDate(email.date)}</span>
                                            </div>
                                            <button
                                                onClick={(e) => handleHideClick(email.id, e)}
                                                className="text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                title={lang === 'es' ? 'Ocultar del panel' : 'Hide from panel'}
                                            >
                                                <EyeOff size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(email.id, e)}
                                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                title={lang === 'es' ? 'Eliminar del servidor' : 'Delete from server'}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 mt-2 pl-7">
                                        <button
                                            onClick={(e) => openInGmail(email.id, e)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                                            title={lang === 'es' ? 'Abrir en Gmail' : 'Open in Gmail'}
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>{lang === 'es' ? 'Gmail' : 'Gmail'}</span>
                                        </button>
                                        <button
                                            onClick={(e) => handleCreateDocumentClick(email, e)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                                            title={lang === 'es' ? 'Crear Documento' : 'Create Document'}
                                        >
                                            <FileText className="w-3.5 h-3.5" />
                                            <span>{lang === 'es' ? 'Documento' : 'Document'}</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            {emails.length > 0 && !isCollapsed && (
                <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center flex justify-between">
                        <span>{lang === 'es' ? `Sincronizados: ${syncedCount}` : `Synced: ${syncedCount}`}</span>
                        <span>{lang === 'es' ? `Visualizando: ${emails.length}` : `Visualizing: ${emails.length}`}</span>
                    </p>
                </div>
            )}

            {/* Document Type Selector */}
            <DocumentTypeSelector
                isOpen={!!creationEmail}
                onClose={() => {
                    setCreationEmail(null);
                    setTriggerRect(null);
                }}
                onSelect={handleTypeSelect}
                lang={lang}
                triggerRect={triggerRect}
            />

            <ConfirmDialog
                isOpen={!!emailToDelete}
                title={emailToDelete === 'BULK'
                    ? (lang === 'es' ? 'Eliminar correos' : 'Delete Emails')
                    : (lang === 'es' ? 'Eliminar correo' : 'Delete Email')}
                message={emailToDelete === 'BULK'
                    ? (lang === 'es' ? `¿Estás seguro de que quieres eliminar ${selectedEmails.size} correos?` : `Are you sure you want to delete ${selectedEmails.size} emails?`)
                    : (lang === 'es' ? '¿Estás seguro de que quieres eliminar este correo? Esta acción no se puede deshacer.' : 'Are you sure you want to delete this email? This action cannot be undone.')}
                confirmLabel={lang === 'es' ? 'Eliminar' : 'Delete'}
                cancelLabel={lang === 'es' ? 'Cancelar' : 'Cancel'}
                onConfirm={confirmDelete}
                onCancel={() => setEmailToDelete(null)}
                isDestructive={true}
            />
        </div>
    );
};

export default EmailsPanel;
