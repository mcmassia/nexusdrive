import { GoogleGenAI } from "@google/genai";
import { NexusObject } from '../types';

// NOTE: In a real environment, this comes from process.env.VITE_GEMINI_API_KEY
// The user needs to set VITE_GEMINI_API_KEY in their .env file
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private isConfigured: boolean = false;

  constructor() {
    // Only initialize if we have a valid API key
    if (API_KEY && API_KEY.length > 0 && !API_KEY.startsWith('DEMO')) {
      try {
        this.ai = new GoogleGenAI({ apiKey: API_KEY });
        this.isConfigured = true;
      } catch (error) {
        console.warn('[GeminiService] Failed to initialize:', error);
        this.isConfigured = false;
      }
    } else {
      console.warn('[GeminiService] No valid API key found. AI features will be disabled.');
      this.isConfigured = false;
    }
  }

  async generateRAGResponse(query: string, context: NexusObject[]): Promise<string> {
    if (API_KEY === 'DEMO_KEY') {
      // Simulation for UI demo purposes when no key is present
      await new Promise(resolve => setTimeout(resolve, 1500));
      return `Based on your notes, here is what I found regarding "${query}":\n\n` +
        context.map(c => `- **${c.title}**: ${c.content.replace(/<[^>]*>?/gm, '').substring(0, 100)}...`).join('\n') +
        `\n\nThis information was synthesized from ${context.length} relevant objects in your Knowledge Graph.`;
    }

    try {
      // 1. Prepare Context from retrieved objects
      const contextString = context.map(obj =>
        `Title: ${obj.title}\nType: ${obj.type}\nContent: ${obj.content}\nMetadata: ${JSON.stringify(obj.metadata)}`
      ).join('\n---\n');

      const prompt = `You are a helpful knowledge assistant named NexusAI. 
      Use the following context from the user's personal knowledge base to answer their question.
      
      Context:
      ${contextString}
      
      User Question: ${query}
      
      Answer concisely and cite the titles of the notes used.`;

      // 2. Call Gemini
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return response.text || "I couldn't generate a response based on the context.";
    } catch (error) {
      console.error("Gemini API Error:", error);
      return "Error connecting to NexusAI. Please check your API configuration.";
    }
  }

  async autoTagContent(content: string): Promise<string[]> {
    if (API_KEY === 'DEMO_KEY') {
      return ['suggested-tag-1', 'ai-generated'];
    }
    if (!this.isConfigured || !this.ai) {
      console.warn('[GeminiService] API not configured. Skipping auto-tag.');
      alert('Gemini API not configured. Please set VITE_GEMINI_API_KEY in your .env file.');
      return [];
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze the following text and suggest 3-5 relevant kebab-case tags. Return ONLY a JSON array of strings. Text: ${content}`,
        config: {
          responseMimeType: "application/json"
        }
      });
      const text = response.text;
      if (!text) return [];
      return JSON.parse(text);
    } catch (e) {
      console.error("Auto-tagging error", e);
      alert('Error calling Gemini API. Please check your API key is valid.');
      return [];
    }
  }
}

export const geminiService = new GeminiService();
