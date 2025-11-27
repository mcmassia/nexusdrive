import React, { useEffect, useState, useRef } from 'react';
import { db } from '../services/db';
import { Mail, RefreshCw, Paperclip, Calendar, Inbox, ExternalLink, FileText, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
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
}

const EmailsPanel: React.FC<EmailsPanelProps> = ({ lang, onNavigate }) => {
    const [emails, setEmails] = useState<EmailPreview[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [emailToDelete, setEmailToDelete] = useState<string | null>(null);

    // State for document creation
    const [creationEmail, setCreationEmail] = useState<EmailPreview | null>(null);
    const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

    const t = TRANSLATIONS[lang];

    useEffect(() => {
        loadEmails();
    }, []);

    const loadEmails = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const messages = await db.getGmailMessages(10);
            setEmails(messages as EmailPreview[]);
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

    const confirmDelete = async () => {
        if (!emailToDelete) return;

        try {
            await db.deleteGmailMessage(emailToDelete);
            await loadEmails();
        } catch (err) {
            console.error('Error deleting email:', err);
            alert(lang === 'es' ? 'Error al eliminar' : 'Error deleting'); // Keep alert for now, can be replaced with a notification system
        } finally {
            setEmailToDelete(null);
        }
    };

    const openInGmail = (emailId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        // Open email directly in Gmail
        const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${emailId}`;
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
                    <Mail className="w-5 h-5 text-blue-500" />
                    {!isCollapsed && (
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                            {lang === 'es' ? 'Correos' : 'Emails'}
                        </h3>
                    )}
                </div>

                <div className={`flex items-center gap-1 ${isCollapsed ? 'flex-col' : ''}`}>
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
                        {emails.map((email) => {
                            const isUnread = email.labels?.includes('UNREAD');

                            if (isCollapsed) {
                                return (
                                    <div key={email.id} className="p-3 flex justify-center hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" title={email.subject}>
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
                  `}
                                >
                                    {/* Email Info */}
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
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
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                                                <Calendar className="w-3 h-3" />
                                                <span>{formatDate(email.date)}</span>
                                            </div>
                                            <button
                                                onClick={(e) => handleDeleteClick(email.id, e)}
                                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                title={lang === 'es' ? 'Eliminar' : 'Delete'}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 mt-2">
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
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                        {lang === 'es'
                            ? `Mostrando ${emails.length} correos recientes`
                            : `Showing ${emails.length} recent emails`}
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
                title={lang === 'es' ? 'Eliminar correo' : 'Delete Email'}
                message={lang === 'es' ? '¿Estás seguro de que quieres eliminar este correo? Esta acción no se puede deshacer.' : 'Are you sure you want to delete this email? This action cannot be undone.'}
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
