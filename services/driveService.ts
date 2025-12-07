import { authService } from './authService';
import { NexusObject, NexusType } from '../types';

// Helper function to encode Unicode strings to base64
// btoa() fails with Unicode characters, so we need this workaround
function unicodeToBase64(str: string): string {
    // Convert string to UTF-8 bytes, then to base64
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
    }));
}

// Google Drive API Types
interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    webViewLink?: string;
    appProperties?: Record<string, string>;
    properties?: Record<string, string>;
}

interface DriveChangesList {
    nextPageToken?: string;
    changes: Array<{
        fileId: string;
        removed: boolean;
        file?: DriveFile;
    }>;
}

/**
 * Google Drive Service - Implements the persistence layer as described in NexusDrive spec
 * Handles:
 * - Creating/Reading/Updating/Deleting objects as Google Docs
 * - Storing metadata in file properties (appProperties)
 * - Syncing frontmatter within document body
 * - Managing folder structure in Drive
 */
class DriveService {
    private baseUrl = 'https://www.googleapis.com/drive/v3';
    private docsBaseUrl = 'https://docs.googleapis.com/v1';
    private nexusFolderId: string | null = null;
    private appDataFolderId: string | null = null;
    private startPageToken: string | null = null;
    private isInitialized: boolean = false;
    private typeFolderIds: Map<string, string> = new Map(); // Cache for type folder IDs

    // Map NexusType to folder names
    private readonly typeFolderNames: Record<string, string> = {
        'Page': 'Pages',
        'Person': 'Persons',
        'Meeting': 'Meetings',
        'Project': 'Projects'
    };

    /**
     * Initialize Drive folders structure:
     * - /Mi Unidad/Nexus/ for user-visible objects
     * - /appDataFolder/ for internal indices
     */
    async initialize(): Promise<void> {
        console.log('🔍 [DriveService] initialize() called');
        const token = authService.getAccessToken();
        const isDemoMode = authService.isInDemoMode();

        console.log('🔍 [DriveService] Token exists?', !!token);
        console.log('🔍 [DriveService] Token preview:', token?.substring(0, 30) + '...');
        console.log('🔍 [DriveService] Is demo mode?', isDemoMode);

        if (!token || isDemoMode) {
            console.log('[DriveService] Skipping initialization (Demo Mode or No Token)');
            console.log('  - Token:', !!token);
            console.log('  - Demo Mode:', isDemoMode);
            return;
        }

        console.log('[DriveService] Starting initialization...');

        try {
            // Find or create Nexus folder
            console.log('[DriveService] Creating/finding Nexus folder...');
            this.nexusFolderId = await this.findOrCreateFolder('Nexus', 'root');
            console.log(`✅ [DriveService] Nexus folder ID: ${this.nexusFolderId}`);

            // Get initial page token for changes sync
            console.log('[DriveService] Getting start page token...');
            const tokenResponse = await this.fetchWithAuth(
                `${this.baseUrl}/changes/startPageToken`
            );
            const data = await tokenResponse.json();
            this.startPageToken = data.startPageToken;

            this.isInitialized = true; // Mark as initialized
            console.log(`✅ [DriveService] Initialized with page token: ${this.startPageToken}`);
            console.log('🎉 [DriveService] Initialization complete! Ready to sync.');
        } catch (error) {
            console.error('❌ [DriveService] Initialization failed:', error);
            if (error instanceof Error) {
                console.error('Error details:', error.message);

                // Check if it's an API not enabled error
                if (error.message.includes('403') || error.message.includes('Drive API')) {
                    console.error('');
                    console.error('⚠️ ========================================');
                    console.error('⚠️  GOOGLE DRIVE API NOT ENABLED');
                    console.error('⚠️ ========================================');
                    console.error('');
                    console.error('Please enable the Google Drive API:');
                    console.error('1. Go to: https://console.cloud.google.com/apis/library/drive.googleapis.com');
                    console.error('2. Click "ENABLE"');
                    console.error('3. Refresh this page and try again');
                    console.error('');
                }
            }
            throw error;
        }
    }

    /**
     * Find or create a folder in Drive
     */
    private async findOrCreateFolder(name: string, parentId: string): Promise<string> {
        const token = authService.getAccessToken();
        if (!token) throw new Error('No access token');

        // Search for existing folder
        const searchQuery = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const searchUrl = `${this.baseUrl}/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name)`;

        const searchResponse = await this.fetchWithAuth(searchUrl);
        const searchData = await searchResponse.json();

        if (searchData.files && searchData.files.length > 0) {
            return searchData.files[0].id;
        }

        // Create new folder
        const createResponse = await this.fetchWithAuth(`${this.baseUrl}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            })
        });

        const createData = await createResponse.json();
        return createData.id;
    }

    /**
     * Get or create type-specific folder (e.g., /Nexus/Pages/, /Nexus/Persons/)
     */
    private async getOrCreateTypeFolder(type: string): Promise<string> {
        // Check cache first
        if (this.typeFolderIds.has(type)) {
            return this.typeFolderIds.get(type)!;
        }

        if (!this.nexusFolderId) {
            throw new Error('Nexus folder not initialized');
        }

        // Get folder name for this type
        const folderName = this.typeFolderNames[type] || `${type}s`;

        // Find or create the type folder
        const folderId = await this.findOrCreateFolder(folderName, this.nexusFolderId);

        // Cache it
        this.typeFolderIds.set(type, folderId);

        console.log(`📁 [DriveService] Type folder for ${type}: ${folderName} (${folderId})`);
        return folderId;
    }

    /**
     * Create a new object in Drive as a Google Doc
     */
    async createObject(obj: NexusObject): Promise<{ id: string, webViewLink?: string }> {
        const token = authService.getAccessToken();

        if (!token) {
            throw new Error('No access token available. Please log in.');
        }

        if (!this.isInitialized || !this.nexusFolderId) {
            console.error('❌ [DriveService] Cannot create object - Drive not initialized');
            console.error('  - isInitialized:', this.isInitialized);
            console.error('  - nexusFolderId:', this.nexusFolderId);
            console.error('  - Attempting to re-initialize...');

            // Try to initialize again
            try {
                await this.initialize();
                if (!this.isInitialized || !this.nexusFolderId) {
                    throw new Error('Drive initialization failed');
                }
            } catch (initError) {
                console.error('❌ [DriveService] Re-initialization failed:', initError);
                throw new Error('Drive not initialized. Please refresh the page and try again.');
            }
        }

        console.log(`📤 [DriveService] Creating document for "${obj.title}"...`);

        // Build the full HTML content with frontmatter
        const frontmatter = await this.buildFrontmatter(obj);
        const fullHtmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${obj.title}</title>
</head>
<body>
    ${frontmatter}
    ${obj.content || '<p>Empty document</p>'}
</body>
</html>`;

        // Create metadata
        const typeFolderId = await this.getOrCreateTypeFolder(obj.type);
        const metadata = {
            name: obj.title,
            mimeType: 'application/vnd.google-apps.document',
            parents: [typeFolderId],
            appProperties: {
                nexus_object_id: obj.id,
                nexus_type_id: obj.type
            }
        };

        const content = await this.processContentForDrive(fullHtmlContent); // Process content to resolve links
        const backmatter = await this.buildBackmatter(obj); // Build backlinks section
        const finalContent = content + backmatter;

        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: text/html; charset=UTF-8\r\n' +
            'Content-Transfer-Encoding: base64\r\n\r\n' +
            unicodeToBase64(finalContent) +
            closeDelim;

        const response = await this.fetchWithAuth(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
            {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/related; boundary="${boundary}"`
                },
                body: multipartRequestBody
            }
        );

        const fileData = await response.json();
        const fileId = fileData.id;

        console.log(`✅ [DriveService] Created document with ID: ${fileId}`);
        return { id: fileId, webViewLink: fileData.webViewLink };
    }

    /**
     * Update document content including frontmatter table
     */
    private async updateDocumentContent(fileId: string, obj: NexusObject): Promise<void> {
        // Build frontmatter table as text
        const frontmatter = await this.buildFrontmatter(obj);
        const fullContent = `${frontmatter}\n\n${obj.content}`;

        // For now, use simple text update. In production, use Google Docs API for structured editing
        // This requires converting HTML to Google Docs format which is complex
        // Simplified approach: export as HTML
        const updateUrl = `${this.baseUrl}/files/${fileId}?uploadType=media`;

        await this.fetchWithAuth(updateUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'text/html' },
            body: fullContent
        });
    }

    /**
     * Build frontmatter metadata table as HTML with resolved Drive links
     */
    private async buildFrontmatter(obj: NexusObject): Promise<string> {
        let html = '<table style="border: none; border-collapse: collapse; margin-bottom: 30px; font-family: Arial, sans-serif; font-size: 9pt; color: #666;">\n';
        html += '<tbody>\n';
        html += `<tr><td style="border: none; padding: 2px 8px 2px 0; font-weight: bold; color: #888;">Type</td><td style="border: none; padding: 2px 0;">${obj.type}</td></tr>\n`;
        html += `<tr><td style="border: none; padding: 2px 8px 2px 0; font-weight: bold; color: #888;">ID</td><td style="border: none; padding: 2px 0;">${obj.id}</td></tr>\n`;
        html += `<tr><td style="border: none; padding: 2px 8px 2px 0; font-weight: bold; color: #888;">Last Modified</td><td style="border: none; padding: 2px 0;">${new Date(obj.lastModified).toLocaleDateString()}</td></tr>\n`;

        if (obj.tags.length > 0) {
            html += `<tr><td style="border: none; padding: 2px 8px 2px 0; font-weight: bold; color: #888;">Tags</td><td style="border: none; padding: 2px 0;">${obj.tags.map(t => `#${t}`).join(', ')}</td></tr>\n`;
        }

        // Dynamically import db to avoid circular dependency
        const { db } = await import('./db');

        for (const meta of obj.metadata) {
            let value: string;

            // Resolve document references to Drive links
            if (meta.type === 'document' || meta.type === 'documents') {
                value = await this.resolveDocumentLinks(meta.value, db);
            } else if (Array.isArray(meta.value)) {
                value = meta.value.join(', ');
            } else {
                value = String(meta.value || '');
            }

            html += `<tr><td style="border: none; padding: 2px 8px 2px 0; font-weight: bold; color: #888;">${meta.label}</td><td style="border: none; padding: 2px 0;">${value}</td></tr>\n`;
        }

        html += '</tbody>\n';
        html += '</table>\n';
        html += '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">\n';
        return html;
    }

    /**
     * Resolve document IDs to clickable Drive links
     */
    private async resolveDocumentLinks(value: string | string[], db: any): Promise<string> {
        const ids = Array.isArray(value) ? value : [value].filter(Boolean);
        const links: string[] = [];

        for (const id of ids) {
            if (!id) continue;

            try {
                const obj = await db.getObjectById(id);
                console.log(`[DriveService] Resolving link for ${id}:`, {
                    found: !!obj,
                    title: obj?.title,
                    driveFileId: obj?.driveFileId
                });

                if (obj?.driveFileId) {
                    const url = `https://docs.google.com/document/d/${obj.driveFileId}/edit`;
                    links.push(`<a href="${url}" data-object-id="${id}" style="color: #1a73e8; text-decoration: none;">${obj.title}</a>`);
                } else if (obj) {
                    // Object exists but no Drive file yet - show title with ID
                    links.push(`${obj.title} <span style="color: #999; font-size: 8pt;">(not synced)</span>`);
                } else {
                    // Object not found - show ID
                    links.push(`<span style="color: #999;">${id}</span>`);
                }
            } catch (error) {
                console.error('Error resolving document link:', error);
                links.push(`<span style="color: #999;">${id}</span>`);
            }
        }

        return links.join(', ');
    }

    /**
     * Read object from Drive by file ID
     */
    async readObject(fileId: string): Promise<NexusObject | null> {
        const token = authService.getAccessToken();
        if (!token) return null;

        try {
            console.log(`[DriveService] Fetching: https://www.googleapis.com/drive/v3/files/${fileId}`);

            // Get file metadata
            const metaUrl = `${this.baseUrl}/files/${fileId}?fields=id,name,mimeType,modifiedTime,webViewLink,appProperties,headRevisionId`;
            const metaResponse = await this.fetchWithAuth(metaUrl);
            const fileData = await metaResponse.json();

            console.log(`[DriveService] File metadata:`, fileData);

            // Skip folders - don't try to read them as documents
            if (fileData.mimeType === 'application/vnd.google-apps.folder') {
                console.log(`[DriveService] Skipping folder: ${fileData.name}`);
                return null;
            }

            let htmlContent = '';

            // Check if file is a Google Doc (exportable)
            const isGoogleDoc = fileData.mimeType === 'application/vnd.google-apps.document';

            if (isGoogleDoc) {
                // Try to export as HTML
                try {
                    const contentUrl = `${this.baseUrl}/files/${fileId}/export?mimeType=text/html`;
                    console.log(`[DriveService] Fetching content from: ${contentUrl}`);
                    const contentResponse = await this.fetchWithAuth(contentUrl);

                    if (!contentResponse.ok) {
                        console.warn(`[DriveService] Export failed with status ${contentResponse.status}`);
                        htmlContent = '<p>Unable to load content from Drive</p>';
                    } else {
                        htmlContent = await contentResponse.text();
                        console.log(`[DriveService] Content loaded successfully, length: ${htmlContent.length}`);
                    }
                } catch (exportError) {
                    console.error(`[DriveService] Export error:`, exportError);
                    htmlContent = '<p>Error loading content</p>';
                }
            } else {
                // Not a Google Doc - show placeholder
                console.log(`[DriveService] File is not a Google Doc (${fileData.mimeType}), using placeholder`);
                htmlContent = `<p><em>This file type (${fileData.mimeType}) cannot be edited directly. <a href="https://drive.google.com/file/d/${fileId}/view" target="_blank">Open in Google Drive</a></em></p>`;
            }

            // Parse frontmatter and content
            const obj = await this.parseDocumentFromHtml(fileData, htmlContent);
            console.log(`[DriveService] Parsed object:`, obj.title);
            return obj;
        } catch (error) {
            console.error(`[DriveService] Failed to read object ${fileId}:`, error);
            return null;
        }
    }

    /**
     * Parse Google Doc HTML export to extract NexusObject
     */
    private async parseDocumentFromHtml(fileData: any, html: string): Promise<NexusObject> {
        const objectId = fileData.appProperties?.nexus_object_id || fileData.id;

        // Try to get existing object from local db to preserve metadata
        const { db } = await import('./db');
        const existingObj = await db.getObjectById(objectId, true); // Skip lazy load to avoid recursion

        // Extract content by removing the frontmatter table
        // The table is followed by an HR tag, so we split on that
        let content = html;
        const hrIndex = html.toLowerCase().indexOf('<hr');

        console.log(`[DriveService] Parsing HTML for ${fileData.name}:`, {
            totalLength: html.length,
            hrIndex,
            hasFrontmatter: hrIndex > 0
        });

        if (hrIndex > 0) {
            // Find the end of the HR tag
            const hrEndIndex = html.indexOf('>', hrIndex);
            if (hrEndIndex > 0) {
                // Content starts after the HR tag
                content = html.substring(hrEndIndex + 1).trim();
                console.log(`[DriveService] Content extracted, length: ${content.length}`);
            }
        } else {
            console.warn(`[DriveService] No <hr> tag found in ${fileData.name}. Using full HTML.`);
        }

        // Restore content structure (tasks, checkboxes)
        const processedContent = this.restoreContentStructure(content);

        // If we have an existing object, preserve its metadata and properties
        if (existingObj) {
            return {
                ...existingObj,
                title: fileData.name.replace('.gdoc', ''),
                content: processedContent,
                lastModified: new Date(fileData.modifiedTime),
                driveFileId: fileData.id, // Update Drive file ID
                driveWebViewLink: fileData.webViewLink, // Map webViewLink
                headRevisionId: fileData.headRevisionId // Store revision ID
            };
        }

        // For new objects, create minimal structure
        const obj: NexusObject = {
            id: objectId,
            title: fileData.name.replace('.gdoc', ''),
            type: (fileData.appProperties?.nexus_type_id as NexusType) || NexusType.PAGE,
            content: processedContent,
            lastModified: new Date(fileData.modifiedTime),
            tags: [],
            metadata: [],
            driveFileId: fileData.id,
            driveWebViewLink: fileData.webViewLink, // Map webViewLink
            headRevisionId: fileData.headRevisionId // Store revision ID
        };

        return obj;
    }

    /**
     * Restore Nexus-specific structure (tasks, checkboxes) from Google Docs HTML
     */
    private restoreContentStructure(html: string): string {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // 1. Restore Tasks (TAREA/REALIZADO)
            // Find all elements containing exactly "TAREA" or "REALIZADO"
            // We use a TreeWalker to find text nodes
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            const nodesToProcess: { node: Node, text: string }[] = [];

            while (node = walker.nextNode()) {
                const text = node.textContent?.trim();
                if (text === 'TAREA' || text === 'REALIZADO' || text === '☐' || text === '☑') {
                    nodesToProcess.push({ node, text });
                }
            }

            // Process collected nodes
            nodesToProcess.forEach(({ node, text }) => {
                const parent = node.parentElement;
                if (!parent) return;

                if (text === 'TAREA' || text === 'REALIZADO') {
                    // Check if it's likely a task tag (e.g. short text content in parent)
                    // Google Docs might wrap it in a span with style
                    if (parent.textContent?.trim() === text) {
                        const isDone = text === 'REALIZADO';

                        // Re-apply Nexus classes
                        parent.classList.add('nexus-task-tag');
                        parent.classList.add(isDone ? 'done' : 'task');

                        // Add Tailwind classes for local rendering
                        const baseClasses = ['text-white', 'px-2', 'py-0.5', 'rounded', 'text-xs', 'font-bold', 'mr-2', 'cursor-pointer', 'select-none'];
                        if (isDone) {
                            parent.classList.add('bg-green-700', ...baseClasses);
                        } else {
                            parent.classList.add('bg-red-500', ...baseClasses);
                        }

                        parent.dataset.status = isDone ? 'done' : 'todo';
                        parent.contentEditable = 'false';

                        // Clean up inline styles that might conflict or be redundant
                        // parent.removeAttribute('style'); // Optional: keep styles if we want to preserve Drive look
                    }
                } else if (text === '☐' || text === '☑') {
                    // Restore Checkbox
                    const input = doc.createElement('input');
                    input.type = 'checkbox';
                    input.className = 'nexus-checkbox mr-2 cursor-pointer';
                    input.checked = text === '☑';

                    // If the parent only contains this char, replace parent
                    if (parent.textContent?.trim() === text) {
                        parent.replaceWith(input);
                    } else {
                        // Otherwise replace the text node
                        node.parentNode?.replaceChild(input, node);
                    }
                }
            });

            return doc.body.innerHTML;
        } catch (e) {
            console.error('[DriveService] Error restoring content structure:', e);
            return html;
        }
    }

    /**
     * Update existing object in Drive
     */
    async updateObject(fileId: string, obj: NexusObject): Promise<void> {
        const token = authService.getAccessToken();
        if (!token) throw new Error('No access token');

        console.log(`📤 [DriveService] Updating document "${obj.title}"...`);

        // Step 1: Update metadata
        const metaUrl = `${this.baseUrl}/files/${fileId}`;
        await this.fetchWithAuth(metaUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: `${obj.title}`,
                appProperties: {
                    nexus_type_id: obj.type,
                    nexus_object_id: obj.id
                }
            })
        });

        // Step 2: Update content using multipart upload
        const frontmatter = await this.buildFrontmatter(obj);
        const fullHtmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${obj.title}</title>
</head>
<body>
    ${frontmatter}
    ${obj.content || '<p>Empty document</p>'}
</body>
</html>`;

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
            mimeType: 'application/vnd.google-apps.document'
        };

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: text/html\r\n\r\n' +
            await this.processContentForDrive(fullHtmlContent) +
            await this.buildBackmatter(obj) +
            close_delim;

        await this.fetchWithAuth(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': `multipart/related; boundary="${boundary}"`
                },
                body: multipartRequestBody
            }
        );

        console.log(`✅ [DriveService] Updated document successfully`);
    }

    /**
     * Delete object from Drive
     */
    async deleteObject(fileId: string): Promise<void> {
        const token = authService.getAccessToken();
        if (!token) throw new Error('No access token');

        await this.fetchWithAuth(`${this.baseUrl}/files/${fileId}`, {
            method: 'DELETE'
        });
        console.log(`[DriveService] Deleted file ${fileId}`);
    }

    /**
     * List all Nexus objects from Drive
     */
    async listObjects(): Promise<DriveFile[]> {
        const token = authService.getAccessToken();
        if (!token || !this.nexusFolderId) return [];

        const query = `'${this.nexusFolderId}' in parents and trashed=false`;
        const url = `${this.baseUrl}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,appProperties)`;

        const response = await this.fetchWithAuth(url);
        const data = await response.json();
        return data.files || [];
    }

    /**
     * Fetch changes from Drive since last sync
     */
    async fetchChanges(): Promise<DriveChangesList> {
        const token = authService.getAccessToken();
        if (!token || !this.startPageToken) {
            return { changes: [] };
        }

        const url = `${this.baseUrl}/changes?pageToken=${this.startPageToken}&includeRemoved=true&fields=nextPageToken,changes(fileId,removed,file(id,name,mimeType,appProperties))`;

        const response = await this.fetchWithAuth(url);
        const data = await response.json();

        // Update page token for next sync
        if (data.nextPageToken) {
            this.startPageToken = data.nextPageToken;
        }

        return data;
    }

    /**
     * Perform a full sync from Drive - lists ALL files recursively and imports them
     * Use this for initial sync on new installations
     */
    async fullSyncFromDrive(): Promise<{ imported: number, errors: number }> {
        const token = authService.getAccessToken();
        if (!token || !this.isInitialized || !this.nexusFolderId) {
            console.error('[DriveService] Cannot full sync - not initialized');
            return { imported: 0, errors: 0 };
        }

        console.log('🔄 [DriveService] Starting FULL SYNC from Drive...');
        let imported = 0;
        let errors = 0;

        try {
            // Get all files recursively from Nexus folder
            const allFiles = await this.listAllFilesRecursive(this.nexusFolderId);
            console.log(`📁 [DriveService] Found ${allFiles.length} total files in Drive`);

            // Filter out folders, only process documents
            const documents = allFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
            console.log(`📄 [DriveService] ${documents.length} documents to import`);

            // Import each document
            for (let i = 0; i < documents.length; i++) {
                const file = documents[i];
                try {
                    console.log(`[DriveService] Importing ${i + 1}/${documents.length}: ${file.name} (${file.id})`);
                    const obj = await this.readObject(file.id);

                    if (obj) {
                        // Save to IndexedDB via db
                        const { db } = await import('./db');
                        await db.saveObject({ ...obj, driveFileId: file.id });
                        imported++;
                        console.log(`✅ [DriveService] Imported ${i + 1}/${documents.length}: ${obj.title}`);
                    } else {
                        console.warn(`⚠️ [DriveService] Skipped: ${file.name} (could not parse)`);
                    }
                } catch (error) {
                    console.error(`❌ [DriveService] Error importing ${file.name}:`, error);

                    // Check if it's an auth error
                    if (error instanceof Error && (error.message.includes('401') || error.message.includes('token'))) {
                        console.error('🔐 [DriveService] Authentication error during sync. Token may have expired.');
                        throw new Error('Tu sesión expiró durante la sincronización. Por favor, cierra sesión y vuelve a iniciar sesión, luego intenta de nuevo.');
                    }

                    errors++;

                    // Stop if too many errors
                    if (errors > 10) {
                        throw new Error(`Demasiados errores (${errors}). Sincronización cancelada.`);
                    }
                }
            }

            console.log(`✅ [DriveService] Full sync complete: ${imported} imported, ${errors} errors`);

            // After full sync, get a new page token for incremental syncs
            try {
                const tokenResponse = await this.fetchWithAuth(
                    `${this.baseUrl}/changes/startPageToken`
                );
                const data = await tokenResponse.json();
                this.startPageToken = data.startPageToken;
                console.log(`✅ [DriveService] Set page token for future incremental syncs`);
            } catch (tokenError) {
                console.warn('⚠️ [DriveService] Could not set page token, incremental sync may not work:', tokenError);
            }

        } catch (error) {
            console.error('[DriveService] Full sync failed:', error);
            errors++;
            throw error; // Re-throw to let UI handle it
        }

        return { imported, errors };
    }

    /**
     * List all files recursively from a folder
     */
    private async listAllFilesRecursive(folderId: string): Promise<DriveFile[]> {
        const token = authService.getAccessToken();
        if (!token) return [];

        const files: DriveFile[] = [];
        let pageToken: string | undefined;

        do {
            const query = `'${folderId}' in parents and trashed=false`;
            const url = `${this.baseUrl}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,appProperties)${pageToken ? `&pageToken=${pageToken}` : ''}`;

            const response = await this.fetchWithAuth(url);
            const data = await response.json();

            if (data.files) {
                files.push(...data.files);

                // For each subfolder, recursively get its files
                const subfolders = data.files.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder');
                for (const subfolder of subfolders) {
                    const subFiles = await this.listAllFilesRecursive(subfolder.id);
                    files.push(...subFiles);
                }
            }

            pageToken = data.nextPageToken;
        } while (pageToken);

        return files;
    }

    /**
     * Helper: Fetch with authentication
     */
    private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
        let token = authService.getAccessToken();
        if (!token) {
            console.error('❌ [DriveService] No access token available');
            throw new Error('No access token available');
        }

        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };

        console.log(`🌐 [DriveService] Fetching: ${url.substring(0, 100)}...`);
        let response = await fetch(url, { ...options, headers });

        // If we get 401, token might be expired - try to refresh
        if (response.status === 401) {
            console.warn('⚠️ [DriveService] Got 401, attempting to refresh token...');
            const newToken = await authService.requestNewToken();

            if (newToken) {
                console.log('✅ [DriveService] Token refreshed, retrying request...');
                // Retry with new token
                const retryHeaders = {
                    ...options.headers,
                    'Authorization': `Bearer ${newToken}`
                };
                response = await fetch(url, { ...options, headers: retryHeaders });
            }
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ [DriveService] API Error ${response.status}:`, errorText);
            throw new Error(`Drive API Error: ${response.status} ${errorText}`);
        }

        console.log(`✅ [DriveService] Request successful`);
        return response;
    }

    /**
     * Simple content hash for change detection
     */
    private hashContent(content: string): string {
        // Simple hash for now, in production use MD5
        return unicodeToBase64(content).substring(0, 32);
    }
    /**
     * Get file info without reading content
     */
    async getFileInfo(fileId: string): Promise<{ id: string, name: string, mimeType: string, modifiedTime: string, headRevisionId?: string } | null> {
        const token = authService.getAccessToken();
        if (!token) return null;

        try {
            const metaUrl = `${this.baseUrl}/files/${fileId}?fields=id,name,mimeType,modifiedTime,headRevisionId`;
            const response = await this.fetchWithAuth(metaUrl);
            return await response.json();
        } catch (error) {
            console.error(`[DriveService] Failed to get file info:`, error);
            return null;
        }
    }
    /**
     * Process content for Drive: Replace internal links with Drive links
     */
    private async makeFilePublic(fileId: string): Promise<void> {
        try {
            await this.fetchWithAuth(
                `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        role: 'reader',
                        type: 'anyone'
                    })
                }
            );
            console.log(`[DriveService] Made file ${fileId} public`);
        } catch (error) {
            console.error(`[DriveService] Failed to make file ${fileId} public`, error);
        }
    }

    private async uploadAsset(blob: Blob, name: string): Promise<{ id: string, webViewLink: string }> {
        const assetsFolderId = await this.getOrCreateAssetsFolder();

        const metadata = {
            name,
            parents: [assetsFolderId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const response = await this.fetchWithAuth(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
            {
                method: 'POST',
                body: form
            }
        );

        const result = await response.json();

        // Make public immediately
        if (result.id) {
            await this.makeFilePublic(result.id);
        }

        return result;
    }

    async processContentForDrive(htmlContent: string): Promise<string> {
        if (!this.isInitialized || !this.nexusFolderId) return htmlContent;

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const { db } = await import('./db');

        // 0. Process Tasks & Checkboxes (Prepare for Drive)
        // Convert custom elements to Drive-compatible formats with inline styles
        const tasks = doc.querySelectorAll('.nexus-task-tag');
        tasks.forEach(task => {
            const el = task as HTMLElement;
            const isDone = el.classList.contains('done') || el.dataset.status === 'done';

            // Inline styles for Google Docs
            // We use !important to ensure they stick, though Google Docs might strip that
            el.style.cssText = isDone
                ? 'background-color: #15803d; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10pt; display: inline-block; margin-right: 8px;'
                : 'background-color: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10pt; display: inline-block; margin-right: 8px;';

            // Ensure text content is correct
            el.textContent = isDone ? 'REALIZADO' : 'TAREA';
        });

        const checkboxes = doc.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const input = cb as HTMLInputElement;
            const span = doc.createElement('span');
            // Use unicode characters for checkboxes
            span.textContent = input.checked ? '☑' : '☐';
            span.style.cssText = 'font-family: Arial, sans-serif; font-size: 12pt; margin-right: 8px;';
            span.className = 'nexus-checkbox-placeholder'; // Marker for restoration

            if (input.parentNode) {
                input.parentNode.replaceChild(span, input);
            }
        });

        // 1. Process Images (Upload to Drive)
        const images = doc.querySelectorAll('img');
        console.log(`[DriveService] Found ${images.length} images in content`);

        for (const img of Array.from(images)) {
            const src = img.getAttribute('src');
            console.log(`[DriveService] Image src: ${src}`);

            if (src && src.startsWith('asset://')) {
                const assetId = src.replace('asset://', '');
                console.log(`[DriveService] Processing asset: ${assetId}`);

                try {
                    const asset = await db.getAsset(assetId);
                    console.log(`[DriveService] Asset found in DB:`, !!asset);

                    if (asset) {
                        let driveLink = asset.driveLink;
                        let driveId = asset.driveId;
                        let isPublic = asset.isPublic;

                        console.log(`[DriveService] Existing driveLink: ${driveLink}, Public: ${isPublic}`);

                        // If not uploaded yet, upload it
                        if (!driveLink) {
                            console.log(`[DriveService] Uploading asset ${assetId} to Drive...`);
                            const result = await this.uploadAsset(asset.blob, `asset_${assetId}`);
                            driveLink = result.webViewLink;
                            driveId = result.id;
                            isPublic = true; // uploadAsset makes it public

                            console.log(`[DriveService] Uploaded. Link: ${driveLink}`);

                            // Save back to DB
                            await db.updateAsset(assetId, {
                                driveId: result.id,
                                driveLink: result.webViewLink,
                                isPublic: true
                            });
                        }
                        // If uploaded but not marked public (legacy), make it public
                        else if (driveId && !isPublic) {
                            console.log(`[DriveService] Making existing asset ${assetId} public...`);
                            await this.makeFilePublic(driveId);
                            await db.updateAsset(assetId, { isPublic: true });
                            isPublic = true;
                        }

                        if (driveLink && driveId) {
                            // Use export link for src (better for embedding)
                            const exportLink = `https://drive.google.com/uc?export=view&id=${driveId}`;
                            img.setAttribute('src', exportLink);

                            // Wrap in link to view in Drive
                            const wrapper = doc.createElement('a');
                            wrapper.setAttribute('href', driveLink);
                            wrapper.setAttribute('target', '_blank');
                            img.parentNode?.insertBefore(wrapper, img);
                            wrapper.appendChild(img);
                        } else if (driveLink) {
                            // Fallback if no driveId (shouldn't happen with new logic)
                            img.setAttribute('src', driveLink);
                        }
                    } else {
                        console.warn(`[DriveService] Asset ${assetId} not found in DB`);
                    }
                } catch (e) {
                    console.warn(`[DriveService] Failed to process asset ${assetId}`, e);
                }
            }
        }

        // 2. Process Links
        const links = doc.querySelectorAll('a');

        // We need to process links sequentially to await DB lookups
        for (const link of Array.from(links)) {
            const nexusId = link.getAttribute('data-object-id') || link.getAttribute('data-nexus-id'); // Support both just in case

            if (nexusId) {
                try {
                    const targetObj = await db.getObjectById(nexusId);
                    if (targetObj && targetObj.driveFileId) {
                        // Replace href with Drive link
                        link.setAttribute('href', `https://docs.google.com/document/d/${targetObj.driveFileId}/edit`);
                        // Optional: Add styling to indicate it's a Drive link
                        link.style.color = '#1a73e8';
                        link.style.textDecoration = 'none';
                    } else {
                        // Object exists but not synced, or not found
                        // Keep it as is, or maybe mark it
                        link.style.color = '#5f6368'; // Grey out if not available
                        link.removeAttribute('href'); // Remove href to prevent 404s if it was internal
                    }
                } catch (e) {
                    console.warn(`[DriveService] Failed to resolve link for ${nexusId}`, e);
                }
            }
        }

        return doc.body.innerHTML;
    }



    /**
     * Get or create 'Assets' folder
     */
    private async getOrCreateAssetsFolder(): Promise<string> {
        if (!this.nexusFolderId) throw new Error('Nexus folder not initialized');
        return this.findOrCreateFolder('Assets', this.nexusFolderId);
    }

    /**
     * Build backmatter with Linked References (Backlinks)
     */
    private async buildBackmatter(obj: NexusObject): Promise<string> {
        // Dynamically import db
        const { db } = await import('./db');

        // Get backlinks
        const backlinks = await db.getBacklinksWithContext(obj.id);

        if (backlinks.length === 0) {
            return '';
        }

        let html = '<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 40px 0 20px 0;">\n';
        html += '<h3 style="color: #444; font-family: Arial, sans-serif; font-size: 14pt; margin-bottom: 15px;">Linked References</h3>\n';
        html += '<div style="font-family: Arial, sans-serif; font-size: 10pt;">\n';

        for (const backlink of backlinks) {
            // Get source object to check for Drive ID
            const sourceObj = await db.getObjectById(backlink.sourceDocId);
            let titleHtml = backlink.sourceDocTitle;

            if (sourceObj && sourceObj.driveFileId) {
                const url = `https://docs.google.com/document/d/${sourceObj.driveFileId}/edit`;
                titleHtml = `<a href="${url}" style="color: #1a73e8; text-decoration: none; font-weight: bold;">${backlink.sourceDocTitle}</a>`;
            } else {
                titleHtml = `<span style="font-weight: bold; color: #333;">${backlink.sourceDocTitle}</span>`;
            }

            html += '<div style="margin-bottom: 20px;">\n';
            html += `  <div style="margin-bottom: 4px;">${titleHtml} <span style="color: #888; font-size: 8pt;">(${new Date(backlink.sourceDocDate).toLocaleDateString()})</span></div>\n`;

            for (const context of backlink.mentionContexts) {
                // Highlight the mention in the context if possible, or just show it
                // We'll use a simple blockquote style
                html += `  <div style="color: #555; padding-left: 12px; border-left: 3px solid #eee; margin-top: 4px; line-height: 1.4;">\n`;
                html += `    "${context.contextText}"\n`;
                html += `  </div>\n`;
            }
            html += '</div>\n';
        }

        html += '</div>\n';
        return html;
    }
}

export const driveService = new DriveService();
