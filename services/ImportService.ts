import * as zip from '@zip.js/zip.js';
import { marked } from 'marked';
import { NexusObject, TypeSchema, NexusType } from '../types';

export interface ImportResult {
    schemas: TypeSchema[];
    objects: NexusObject[];
    assets: Map<string, Blob>; // filename -> blob
    totalProcessed?: number;
    failedCount?: number;
    skippedCount?: number;
}

interface FileInfo {
    id: string;
    title: string;
    type: string;
    path: string;
}

export class ImportService {
    private fileMap = new Map<string, FileInfo>();
    private assetMap = new Map<string, string>(); // originalName -> newName

    async processZip(file: File, onProgress?: (status: string) => void, existingTitles?: Set<string>, overwrite: boolean = false): Promise<ImportResult> {
        const reader = new zip.ZipReader(new zip.BlobReader(file));
        const entries = await reader.getEntries();
        console.log(`ZIP contains ${entries.length} entries.`);
        if (entries.length > 0) {
            console.log('First entry:', entries[0].filename);
        }

        const detectedSchemas = new Map<string, Set<string>>();
        const assets = new Map<string, Blob>();

        // Pass 1: Build File Map (Path -> ID)
        onProgress?.(`Scanning ${entries.length} files...`);
        this.fileMap.clear();
        this.assetMap.clear();

        const mdEntries: zip.Entry[] = [];
        let skippedCount = 0;

        for (const entry of entries) {
            // console.log('Entry:', entry.filename, 'Dir:', entry.directory); // Too verbose for large zips
            if (entry.directory) continue;
            // Normalize path to use forward slashes
            const relativePath = entry.filename.replace(/\\/g, '/');

            if (relativePath.includes('__MACOSX') || relativePath.startsWith('.')) continue;

            if (relativePath.endsWith('.md')) {
                const title = relativePath.split('/').pop()?.replace('.md', '') || 'Untitled';

                // Check if already exists
                if (!overwrite && existingTitles && existingTitles.has(title)) {
                    console.log(`Skipping existing MD: ${title} (${relativePath})`);
                    skippedCount++;
                    continue;
                }

                console.log(`Adding MD to process: ${title} (${relativePath})`);
                const id = crypto.randomUUID();
                this.fileMap.set(relativePath, { id, title, type: 'Notion', path: relativePath });
                mdEntries.push(entry);
            } else if (relativePath.endsWith('.html')) {
                const title = relativePath.split('/').pop()?.replace('.html', '') || 'Untitled';

                // Check if already exists
                if (!overwrite && existingTitles && existingTitles.has(title)) {
                    console.log(`Skipping existing HTML: ${title} (${relativePath})`);
                    skippedCount++;
                    continue;
                }

                console.log(`Adding HTML to process: ${title} (${relativePath})`);
                const id = crypto.randomUUID();
                this.fileMap.set(relativePath, { id, title, type: 'Notion', path: relativePath });
                mdEntries.push(entry);
            } else {
                // Asset
                const ext = relativePath.split('.').pop() || '';
                const name = relativePath.split('/').pop()?.replace(`.${ext}`, '') || 'asset';
                const safeName = name.replace(/[^a-z0-9]/gi, '_');
                // Use randomUUID to ensure uniqueness even if filenames are same (e.g. image.png in different folders)
                const newName = `${safeName}_${crypto.randomUUID()}.${ext}`;
                // Use full relative path as key to avoid collisions
                this.assetMap.set(relativePath, newName);
                // console.log(`Found asset: ${relativePath} -> ${newName}`);
            }
        }

        // Pass 2: Process Content & Save Incrementally
        let processedCount = 0;
        let failedCount = 0;
        const totalFiles = mdEntries.length;

        console.log(`Found ${totalFiles} new Markdown/HTML files to process. Skipped ${skippedCount} existing files.`);

        // Process Assets first or in parallel? 
        // Let's process assets as we encounter them in the zip if we iterate all entries, 
        // but we already filtered mdEntries.

        // We need to process asset entries too.
        // Let's iterate the original entries again or filter them earlier?
        // We have assetMap which has keys.

        // Better approach: Iterate all entries again or filter for assets
        const assetEntries = entries.filter(e => {
            const relativePath = e.filename.replace(/\\/g, '/');
            return this.assetMap.has(relativePath) && !e.directory;
        });

        console.log(`Found ${assetEntries.length} assets to process.`);

        // Save assets
        for (const entry of assetEntries) {
            try {
                const relativePath = entry.filename.replace(/\\/g, '/');
                const newName = this.assetMap.get(relativePath);
                if (newName && (entry as any).getData) {
                    const blob = await (entry as any).getData(new zip.BlobWriter());
                    if (this.assetCallback) {
                        await this.assetCallback(newName, blob, relativePath);
                    }
                }
            } catch (e) {
                console.error(`Failed to save asset ${entry.filename}`, e);
            }
        }

        for (const entry of mdEntries) {
            processedCount++;
            if (processedCount % 10 === 0) {
                onProgress?.(`Importing file ${processedCount}/${totalFiles}...`);
            }

            try {
                // Read content as text
                if (!(entry as any).getData) {
                    console.warn(`Entry ${entry.filename} has no getData method.`);
                    failedCount++;
                    continue;
                }

                const content = await (entry as any).getData(new zip.TextWriter());

                // Use normalized path for lookup
                const normalizedPath = entry.filename.replace(/\\/g, '/');
                const info = this.fileMap.get(normalizedPath)!;

                let metadata, body;

                if (normalizedPath.endsWith('.html')) {
                    const result = this.parseHtmlContent(content, info);
                    metadata = result.metadata;
                    body = result.body;
                } else {
                    const result = this.parseFrontmatter(content);
                    metadata = result.metadata;
                    body = result.body;
                }

                // Update title/type from metadata if available
                if (metadata.title) info.title = metadata.title;
                if (metadata.type) info.type = metadata.type;

                // Collect schema info
                const type = info.type;
                if (!detectedSchemas.has(type)) {
                    detectedSchemas.set(type, new Set());
                }
                Object.keys(metadata).forEach(key => {
                    if (key !== 'type' && key !== 'title') {
                        detectedSchemas.get(type)?.add(key);
                    }
                });

                // Convert to NexusObject
                const nexusObj = this.convertToNexusObject(info, body, metadata);

                // Save immediately to DB
                if (this.saveCallback) {
                    await this.saveCallback(nexusObj);
                } else {
                    console.warn('No saveCallback defined, object not saved:', nexusObj.title);
                }

            } catch (e) {
                console.error(`Failed to process ${entry.filename}`, e);
                failedCount++;
            }
        }

        await reader.close();

        // Generate Schemas
        const schemas: TypeSchema[] = [];
        detectedSchemas.forEach((props, type) => {
            const properties = Array.from(props).map(key => {
                let propType: any = 'text';
                if (key.includes('date') || key.includes('fecha') || key === 'createdAt') propType = 'date';
                if (key === 'tags') propType = 'multiselect';
                if (key === 'organizaciones' || key === 'personasInvolucradas') propType = 'multiselect';
                return {
                    key,
                    label: key.charAt(0).toUpperCase() + key.slice(1),
                    type: propType,
                    required: false
                };
            });

            if (!properties.find(p => p.key === 'date')) {
                properties.push({ key: 'date', label: 'Date', type: 'date', required: false });
            }

            schemas.push({
                type: type,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                properties
            });
        });

        return { schemas, objects: [], assets, totalProcessed: processedCount, failedCount, skippedCount };
    }

    // Callback for saving objects incrementally
    public saveCallback?: (obj: NexusObject) => Promise<void>;
    public assetCallback?: (id: string, blob: Blob, originalName: string) => Promise<void>;

    private resolvePath(basePath: string, relativePath: string): string {
        const stack = basePath.split('/');
        stack.pop(); // Remove current filename

        const parts = relativePath.split('/');
        for (const part of parts) {
            if (part === '.') continue;
            if (part === '..') {
                if (stack.length > 0) stack.pop();
            } else {
                stack.push(part);
            }
        }
        return stack.join('/');
    }

    private convertToNexusObject(info: FileInfo, content: string, metadata: any): NexusObject {
        let htmlContent = content;

        if (!info.path.endsWith('.html')) {
            // Pre-process WikiLinks
            let processedContent = content.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (match, link, text) => {
                const display = text || link;
                return `[${display}](${link})`;
            });

            // Configure marked
            const renderer = new marked.Renderer();

            renderer.link = ({ href, title, text }) => {
                const linkPath = href;
                const decodedPath = decodeURIComponent(linkPath);

                if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) {
                    return `<a href="${linkPath}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${text}</a>`;
                }

                // Resolve internal link
                // Try exact match first (if absolute path in zip)
                let target = this.fileMap.get(decodedPath);

                // Try resolving relative path
                if (!target) {
                    const resolved = this.resolvePath(info.path, decodedPath);
                    target = this.fileMap.get(resolved);
                }

                // Try adding .md or .html extension
                if (!target) {
                    const resolved = this.resolvePath(info.path, decodedPath);
                    target = this.fileMap.get(resolved + '.md') || this.fileMap.get(resolved + '.html');
                }

                // Fallback: Search by filename (legacy behavior, risky but helpful)
                if (!target) {
                    const searchName = decodedPath.split('/').pop()?.replace(/\.(md|html)$/, '').normalize('NFC').toLowerCase();
                    if (searchName) {
                        for (const [p, i] of this.fileMap.entries()) {
                            const infoName = p.split('/').pop()?.replace(/\.(md|html)$/, '').normalize('NFC').toLowerCase();
                            if (infoName === searchName) {
                                target = i;
                                break;
                            }
                        }
                    }
                }

                if (target) {
                    return `<a data-object-id="${target.id}" class="nexus-mention text-blue-600 hover:underline cursor-pointer">${text}</a>`;
                }

                return `<span class="text-red-400" title="Link not found: ${linkPath}">${text}</span>`;
            };

            renderer.image = ({ href, title, text }) => {
                const decodedHref = decodeURIComponent(href);
                // Resolve path relative to current file
                const resolvedPath = this.resolvePath(info.path, decodedHref);

                // Look up in assetMap using full resolved path
                const newName = this.assetMap.get(resolvedPath);

                if (newName) {
                    return `<img src="asset://${newName}" alt="${text || ''}" class="max-w-full h-auto rounded-lg my-4" />`;
                }
                return `<img src="${href}" alt="${text || ''}" class="max-w-full h-auto rounded-lg my-4" />`;
            };

            marked.use({ renderer });
            htmlContent = marked.parse(processedContent) as string;
        }

        // Convert Metadata
        const nexusMetadata: any[] = [];
        Object.entries(metadata).forEach(([key, value]) => {
            if (key === 'type' || key === 'title' || key === 'tags') return;

            let val = value;
            let type = 'text';

            if (key === 'fecha' && typeof value === 'string') {
                val = value.split(' - ')[0];
                type = 'date';
            } else if (Array.isArray(value)) {
                type = 'multiselect';
            } else if (typeof value === 'string') {
                if (value.startsWith('http')) type = 'url';
                else if (value.includes('@') && value.includes('.')) type = 'email';
            }

            nexusMetadata.push({ key, label: key, value: val, type });
        });



        return {
            id: info.id,
            title: info.title,
            type: info.type as NexusType,
            content: htmlContent,
            lastModified: new Date(),
            tags: Array.isArray(metadata.tags) ? metadata.tags : [],
            metadata: nexusMetadata
        };
    }

    private parseHtmlContent(content: string, info: FileInfo): { metadata: any; body: string } {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        const metadata: any = {};

        // 1. Extract Title
        const title = doc.querySelector('h1')?.textContent || doc.title || 'Untitled';
        metadata.title = title;

        // 2. Extract Properties (Notion specific)
        const propertiesTable = doc.querySelector('.properties');
        if (propertiesTable) {
            propertiesTable.querySelectorAll('tr').forEach(row => {
                const key = row.querySelector('th')?.textContent?.trim();
                const value = row.querySelector('td')?.textContent?.trim();
                if (key && value) {
                    metadata[key.toLowerCase()] = value;
                }
            });
            propertiesTable.remove(); // Remove from body
        }

        // 3. Resolve Links and Images
        doc.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (src) {
                const decodedSrc = decodeURIComponent(src);
                const resolvedPath = this.resolvePath(info.path, decodedSrc);
                const newName = this.assetMap.get(resolvedPath);
                if (newName) {
                    img.setAttribute('src', `asset://${newName}`);
                }
            }
        });

        doc.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href) {
                const decodedHref = decodeURIComponent(href);
                if (!href.startsWith('http')) {
                    // Resolve internal link
                    let target = this.fileMap.get(decodedHref);
                    if (!target) {
                        const resolved = this.resolvePath(info.path, decodedHref);
                        target = this.fileMap.get(resolved);
                    }
                    if (!target) {
                        const resolved = this.resolvePath(info.path, decodedHref);
                        target = this.fileMap.get(resolved + '.html') || this.fileMap.get(resolved + '.md');
                    }

                    if (target) {
                        a.setAttribute('data-object-id', target.id);
                        a.classList.add('nexus-mention');
                        // Remove href or keep it? Keep it for fallback?
                        // Nexus uses data-object-id for navigation.
                    }
                }
            }
        });

        // 4. Extract Body
        // Notion puts content in .page-body usually, or just body
        const bodyContent = doc.querySelector('.page-body')?.innerHTML || doc.body.innerHTML;

        return { metadata, body: bodyContent };
    }

    private parseFrontmatter(content: string): { metadata: any; body: string } {
        const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match) {
            return { metadata: {}, body: content };
        }

        const frontmatterRaw = match[1];
        const body = match[2];
        const metadata: any = {};

        frontmatterRaw.split('\n').forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                let value: any = parts.slice(1).join(':').trim();

                // Handle empty values
                if (!value) {
                    value = '';
                } else if (value === 'null') {
                    value = '';
                }

                // Handle arrays
                if (value.startsWith('[') && value.endsWith(']')) {
                    try {
                        // Try to parse as JSON first to handle quoted strings
                        // Replace single quotes with double quotes for JSON compatibility if needed
                        // But simple split is often safer for malformed YAML
                        value = value.slice(1, -1).split(',').map((s: string) => {
                            s = s.trim();
                            if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                                return s.slice(1, -1);
                            }
                            return s;
                        }).filter((s: string) => s.length > 0);
                    } catch (e) {
                        value = [];
                    }
                } else {
                    // Remove quotes from string values
                    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                }

                metadata[key] = value;
            }
        });

        return { metadata, body };
    }
}

export const importService = new ImportService();
