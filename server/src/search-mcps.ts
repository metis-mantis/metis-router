#!/usr/bin/env ts-node

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve('../.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Interface for enhanced server structure (matches mcp-registry.ts)
interface EnhancedServer {
  name: string;
  displayName: string;
  originalDescription: string;
  aiSummary: string;
  aiUseCases: string[];
  toolCount: number;
  toolDescriptions: { name: string; description: string }[];
  embedding: number[];
  lastProcessed: string;
}

interface EnhancedIndex {
  lastUpdated: string;
  totalServers: number;
  servers: EnhancedServer[];
}

export interface SearchMCPResult {
  id: string;
  name: string;
  displayName: string;
  description: string;
  distance: number;
  similarity: number;
  tools: Array<{ name: string; description: string }>;
  toolCount: number;
}

// Create OpenAI client
const createOpenAIClient = () => {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return null;
};

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

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

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

// Generate embedding for a query
async function generateQueryEmbedding(openai: OpenAI, query: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: query,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    throw error;
  }
}

// Load enhanced index
function loadEnhancedIndex(): EnhancedIndex {
  const indexPath = path.join(__dirname, '../generated/enhanced-index.json');
  
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Enhanced index not found at ${indexPath}. Run 'npm run generate-ai-summaries' first.`);
  }

  try {
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    return JSON.parse(indexContent);
  } catch (error) {
    throw new Error(`Failed to read or parse enhanced-index.json: ${error}`);
  }
}

// Search MCPs by semantic similarity using enhanced JSON index
export async function searchMCPs(query: string, limit: number = 3): Promise<SearchMCPResult[]> {
  console.log(`🔍 Searching MCP servers for: "${query}"`);
  
  const openai = createOpenAIClient();
  if (!openai) {
    console.warn('⚠️  OpenAI API key not provided. Falling back to text-based search.');
    return await searchMCPsTextBased(query, limit);
  }

  try {
    const enhancedIndex = loadEnhancedIndex();
    console.log(`📊 Loaded ${enhancedIndex.totalServers} servers with embeddings`);

    // Generate embedding for the search query
    console.log('   - Generating query embedding...');
    const queryEmbedding = await generateQueryEmbedding(openai, query);

    const results: Array<{server: EnhancedServer, similarity: number}> = [];
    
    for (const server of enhancedIndex.servers) {
      if (server.embedding.length === 0) continue;
      const similarity = cosineSimilarity(queryEmbedding, server.embedding);
      results.push({ server, similarity });
    }

    const topResults = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return topResults.map((result, index) => ({
      id: (index + 1).toString(),
      name: result.server.name,
      displayName: result.server.displayName,
      description: result.server.aiSummary,
      distance: 1 - result.similarity,
      similarity: result.similarity,
      tools: result.server.toolDescriptions,
      toolCount: result.server.toolCount
    }));
    
  } catch (error) {
    console.error('Error during semantic search:', error);
    console.log('🔄 Falling back to text-based search...');
    return await searchMCPsTextBased(query, limit);
  }
}

// Fallback text-based search when embeddings are not available
async function searchMCPsTextBased(query: string, limit: number): Promise<SearchMCPResult[]> {
  try {
    const enhancedIndex = loadEnhancedIndex();
    const queryLower = query.toLowerCase();
    
    const scored = enhancedIndex.servers.map(server => {
      let score = 0;
      
      if (server.name.toLowerCase() === queryLower) score += 100;
      if (server.displayName.toLowerCase().includes(queryLower)) score += 50;
      if (server.aiSummary.toLowerCase().includes(queryLower)) score += 40;
      
      server.aiUseCases.forEach(useCase => {
        if (useCase.toLowerCase().includes(queryLower)) score += 30;
      });
      
      server.toolDescriptions.forEach(tool => {
        if (tool.name.toLowerCase().includes(queryLower)) score += 20;
        if (tool.description?.toLowerCase().includes(queryLower)) score += 15;
      });
      
      queryLower.split(/\s+/).forEach(word => {
        if (word.length > 2 && server.aiSummary.toLowerCase().includes(word)) {
          score += 10;
        }
      });
      
      return { ...server, score };
    });
    
    return scored
      .filter(server => server.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((server, index) => ({
        id: (index + 1).toString(),
        name: server.name,
        displayName: server.displayName,
        description: server.aiSummary,
        distance: Math.max(0, (100 - server.score) / 100),
        similarity: Math.min(1, server.score / 100),
        tools: server.toolDescriptions,
        toolCount: server.toolCount
      }));
    
  } catch (error) {
    throw new Error('Search failed. Make sure enhanced-index.json exists.');
  }
}

// Command line interface for testing
async function main(): Promise<void> {
  if (process.argv.length < 3) {
    console.log('Usage: npx tsx search-mcps.ts "your search query" [limit]');
    console.log('Example: npx tsx search-mcps.ts "file operations" 3');
    process.exit(1);
  }
  
  const query = process.argv[2];
  const limit = parseInt(process.argv[3]) || 3;
  
  console.log(`🚀 Starting MCP search...`);
  console.log(`📝 Query: "${query}"`);
  console.log(`🔢 Limit: ${limit}`);
  console.log('');
  
  try {
    const results = await searchMCPs(query, limit);
    
    console.log(`\n📊 Search Results:`);
    console.log('==================');
    
    if (results.length === 0) {
      console.log('❌ No results found. Make sure enhanced-index.json exists and contains servers matching your query.');
      process.exit(1);
    }
    
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.displayName} (${result.name})`);
      console.log(`   📝 Description: ${result.description}`);
      console.log(`   📊 Similarity: ${(result.similarity * 100).toFixed(1)}%`);
      
      if (result.tools && result.tools.length > 0) {
        console.log(`   🛠️  Tools (${result.tools.length}):`);
        result.tools.slice(0, 3).forEach((tool) => {
          console.log(`      • ${tool.name}: ${tool.description || 'No description'}`);
        });
        if (result.tools.length > 3) {
          console.log(`      ... and ${result.tools.length - 3} more tools`);
        }
      } else {
        console.log(`   🛠️  Tools: ${result.toolCount || 0} tools indexed`);
      }
    });
    
    console.log('\n✅ Search completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Search failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}