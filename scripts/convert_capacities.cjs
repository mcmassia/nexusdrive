const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMPORT_DIR = '/Users/mcmassia/.gemini/temp_import/Notas';
const ASSETS_DIR = '/Users/mcmassia/.gemini/temp_import/Notas/Images/Media';
const PUBLIC_ASSETS_DIR = '/Users/mcmassia/Documents/nexusdrive/public/imported_assets';
const OUTPUT_FILE = '/Users/mcmassia/Documents/nexusdrive/public/capacities_import.json';

// Ensure public assets dir exists
if (!fs.existsSync(PUBLIC_ASSETS_DIR)) {
    fs.mkdirSync(PUBLIC_ASSETS_DIR, { recursive: true });
}

// Map Capacities types to Nexus types (fallback)
const TYPE_MAPPING = {
    'Reunion': 'MEETING',
    'Proyecto': 'PROJECT',
    'Persona': 'PERSON',
    'Page': 'PAGE',
    'Idea': 'NOTE',
    'DailyNote': 'PAGE',
    'Organizacion': 'PAGE',
    'Team': 'PAGE'
};

// Helper to generate UUID
function generateId() {
    return crypto.randomUUID();
}

// Helper to parse frontmatter
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
        return { metadata: {}, content: content };
    }

    const frontmatterRaw = match[1];
    const body = match[2];
    const metadata = {};

    frontmatterRaw.split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            let value = parts.slice(1).join(':').trim();

            // Handle arrays [a, b]
            if (value.startsWith('[') && value.endsWith(']')) {
                value = value.slice(1, -1).split(',').map(s => s.trim());
            }

            metadata[key] = value;
        }
    });

    return { metadata, content: body };
}

// 1. Scan all files and build a map of Path -> ID
const fileMap = new Map(); // relativePath -> { id, title, type }
const filesToProcess = [];
const detectedSchemas = new Map(); // type -> { properties: Set<string> }

function scanDir(dir, relativePath = '') {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);

    items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDir(fullPath, path.join(relativePath, item));
        } else if (item.endsWith('.md')) {
            const relPath = path.join(relativePath, item);
            const id = generateId();

            // Read basic info for mapping
            const content = fs.readFileSync(fullPath, 'utf8');
            const { metadata } = parseFrontmatter(content);
            const title = metadata.title || item.replace('.md', '');
            const originalType = metadata.type || 'Page';

            // Collect schema info
            if (!detectedSchemas.has(originalType)) {
                detectedSchemas.set(originalType, new Set());
            }
            Object.keys(metadata).forEach(key => {
                if (key !== 'type' && key !== 'title') {
                    detectedSchemas.get(originalType).add(key);
                }
            });

            fileMap.set(relPath, { id, title, type: originalType });
            filesToProcess.push({ fullPath, relPath, id, title, type: originalType, metadata, content });
        }
    });
}

console.log('Scanning files...');
scanDir(IMPORT_DIR);
console.log(`Found ${filesToProcess.length} files.`);

// 2. Process Assets
console.log('Processing assets...');
const assetMap = new Map(); // originalName -> newFileName

if (fs.existsSync(ASSETS_DIR)) {
    const assets = fs.readdirSync(ASSETS_DIR);
    assets.forEach(asset => {
        const srcPath = path.join(ASSETS_DIR, asset);
        // Sanitize filename
        const ext = path.extname(asset);
        const name = path.basename(asset, ext).replace(/[^a-z0-9]/gi, '_');
        const newName = `${name}_${Date.now()}${ext}`;
        const destPath = path.join(PUBLIC_ASSETS_DIR, newName);

        fs.copyFileSync(srcPath, destPath);
        assetMap.set(asset, newName);
    });
    console.log(`Copied ${assetMap.size} assets.`);
}

// 3. Generate Schemas
const schemas = [];
detectedSchemas.forEach((props, type) => {
    const properties = Array.from(props).map(key => {
        // Infer type based on key name or values (simplified)
        let propType = 'text';
        if (key.includes('date') || key.includes('fecha') || key === 'createdAt') propType = 'date';
        if (key === 'tags') propType = 'tags'; // Special handling
        if (key === 'organizaciones' || key === 'personasInvolucradas') propType = 'multiselect';

        return {
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            type: propType,
            required: false
        };
    });

    // Add default properties if missing
    if (!properties.find(p => p.key === 'date')) {
        properties.push({ key: 'date', label: 'Date', type: 'date', required: false });
    }

    schemas.push({
        type: type, // Use original Capacities type name
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        properties
    });
});

// 4. Process files and convert content
const nexusObjects = filesToProcess.map(file => {
    const { metadata, content } = parseFrontmatter(fs.readFileSync(file.fullPath, 'utf8'));

    // Pre-process WikiLinks [[Title]] -> [Title](Title)
    // This handles simple [[Title]] and [[Title|Alias]]
    let processedContent = content.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (match, link, text) => {
        const display = text || link;
        return `[${display}](${link})`;
    });

    // Convert Markdown to HTML using marked
    const marked = require('marked');
    const renderer = new marked.Renderer();

    // Custom Link Renderer
    renderer.link = ({ href, title, text }) => {
        const linkPath = href;
        const decodedPath = decodeURIComponent(linkPath);

        // Check if it's an external link
        if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) {
            return `<a href="${linkPath}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${text}</a>`;
        }

        let target = fileMap.get(decodedPath);

        // Try to find by relative path or basename
        if (!target) {
            // 1. Try adding .md extension
            target = fileMap.get(decodedPath + '.md');
        }

        if (!target) {
            // 2. Search by basename (ignoring extension)
            const searchName = path.basename(decodedPath, path.extname(decodedPath)).toLowerCase();

            for (const [p, info] of fileMap.entries()) {
                const infoName = path.basename(p, path.extname(p)).toLowerCase();
                if (infoName === searchName) {
                    target = info;
                    break;
                }
            }
        }

        if (target) {
            // ADDED nexus-mention class here!
            return `<a data-object-id="${target.id}" class="nexus-mention text-blue-600 hover:underline cursor-pointer">${text}</a>`;
        }

        // Fallback: return broken link style
        return `<span class="text-red-400" title="Link not found: ${linkPath}">${text}</span>`;
    };

    // Custom Image Renderer
    renderer.image = ({ href, title, text }) => {
        const imgPath = href;
        const basename = path.basename(imgPath);
        const newName = assetMap.get(basename);

        if (newName) {
            return `<img src="/imported_assets/${newName}" alt="${text || ''}" class="max-w-full h-auto rounded-lg my-4" />`;
        }
        return `<img src="${href}" alt="${text || ''}" class="max-w-full h-auto rounded-lg my-4" />`;
    };

    marked.use({ renderer });

    // Process content with marked
    // Note: marked returns a promise if async is on, but by default it's sync. 
    // However, in newer versions it might be async? Let's check usage. 
    // marked.parse(markdown, options) -> string
    const htmlContent = marked.parse(processedContent);

    // Convert metadata
    const nexusMetadata = [];
    Object.entries(metadata).forEach(([key, value]) => {
        if (key === 'type' || key === 'title' || key === 'tags') return;

        let val = value;
        let type = 'text';

        // Handle specific fields
        if (key === 'fecha' && typeof value === 'string') {
            const dateParts = value.split(' - ');
            val = dateParts[0];
            type = 'date';
        } else if (Array.isArray(value)) {
            type = 'multiselect';
        } else if (typeof value === 'string') {
            // Check for Markdown links in metadata: [Title](url)
            const mdLinkMatch = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (mdLinkMatch) {
                val = mdLinkMatch[2]; // Use the URL
                type = 'url';
            } else if (value.startsWith('http://') || value.startsWith('https://')) {
                type = 'url';
            } else if (value.includes('@') && value.includes('.')) {
                // Simple email check
                type = 'email';
            }
        }

        nexusMetadata.push({ key, label: key, value: val, type });
    });

    // Ensure date property exists
    if (!nexusMetadata.find(m => m.key === 'date')) {
        nexusMetadata.push({ key: 'date', label: 'Date', value: new Date().toISOString(), type: 'date' });
    }

    return {
        id: file.id,
        title: file.title,
        type: file.type, // Use original type
        content: htmlContent,
        lastModified: new Date(),
        tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        metadata: nexusMetadata
    };
});

// 5. Write JSON
const output = {
    schemas,
    objects: nexusObjects
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log(`Wrote ${schemas.length} schemas and ${nexusObjects.length} objects to ${OUTPUT_FILE}`);
