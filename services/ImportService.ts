import JSZip from 'jszip';
import { marked } from 'marked';
import { NexusObject, TypeSchema, NexusType } from '../types';

interface ImportResult {
    schemas: TypeSchema[];
    objects: NexusObject[];
    assets: Map<string, Blob>; // filename -> blob
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

    async processZip(file: File): Promise<ImportResult> {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);

        const filesToProcess: { path: string; content: string; metadata: any }[] = [];
        const detectedSchemas = new Map<string, Set<string>>();
        const assets = new Map<string, Blob>();

        // 1. Scan files
        for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
            if (zipEntry.dir) continue;

            // Ignore __MACOSX and hidden files
            if (relativePath.includes('__MACOSX') || relativePath.startsWith('.')) continue;

            if (relativePath.endsWith('.md')) {
                const content = await zipEntry.async('string');
                const { metadata, body } = this.parseFrontmatter(content);

                const id = crypto.randomUUID();
                const title = metadata.title || relativePath.split('/').pop()?.replace('.md', '') || 'Untitled';
                const type = metadata.type || 'Page';

                // Map file info
                this.fileMap.set(relativePath, { id, title, type, path: relativePath });

                // Collect schema info
                if (!detectedSchemas.has(type)) {
                    detectedSchemas.set(type, new Set());
                }
                Object.keys(metadata).forEach(key => {
                    if (key !== 'type' && key !== 'title') {
                        detectedSchemas.get(type)?.add(key);
                    }
                });

                filesToProcess.push({ path: relativePath, content: body, metadata });
            } else {
                // Asset file (image, pdf, etc.)
                // Assuming assets are in Images/ or similar, or just treat all non-md as assets
                const blob = await zipEntry.async('blob');
                const ext = relativePath.split('.').pop() || '';
                const name = relativePath.split('/').pop()?.replace(`.${ext}`, '') || 'asset';
                // Sanitize name
                const safeName = name.replace(/[^a-z0-9]/gi, '_');
                const newName = `${safeName}_${Date.now()}.${ext}`;

                this.assetMap.set(relativePath.split('/').pop()!, newName);
                assets.set(newName, blob);
            }
        }

        // 2. Generate Schemas
        const schemas: TypeSchema[] = [];
        detectedSchemas.forEach((props, type) => {
            const properties = Array.from(props).map(key => {
                let propType: any = 'text';
                if (key.includes('date') || key.includes('fecha') || key === 'createdAt') propType = 'date';
                if (key === 'tags') propType = 'multiselect'; // Treat tags as multiselect for now? Or specific tags type?
                if (key === 'organizaciones' || key === 'personasInvolucradas') propType = 'multiselect';

                // Check values in files to refine type? (Skipped for simplicity)

                return {
                    key,
                    label: key.charAt(0).toUpperCase() + key.slice(1),
                    type: propType,
                    required: false
                };
            });

            // Ensure date property
            if (!properties.find(p => p.key === 'date')) {
                properties.push({ key: 'date', label: 'Date', type: 'date', required: false });
            }

            schemas.push({
                type: type,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                properties
            });
        });

        // 3. Process Content & Convert
        const objects: NexusObject[] = filesToProcess.map(file => {
            const info = this.fileMap.get(file.path)!;

            // Pre-process WikiLinks
            let processedContent = file.content.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (match, link, text) => {
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
                let target = this.fileMap.get(decodedPath);

                if (!target) {
                    target = this.fileMap.get(decodedPath + '.md');
                }

                if (!target) {
                    // Search by basename (ignoring extension and case)
                    // decodedPath might be "Folder/File" or just "File"
                    // Normalize to NFC to handle Mac/Windows accent differences
                    const searchName = decodedPath.split('/').pop()?.replace('.md', '').normalize('NFC').toLowerCase();

                    if (searchName) {
                        for (const [p, i] of this.fileMap.entries()) {
                            // Normalize file path from map as well
                            const infoName = p.split('/').pop()?.replace('.md', '').normalize('NFC').toLowerCase();
                            if (infoName === searchName) {
                                target = i;
                                break;
                            }
                        }
                    }
                }

                if (target) {
                    // Add nexus-mention class for interactivity
                    return `<a data-object-id="${target.id}" class="nexus-mention text-blue-600 hover:underline cursor-pointer">${text}</a>`;
                }

                return `<span class="text-red-400" title="Link not found: ${linkPath}">${text}</span>`;
            };

            renderer.image = ({ href, title, text }) => {
                const basename = href.split('/').pop()!;
                const newName = this.assetMap.get(basename);

                // For client-side blob URLs, we'll need to handle this later.
                // For now, store the filename. The UI will need to resolve this to a Blob URL or we upload to public folder?
                // Since this is client-side, we can't write to public folder.
                // We will store assets in IndexedDB or use ObjectURLs.
                // Let's assume we store them in IDB and serve via a custom handler or just use base64?
                // Base64 is easiest for small apps but heavy.
                // Let's use a placeholder and handle asset saving in the main component.

                if (newName) {
                    return `<img src="asset://${newName}" alt="${text || ''}" class="max-w-full h-auto rounded-lg my-4" />`;
                }
                return `<img src="${href}" alt="${text || ''}" class="max-w-full h-auto rounded-lg my-4" />`;
            };

            marked.use({ renderer });
            const htmlContent = marked.parse(processedContent) as string;

            // Convert Metadata
            const nexusMetadata: any[] = [];
            Object.entries(file.metadata).forEach(([key, value]) => {
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

            if (!nexusMetadata.find(m => m.key === 'date')) {
                nexusMetadata.push({ key: 'date', label: 'Date', value: new Date().toISOString(), type: 'date' });
            }

            return {
                id: info.id,
                title: info.title,
                type: info.type as NexusType, // Cast or map
                content: htmlContent,
                lastModified: new Date(),
                tags: Array.isArray(file.metadata.tags) ? file.metadata.tags : [],
                metadata: nexusMetadata
            };
        });

        return { schemas, objects, assets };
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
