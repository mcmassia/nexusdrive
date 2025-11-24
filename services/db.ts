import { openDB, IDBPDatabase, deleteDB, DBSchema } from 'idb';
import { NexusObject, NexusType, GraphNode, GraphLink, TypeSchema, PropertyDefinition } from '../types';
import { INITIAL_OBJECTS, INITIAL_LINKS } from '../constants';
import { driveService } from './driveService';
import { authService } from './authService';

// IndexedDB Schema
interface NexusDB extends DBSchema {
  objects: {
    key: string;
    value: NexusObject & { driveFileId?: string };
    indexes: { 'by-type': NexusType; 'by-date': Date; 'by-drive-id': string };
  };
  links: {
    key: string;
    value: { id: string; source: string; target: string; type: string };
  };
  sync_metadata: {
    key: string;
    value: { key: string; value: any };
  };
  typeSchemas: {
    key: string;
    value: TypeSchema;
  };
}

/**
 * Enhanced Local Database with IndexedDB persistence and Drive sync
 * Implements the "Capa de Sincronización e Inteligencia" from NexusDrive spec
 */
class LocalDatabase {
  private db: IDBPDatabase<NexusDB> | null = null;
  private syncInterval: number | null = null;
  private isInitialized = false;

  constructor() {
    this.init();

    // Re-initialize Drive when token is received after initial load
    if (typeof window !== 'undefined') {
      window.addEventListener('nexus-token-received', () => {
        console.log('🔄 [LocalDB] Token received, re-initializing Drive...');
        this.startSyncLoop().catch(err =>
          console.error('[LocalDB] Failed to re-initialize sync:', err)
        );
      });
    }
  }

  private async init() {
    try {
      // Open IndexedDB
      this.db = await openDB<NexusDB>('nexus-db', 4, {
        upgrade(db, oldVersion, newVersion, transaction) {
          console.log(`[LocalDB] Upgrading database from version ${oldVersion} to ${newVersion}`);

          // Objects store
          if (!db.objectStoreNames.contains('objects')) {
            const objectStore = db.createObjectStore('objects', { keyPath: 'id' });
            objectStore.createIndex('by-type', 'type');
            objectStore.createIndex('by-date', 'lastModified');
            objectStore.createIndex('by-drive-id', 'driveFileId');
          } else {
            // Upgrade existing store
            const objectStore = transaction.objectStore('objects');
            if (!objectStore.indexNames.contains('by-drive-id')) {
              objectStore.createIndex('by-drive-id', 'driveFileId');
              console.log('[LocalDB] Created by-drive-id index');
            }
          }

          // Links store
          if (!db.objectStoreNames.contains('links')) {
            db.createObjectStore('links', { keyPath: 'id' });
          }

          // Sync metadata store
          if (!db.objectStoreNames.contains('sync_metadata')) {
            db.createObjectStore('sync_metadata', { keyPath: 'key' });
          }

          // NEW in v2: Type schemas store
          if (!db.objectStoreNames.contains('typeSchemas')) {
            db.createObjectStore('typeSchemas', { keyPath: 'type' });
            console.log('[LocalDB] Created typeSchemas store');
          }
        },
      });

      // Load initial data ONLY if database is empty AND in demo mode
      const count = await this.db.count('objects');
      if (count === 0 && authService.isInDemoMode()) {
        console.log('[LocalDB] Loading initial demo data (demo mode)');
        await this.loadInitialData();
      } else if (count === 0) {
        console.log('[LocalDB] Database empty but user is authenticated - waiting for Drive sync');
      }

      this.isInitialized = true;
      console.log('[LocalDB] Initialized with IndexedDB');

      // Initialize default type schemas
      await this.initializeDefaultSchemas();

      // Start sync loop if not in demo mode
      if (!authService.isInDemoMode()) {
        await this.startSyncLoop();
      }
    } catch (error) {
      console.error('[LocalDB] Failed to initialize IndexedDB:', error);
      // Fallback to in-memory storage (current implementation)
      this.isInitialized = false;
    }
  }

  private async loadInitialData() {
    if (!this.db) return;

    const tx = this.db.transaction(['objects', 'links'], 'readwrite');

    for (const obj of INITIAL_OBJECTS) {
      await tx.objectStore('objects').add(obj);
    }

    for (const link of INITIAL_LINKS) {
      await tx.objectStore('links').add({
        ...link,
        id: `${link.source}-${link.target}`,
        source: link.source as string,
        target: link.target as string
      });
    }

    await tx.done;
  }

  /**
   * Start background sync loop with Drive
   */
  private async startSyncLoop() {
    console.log('🔍 [LocalDB] Starting sync loop...');
    console.log('🔍 [LocalDB] Is demo mode?', authService.isInDemoMode());
    console.log('🔍 [LocalDB] Has token?', !!authService.getAccessToken());
    console.log('🔍 [LocalDB] Token value:', authService.getAccessToken()?.substring(0, 20) + '...');

    try {
      // Initialize Drive service
      console.log('🔍 [LocalDB] Calling driveService.initialize()...');
      await driveService.initialize();

      // Initial sync from Drive to Local
      await this.syncFromDrive();

      // DISABLED: Automatic sync every 30 seconds
      // This was causing conflicts where Drive changes would overwrite user edits
      // Sync now only happens on manual save
      /*
      this.syncInterval = window.setInterval(() => {
        this.syncFromDrive().catch(err =>
          console.error('[LocalDB] Sync error:', err)
        );
      }, 30000);
      */

      console.log('[LocalDB] Sync initialization complete (automatic sync disabled)');
    } catch (error) {
      console.error('[LocalDB] Failed to start sync:', error);
      console.warn('[LocalDB] Will operate in local-only mode until Drive is available');
      // Don't throw - allow app to work in local-only mode
    }
  }

  /**
   * Sync objects from Drive to local IndexedDB
   * Public method to allow manual sync from UI
   */
  async syncFromDrive() {
    if (!this.db || authService.isInDemoMode()) return;

    try {
      const changes = await driveService.fetchChanges();

      for (const change of changes.changes) {
        if (change.removed) {
          // File was deleted in Drive
          // Use the index to find the local object by Drive ID
          const localObj = await this.db.getFromIndex('objects', 'by-drive-id', change.fileId);

          if (localObj) {
            await this.db.delete('objects', localObj.id);
            console.log(`[LocalDB] Removed object ${localObj.id} (Drive ID: ${change.fileId})`);
          } else {
            console.log(`[LocalDB] Could not find local object for deleted Drive file ${change.fileId}`);
          }
        } else if (change.file) {
          // Skip folders - don't sync them
          if (change.file.mimeType === 'application/vnd.google-apps.folder') {
            console.log(`[LocalDB] Skipping folder: ${change.file.name}`);
            continue;
          }

          // File was created or updated
          const obj = await driveService.readObject(change.fileId);
          if (obj) {
            // Check if we already have this object to preserve any local-only state if needed
            // For now, Drive wins
            await this.db.put('objects', { ...obj, driveFileId: change.fileId });
            console.log(`[LocalDB] Synced object ${obj.id} from Drive`);
          }
        }
      }
    } catch (error) {
      console.error('[LocalDB] Sync from Drive failed:', error);
    }
  }

  /**
   * Get all objects
   */
  async getObjects(): Promise<NexusObject[]> {
    if (!this.db) {
      // Fallback to in-memory for demo mode
      return [...INITIAL_OBJECTS];
    }

    try {
      const objects = await this.db.getAll('objects');
      return objects.map(obj => {
        const { driveFileId, ...nexusObj } = obj;
        return nexusObj;
      });
    } catch (error) {
      console.error('[LocalDB] Failed to get objects:', error);
      return [];
    }
  }

  async getObjectById(id: string): Promise<NexusObject | null> {
    if (!this.db) {
      console.warn('[LocalDB] Database not initialized');
      return null;
    }

    try {
      const obj = await this.db.get('objects', id);
      if (obj) {
        console.log(`[LocalDB] getObjectById(${id}):`, {
          title: obj.title,
          driveFileId: obj.driveFileId,
          hasProperty: obj.hasOwnProperty('driveFileId'),
          keys: Object.keys(obj)
        });
      }
      return obj || null;
    } catch (error) {
      console.error(`[LocalDB] Error getting object ${id}:`, error);
      return null;
    }
  }

  async getGraphData(): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
    const objects = await this.getObjects();
    const nodes: GraphNode[] = objects.map(obj => ({
      id: obj.id,
      title: obj.title,
      type: obj.type,
      group: obj.type,
      val: 5
    }));

    // Extract links from mentions and tags
    const links: GraphLink[] = [];
    const nodeIds = new Set(nodes.map(n => n.id)); // Valid node IDs

    for (const obj of objects) {
      // Parse content for mentions (data-object-id)
      const mentionRegex = /data-object-id="([^"]+)"/g;
      let match;
      while ((match = mentionRegex.exec(obj.content)) !== null) {
        const targetId = match[1];
        // Only add link if both source and target nodes exist
        if (nodeIds.has(targetId)) {
          links.push({
            source: obj.id,
            target: targetId,
            type: 'mention'
          });
        }
      }

      // Also check for old-style data-id links
      const linkRegex = /data-id="([^"]+)"/g;
      while ((match = linkRegex.exec(obj.content)) !== null) {
        const targetId = match[1];
        if (nodeIds.has(targetId)) {
          links.push({
            source: obj.id,
            target: targetId,
            type: 'link'
          });
        }
      }

      // Extract links from metadata properties (document and documents types)
      for (const prop of obj.metadata) {
        if (prop.type === 'document' && typeof prop.value === 'string' && prop.value) {
          // Single document reference
          if (nodeIds.has(prop.value)) {
            links.push({
              source: obj.id,
              target: prop.value,
              type: 'property'
            });
          }
        } else if (prop.type === 'documents' && Array.isArray(prop.value)) {
          // Multiple document references
          for (const targetId of prop.value) {
            if (typeof targetId === 'string' && nodeIds.has(targetId)) {
              links.push({
                source: obj.id,
                target: targetId,
                type: 'property'
              });
            }
          }
        }
      }
    }

    console.log(`[LocalDB] Graph: ${nodes.length} nodes, ${links.length} valid links`);
    return { nodes, links };
  }

  /**
   * Save object (with Drive sync if enabled)
   */
  async saveObject(updatedObject: NexusObject): Promise<void> {
    if (!this.db) {
      // Demo mode: just log
      console.log(`📝[LocalDB] Demo mode: Object ${updatedObject.id} saved(in -memory only)`);
      return;
    }

    try {
      // Get existing object to check if it has a Drive file ID
      const existing = await this.db.get('objects', updatedObject.id);
      const driveFileId = existing?.driveFileId;

      // Save to local DB
      await this.db.put('objects', { ...updatedObject, driveFileId });
      console.log(`✅[LocalDB] Object "${updatedObject.title}" saved locally`);

      // Sync to Drive if not in demo mode
      if (!authService.isInDemoMode()) {
        console.log(`🔄[LocalDB] Syncing "${updatedObject.title}" to Drive...`);
        try {
          if (driveFileId) {
            // Update existing file in Drive
            console.log(`📤[LocalDB] Updating existing Drive file ${driveFileId}...`);
            await driveService.updateObject(driveFileId, updatedObject);
            console.log(`✅[LocalDB] Updated in Drive successfully`);
          } else {
            // Create new file in Drive
            console.log(`📤[LocalDB] Creating new file in Drive...`);
            const newFileId = await driveService.createObject(updatedObject);
            console.log(`📝[LocalDB] Received Drive file ID: ${newFileId}`);

            // Update local DB with Drive file ID
            const objWithDriveId = { ...updatedObject, driveFileId: newFileId };
            await this.db.put('objects', objWithDriveId);
            console.log(`✅[LocalDB] Created in Drive with ID: ${newFileId}`);
            console.log(`📊[LocalDB] Saved object with driveFileId:`, objWithDriveId.driveFileId);
            console.log(`🎉[LocalDB] Object synced! Check your Google Drive > Nexus folder`);
          }
        } catch (driveError) {
          console.error('❌ [LocalDB] Failed to sync to Drive:', driveError);
          if (driveError instanceof Error) {
            console.error('Drive error details:', driveError.message);
          }
          // Continue - object is saved locally at least
        }
      }
    } catch (error) {
      console.error('❌ [LocalDB] Failed to save object:', error);
      throw error;
    }
  }

  async deleteObject(id: string): Promise<void> {
    if (!this.db) {
      console.log(`🗑️[LocalDB] Demo mode: Cannot delete object ${id} (in -memory only)`);
      throw new Error('Cannot delete in demo mode');
    }

    try {
      // Get the object first to get Drive file ID
      const obj = await this.db.get('objects', id);

      if (!obj) {
        throw new Error('Object not found');
      }

      // Delete from local DB first
      await this.db.delete('objects', id);
      console.log(`✅[LocalDB] Object "${obj.title}" deleted locally`);

      // Delete from Drive if synced
      if (!authService.isInDemoMode() && obj.driveFileId) {
        console.log(`🗑️[LocalDB] Deleting from Drive(ID: ${obj.driveFileId})...`);
        try {
          // Check if it's a system folder - DON'T DELETE
          const fileInfo = await driveService.getFileInfo(obj.driveFileId);
          if (fileInfo?.mimeType === 'application/vnd.google-apps.folder') {
            console.warn(`[LocalDB] Prevented deletion of system folder: ${fileInfo.name} `);
            return; // Don't delete folders
          }

          await driveService.deleteObject(obj.driveFileId);
          console.log(`✅[LocalDB] Deleted from Drive successfully`);
        } catch (driveError) {
          console.error('❌ [LocalDB] Failed to delete from Drive:', driveError);
          // Already deleted locally, so just log the error
        }
      }
    } catch (error) {
      console.error('❌ [LocalDB] Failed to delete object:', error);
      throw error;
    }
  }

  /**
   * Vector search (simulated for now)
   */
  async vectorSearch(query: string): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    const lowerQuery = query.toLowerCase();

    return objects.filter(obj =>
      obj.title.toLowerCase().includes(lowerQuery) ||
      obj.content.toLowerCase().includes(lowerQuery) ||
      obj.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }

  // Dashboard methods
  async getRecents(limit: number = 5, excludeId?: string): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    return objects
      .filter(o => o.id !== excludeId)
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, limit);
  }

  async getUpcomingMeetings(): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    return objects
      .filter(o => o.type === NexusType.MEETING)
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 5);
  }

  async getOrCreateDailyNote(): Promise<NexusObject> {
    const today = new Date().toISOString().split('T')[0];
    const id = `daily - ${today} `;

    let note = await this.getObjectById(id);

    if (!note) {
      note = {
        id: id,
        title: `Daily Note: ${today} `,
        type: NexusType.PAGE,
        content: `< h1 > Daily Log: ${today} </h1><p>What's on your mind today? Type @ to link ideas or # to tag.</p > `,
        lastModified: new Date(),
        tags: ['daily-journal'],
        metadata: [
          { key: 'date', label: 'Date', value: today, type: 'date' }
        ]
      };
      await this.saveObject(note);
    }
    return note;
  }

  // Sidebar calendar methods
  async getActiveDates(): Promise<string[]> {
    const objects = await this.getObjects();
    const dates = new Set<string>();

    objects.forEach(obj => {
      if (obj.lastModified) {
        dates.add(new Date(obj.lastModified).toISOString().split('T')[0]);
      }
      obj.metadata.forEach(meta => {
        if (meta.type === 'date' && meta.value) {
          dates.add(meta.value as string);
        }
      });
    });
    return Array.from(dates);
  }

  async getObjectsByDate(dateStr: string): Promise<NexusObject[]> {
    const objects = await this.getObjects();
    return objects.filter(obj => {
      const modDate = new Date(obj.lastModified).toISOString().split('T')[0];
      if (modDate === dateStr) return true;
      return obj.metadata.some(m => m.type === 'date' && m.value === dateStr);
    });
  }

  async getAllTags(): Promise<string[]> {
    const objects = await this.getObjects();
    const tags = new Set<string>();
    objects.forEach(obj => {
      obj.tags.forEach(t => tags.add(t));
    });
    return Array.from(tags);
  }

  /**
   * Clear all local data and reinitialize
   */
  async clearCache(): Promise<void> {
    if (!this.db) {
      console.log('[LocalDB] No database to clear (demo mode)');
      return;
    }

    try {
      console.log('[LocalDB] Clearing local cache...');

      // Close the database
      this.db.close();

      // Delete the database
      await deleteDB('nexusDB');

      console.log('✅ [LocalDB] Cache cleared successfully');

      // Reinitialize
      this.db = null;
      await this.init();

      console.log('✅ [LocalDB] Database reinitialized');
    } catch (error) {
      console.error('❌ [LocalDB] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Cleanup on app shutdown
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.db?.close();
    console.log('[LocalDB] Closed');
  }
  /**
   * TYPE SCHEMA METHODS
   */
  async getTypeSchema(type: string): Promise<TypeSchema | null> {
    if (!this.db) return null;
    try {
      const schema = await this.db.get('typeSchemas', type);
      return schema || null;
    } catch (error) {
      console.error('[LocalDB] Failed to get type schema:', error);
      return null;
    }
  }

  async saveTypeSchema(schema: TypeSchema): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.put('typeSchemas', schema);
      console.log(`[LocalDB] Saved schema for type: ${schema.type} `);
    } catch (error) {
      console.error('[LocalDB] Failed to save type schema:', error);
      throw error;
    }
  }

  async getAllTypeSchemas(): Promise<TypeSchema[]> {
    if (!this.db) return [];
    try {
      return await this.db.getAll('typeSchemas');
    } catch (error) {
      console.error('[LocalDB] Failed to get all type schemas:', error);
      return [];
    }
  }

  async deleteTypeSchema(type: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    try {
      await this.db.delete('typeSchemas', type);
      console.log(`[LocalDB] Deleted schema for type: ${type} `);
    } catch (error) {
      console.error('[LocalDB] Failed to delete type schema:', error);
      throw error;
    }
  }

  async initializeDefaultSchemas(): Promise<void> {
    const defaultSchemas: TypeSchema[] = [
      {
        type: NexusType.PERSON,
        properties: [
          { key: 'fullName', label: 'Full Name', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'birthdate', label: 'Birth Date', type: 'date' }
        ]
      },
      {
        type: NexusType.MEETING,
        properties: [
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'location', label: 'Location', type: 'text' },
          { key: 'attendees', label: 'Attendees', type: 'documents', allowedTypes: [NexusType.PERSON] }
        ]
      },
      {
        type: NexusType.PROJECT,
        properties: [
          { key: 'status', label: 'Status', type: 'text', defaultValue: 'Planning' },
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'endDate', label: 'End Date', type: 'date' },
          { key: 'owner', label: 'Owner', type: 'document', allowedTypes: [NexusType.PERSON] },
          { key: 'budget', label: 'Budget', type: 'number' }
        ]
      },
      {
        type: NexusType.PAGE,
        properties: []
      }
    ];

    for (const schema of defaultSchemas) {
      const existing = await this.getTypeSchema(schema.type);
      if (!existing) {
        await this.saveTypeSchema(schema);
      }
    }

    console.log('[LocalDB] Initialized default type schemas');
  }
}

export const db = new LocalDatabase();