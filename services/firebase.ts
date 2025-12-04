import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    Firestore,
    doc,
    setDoc,
    getDoc,
    collection,
    onSnapshot,
    query,
    where,
    writeBatch,
    Timestamp,
    enableIndexedDbPersistence
} from 'firebase/firestore';
import {
    getAuth,
    Auth,
    GoogleAuthProvider,
    signInWithCredential,
    User
} from 'firebase/auth';
import { NexusObject, TypeSchema, AppPreferences, TagConfig } from '../types';
import { authService } from './authService';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);

// Enable Offline Persistence
if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('🔥 [Firebase] Persistence failed: Multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.warn('🔥 [Firebase] Persistence not supported by browser');
        }
    });
}

export class FirebaseService {
    private userId: string | null = null;
    private unsubscribers: (() => void)[] = [];

    constructor() {
        // Listen to auth changes from our main auth service
        if (typeof window !== 'undefined') {
            window.addEventListener('nexus-auth-change', (e: any) => {
                const user = e.detail;
                if (user && user.accessToken) {
                    this.signInWithGoogleToken(user.accessToken);
                } else {
                    this.signOut();
                }
            });

            // Check initial state
            const token = authService.getAccessToken();
            if (token) {
                this.signInWithGoogleToken(token);
            }
        }
    }

    /**
     * Authenticate with Firebase using the Google Access Token from Drive API
     */
    async signInWithGoogleToken(accessToken: string) {
        try {
            console.log('🔥 [Firebase] Signing in with Google Access Token...');
            const credential = GoogleAuthProvider.credential(null, accessToken);
            const result = await signInWithCredential(auth, credential);
            this.userId = result.user.uid;
            console.log('🔥 [Firebase] Signed in as:', this.userId);

            // Start syncing
            this.startSync();
        } catch (error) {
            console.error('🔥 [Firebase] Auth failed:', error);
        }
    }

    async signOut() {
        await auth.signOut();
        this.userId = null;
        this.stopSync();
        console.log('🔥 [Firebase] Signed out');
    }

    private stopSync() {
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
    }

    private startSync() {
        if (!this.userId) return;
        this.stopSync(); // Clear existing listeners

        console.log('🔥 [Firebase] Starting real-time sync...');

        // 1. Sync Schemas
        const schemasRef = collection(db, `users/${this.userId}/schemas`);
        const unsubSchemas = onSnapshot(schemasRef, (snapshot) => {
            const schemas: TypeSchema[] = [];
            snapshot.forEach(doc => schemas.push(doc.data() as TypeSchema));
            console.log(`🔥 [Firebase] Received ${schemas.length} schemas`);
            window.dispatchEvent(new CustomEvent('nexus-firebase-schemas', { detail: schemas }));
        });
        this.unsubscribers.push(unsubSchemas);

        // 2. Sync Tag Configs
        const tagsRef = collection(db, `users/${this.userId}/tagConfigs`);
        const unsubTags = onSnapshot(tagsRef, (snapshot) => {
            const tags: TagConfig[] = [];
            snapshot.forEach(doc => tags.push(doc.data() as TagConfig));
            console.log(`🔥 [Firebase] Received ${tags.length} tag configs`);
            window.dispatchEvent(new CustomEvent('nexus-firebase-tags', { detail: tags }));
        });
        this.unsubscribers.push(unsubTags);

        // 3. Sync Document Metadata (NOT content)
        const docsRef = collection(db, `users/${this.userId}/documents`);
        const unsubDocs = onSnapshot(docsRef, (snapshot) => {
            const docs: Partial<NexusObject>[] = [];
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' || change.type === 'modified') {
                    docs.push(change.doc.data() as Partial<NexusObject>);
                }
            });

            if (docs.length > 0) {
                console.log(`🔥 [Firebase] Received updates for ${docs.length} documents`);
                window.dispatchEvent(new CustomEvent('nexus-firebase-docs', { detail: docs }));
            }
        });
        this.unsubscribers.push(unsubDocs);
    }

    // --- Write Operations ---

    async saveSchema(schema: TypeSchema) {
        if (!this.userId) return;
        const ref = doc(db, `users/${this.userId}/schemas`, schema.type);
        await setDoc(ref, schema);
        console.log(`🔥 [Firebase] Saved schema: ${schema.type}`);
    }

    async saveTagConfig(config: TagConfig) {
        if (!this.userId) return;
        const ref = doc(db, `users/${this.userId}/tagConfigs`, config.name);
        await setDoc(ref, config);
        console.log(`🔥 [Firebase] Saved tag config: ${config.name}`);
    }

    async saveDocumentMetadata(obj: NexusObject) {
        if (!this.userId) return;

        // We only save metadata, NOT the full content if it's large
        // But for searchability, maybe we want some content? 
        // For now, let's strip content to keep Firestore light and use Drive for content.
        // Wait, the user wants "persistence layer". 
        // If we strip content, we still need to fetch from Drive.
        // Let's store essential metadata + driveFileId.

        const metadata = {
            id: obj.id,
            title: obj.title,
            type: obj.type,
            tags: obj.tags || [],
            metadata: obj.metadata || [],
            lastModified: obj.lastModified,
            driveFileId: obj.driveFileId || null,
            driveWebViewLink: obj.driveWebViewLink || null,
            isStub: !!obj.isStub
        };

        // Deeply remove undefined values
        const cleanData = JSON.parse(JSON.stringify(metadata));

        const ref = doc(db, `users/${this.userId}/documents`, obj.id);
        await setDoc(ref, cleanData, { merge: true });
        console.log(`🔥 [Firebase] Saved metadata for: ${obj.title}`);
    }

    /**
     * Migration: Sync all local data to Firebase
     * Call this to populate a fresh Firebase project with existing local/Drive data
     */
    async syncAllToFirebase(
        objects: NexusObject[],
        schemas: TypeSchema[],
        tagConfigs: TagConfig[]
    ) {
        if (!this.userId) {
            console.error('🔥 [Firebase] Cannot sync: Not authenticated');
            return;
        }

        console.log(`🔥 [Firebase] Starting full migration...`);
        console.log(`🔥 [Firebase] Authenticated User ID: ${this.userId}`);

        const batch = writeBatch(db);
        let operationCount = 0;
        const BATCH_LIMIT = 450;

        // 1. Schemas
        for (const schema of schemas) {
            const ref = doc(db, `users/${this.userId}/schemas`, schema.type);
            batch.set(ref, schema);
            operationCount++;
        }

        // 2. Tags
        for (const tag of tagConfigs) {
            const ref = doc(db, `users/${this.userId}/tagConfigs`, tag.name);
            batch.set(ref, tag);
            operationCount++;
        }

        if (operationCount > 0) {
            await batch.commit();
            console.log('🔥 [Firebase] Committed schemas and tags');
            operationCount = 0;
        }

        // 3. Documents (Chunked)
        let docBatch = writeBatch(db);
        let docCount = 0;

        for (const obj of objects) {
            const metadata = {
                id: obj.id,
                title: obj.title,
                type: obj.type,
                tags: obj.tags || [],
                metadata: obj.metadata || [],
                lastModified: obj.lastModified,
                driveFileId: obj.driveFileId || null,
                driveWebViewLink: obj.driveWebViewLink || null,
                isStub: !!obj.isStub
            };
            // Deeply remove undefined values
            const cleanData = JSON.parse(JSON.stringify(metadata));

            const ref = doc(db, `users/${this.userId}/documents`, obj.id);
            docBatch.set(ref, cleanData, { merge: true });
            docCount++;

            if (docCount >= BATCH_LIMIT) {
                await docBatch.commit();
                console.log(`🔥 [Firebase] Committed batch of ${docCount} documents`);
                docBatch = writeBatch(db);
                docCount = 0;
            }
        }

        if (docCount > 0) {
            await docBatch.commit();
            console.log(`🔥 [Firebase] Committed final batch of ${docCount} documents`);
        }

        console.log('🔥 [Firebase] Full migration complete!');
    }

    async deleteDocument(id: string) {
        if (!this.userId) return;
        // TODO: Implement delete
    }
}

export const firebaseService = new FirebaseService();
