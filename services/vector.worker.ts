// Polyfill window for TF.js in Web Worker
if (typeof window === 'undefined') {
    (self as any).window = self;
}

import * as tf from '@tensorflow/tfjs';
import * as use from '@tensorflow-models/universal-sentence-encoder';

let model: use.UniversalSentenceEncoder | null = null;
let isModelLoading = false;

// Initialize TF.js backend
tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));

self.onmessage = async (e: MessageEvent) => {
    const { type, payload, id } = e.data;

    try {
        switch (type) {
            case 'load':
                if (!model && !isModelLoading) {
                    isModelLoading = true;
                    await tf.ready();
                    model = await use.load();
                    isModelLoading = false;
                }
                self.postMessage({ type: 'load_complete', id, success: true });
                break;

            case 'embed':
                if (!model) {
                    // Auto-load if not loaded
                    if (!isModelLoading) {
                        isModelLoading = true;
                        await tf.ready();
                        model = await use.load();
                        isModelLoading = false;
                    } else {
                        // Wait for model to load
                        while (isModelLoading) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                }

                if (model && payload) {
                    const embeddings = await model.embed([payload]);
                    const vector = await embeddings.array();
                    embeddings.dispose();
                    self.postMessage({ type: 'embed_result', id, vector: vector[0] });
                } else {
                    throw new Error('Model failed to load');
                }
                break;
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            id,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
