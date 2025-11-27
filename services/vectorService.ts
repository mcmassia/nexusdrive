import VectorWorker from './vector.worker?worker';

/**
 * Service for Vector Search using TensorFlow.js and Universal Sentence Encoder
 * Runs in a Web Worker to avoid blocking the UI.
 */
class VectorService {
    private worker: Worker | null = null;
    private pendingRequests: Map<string, { resolve: (val: any) => void, reject: (err: any) => void }> = new Map();
    private loadPromise: Promise<void> | null = null;

    constructor() {
        this.initWorker();
    }

    private initWorker() {
        if (typeof Worker !== 'undefined') {
            this.worker = new VectorWorker();
            this.worker.onmessage = (e) => {
                const { type, id, vector, success, error } = e.data;
                const request = this.pendingRequests.get(id);

                if (request) {
                    if (type === 'error') {
                        request.reject(new Error(error));
                    } else if (type === 'embed_result') {
                        request.resolve(vector);
                    } else if (type === 'load_complete') {
                        request.resolve(true);
                    }
                    this.pendingRequests.delete(id);
                }
            };
        }
    }

    /**
     * Initialize the model (in worker)
     */
    async loadModel(): Promise<void> {
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = new Promise((resolve, reject) => {
            if (!this.worker) {
                this.initWorker();
            }
            if (!this.worker) {
                reject(new Error('Web Worker not supported'));
                return;
            }

            const id = crypto.randomUUID();
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ type: 'load', id });
        });

        return this.loadPromise;
    }

    /**
     * Generate embedding for a text string
     * Returns a 512-dimensional vector as an array of numbers
     */
    async embed(text: string): Promise<number[]> {
        if (!text || !text.trim()) return [];

        // Clean text
        const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleanText) return [];

        return new Promise((resolve, reject) => {
            if (!this.worker) this.initWorker();

            if (!this.worker) {
                reject(new Error('Worker failed to initialize'));
                return;
            }

            const id = crypto.randomUUID();
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ type: 'embed', payload: cleanText, id });
        });
    }

    /**
     * Calculate Cosine Similarity between two vectors
     * Returns a value between -1 and 1 (usually 0 to 1 for text)
     */
    cosineSimilarity(a: number[], b: number[]): number {
        if (!a || !b || a.length !== b.length) return 0;

        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            magnitudeA += a[i] * a[i];
            magnitudeB += b[i] * b[i];
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) return 0;

        return dotProduct / (magnitudeA * magnitudeB);
    }
}

export const vectorService = new VectorService();
