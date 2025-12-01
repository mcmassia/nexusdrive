import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { importService } from '../services/ImportService';
import { db } from '../services/db';
import { NexusObject } from '../types';

interface NotionImportModalProps {
    onClose: () => void;
    onImportComplete: () => void;
    lang: 'en' | 'es';
}

const NotionImportModal: React.FC<NotionImportModalProps> = ({ onClose, onImportComplete, lang }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState<string>('');
    const [result, setResult] = useState<{ objects: number; schemas: number } | null>(null);
    const [overwrite, setOverwrite] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.name.endsWith('.zip')) {
            setFile(droppedFile);
            setError(null);
        } else {
            setError(lang === 'es' ? 'Por favor, sube un archivo ZIP válido.' : 'Please upload a valid ZIP file.');
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile && selectedFile.name.endsWith('.zip')) {
            setFile(selectedFile);
            setError(null);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        setIsProcessing(true);
        setProgress(lang === 'es' ? 'Leyendo archivo ZIP...' : 'Reading ZIP file...');
        setError(null);

        try {
            // Define save callback for incremental persistence
            importService.saveCallback = async (obj: NexusObject) => {
                await db.saveObject(obj);
            };

            importService.assetCallback = async (id: string, blob: Blob, originalName: string) => {
                await db.saveAsset(id, blob, originalName);
            };

            // 0. Fetch existing titles for duplicate detection (Resume capability)
            setProgress(lang === 'es' ? 'Verificando archivos existentes...' : 'Checking existing files...');
            const existingObjects = await db.getObjects();
            const existingTitles = new Set(existingObjects.map(o => o.title));

            // 1. Process ZIP
            const { schemas, objects, assets, totalProcessed, failedCount, skippedCount } = await importService.processZip(file, (status) => {
                setProgress(status);
            }, existingTitles, overwrite);

            // 2. Save Schemas
            setProgress(lang === 'es' ? 'Guardando tipos de datos...' : 'Saving data types...');
            for (const schema of schemas) {
                await db.saveTypeSchema(schema);
            }

            // Objects are already saved via callback!

            // 4. Save Assets (TODO: Implement asset saving in DB or handle differently)
            // For now we skip asset persistence as mentioned in ImportService comments, 
            // or we could save them if we had an asset store.

            const processed = objects.length || totalProcessed || 0;
            const failed = failedCount || 0;
            const skipped = skippedCount || 0;

            setResult({ objects: processed, schemas: schemas.length });
            setIsProcessing(false);

            if (processed === 0 && skipped > 0) {
                setError(lang === 'es'
                    ? `Todos los archivos (${skipped}) ya existían y fueron omitidos.`
                    : `All files (${skipped}) already existed and were skipped.`);
            } else if (processed === 0) {
                setError(lang === 'es' ? 'No se encontraron archivos Markdown válidos.' : 'No valid Markdown files found.');
            } else if (failed > 0 || skipped > 0) {
                const msg = lang === 'es'
                    ? `Completado. Importados: ${processed}. Omitidos (existentes): ${skipped}. Fallidos: ${failed}.`
                    : `Completed. Imported: ${processed}. Skipped (existing): ${skipped}. Failed: ${failed}.`;

                setError(msg); // Show as info/warning

                setTimeout(() => {
                    onImportComplete();
                }, 4000);
            } else {
                // Notify parent after a short delay to show success
                setTimeout(() => {
                    onImportComplete();
                }, 1500);
            }

        } catch (err) {
            console.error('Import failed:', err);
            setError(lang === 'es' ? 'Error durante la importación.' : 'Error during import.');
            setIsProcessing(false);
        } finally {
            // Cleanup callback
            importService.saveCallback = undefined;
            importService.assetCallback = undefined;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <FileText className="text-blue-500" size={20} />
                        {lang === 'es' ? 'Importar desde Notion' : 'Import from Notion'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {!result ? (
                        <>
                            <p className="text-sm text-gray-500 mt-2">
                                {lang === 'es'
                                    ? 'Soporta archivos Markdown (.md), HTML (.html) y CSV (.csv) de exportaciones de Notion'
                                    : 'Supports Markdown (.md), HTML (.html), and CSV (.csv) files from Notion exports'}
                            </p>

                            <div
                                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${isDragging
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
                                    }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {file ? (
                                    <div className="flex flex-col items-center text-blue-600 dark:text-blue-400">
                                        <FileText size={48} className="mb-2" />
                                        <span className="font-medium">{file.name}</span>
                                        <span className="text-xs text-slate-400 mt-1">
                                            {(file.size / 1024 / 1024).toFixed(2)} MB
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-slate-400">
                                        <Upload size={48} className="mb-2" />
                                        <span className="font-medium text-slate-600 dark:text-slate-300">
                                            {lang === 'es' ? 'Arrastra tu ZIP aquí' : 'Drag your ZIP here'}
                                        </span>
                                        <span className="text-xs mt-1">
                                            {lang === 'es' ? 'o haz clic para seleccionar' : 'or click to select'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex items-center justify-center gap-2">
                                <input
                                    type="checkbox"
                                    id="overwrite"
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    checked={overwrite}
                                    onChange={(e) => setOverwrite(e.target.checked)}
                                />
                                <label htmlFor="overwrite" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                                    {lang === 'es' ? 'Sobrescribir archivos existentes' : 'Overwrite existing files'}
                                </label>
                            </div>

                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                accept=".zip"
                                className="hidden"
                            />

                            {error && (
                                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center gap-2">
                                    <AlertCircle size={16} />
                                    {error}
                                </div>
                            )}

                            {isProcessing && (
                                <div className="mt-6">
                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                        <span>{lang === 'es' ? 'Procesando...' : 'Processing...'}</span>
                                        <span>{progress}</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 animate-pulse w-full origin-left"></div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                    disabled={isProcessing}
                                >
                                    {lang === 'es' ? 'Cancelar' : 'Cancel'}
                                </button>
                                <button
                                    onClick={handleImport}
                                    disabled={!file || isProcessing}
                                    className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${!file || isProcessing
                                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                                        }`}
                                >
                                    {isProcessing && <Loader2 size={16} className="animate-spin" />}
                                    {lang === 'es' ? 'Importar' : 'Import'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle size={32} />
                            </div>
                            <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                                {lang === 'es' ? '¡Importación Completada!' : 'Import Complete!'}
                            </h4>
                            <p className="text-slate-600 dark:text-slate-400 mb-6">
                                {lang === 'es'
                                    ? `Se han importado ${result.objects} documentos y ${result.schemas} tipos de datos.`
                                    : `Successfully imported ${result.objects} documents and ${result.schemas} data types.`}
                            </p>
                            <button
                                onClick={() => {
                                    onImportComplete();
                                    onClose();
                                }}
                                className="px-6 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium hover:opacity-90 transition-opacity"
                            >
                                {lang === 'es' ? 'Finalizar' : 'Finish'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotionImportModal;
