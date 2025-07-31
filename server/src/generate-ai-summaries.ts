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

// Interfaces for the JSON structure
interface Tool {
  name: string;
  description: string;
  inputSchema?: any;
}

interface Server {
  name: string;
  displayName: string;
  description: string;
  tools: Tool[];
  version?: string;
  mcpVersion?: string;
  category?: string;
  tags?: string[];
}

interface IndexData {
  lastUpdated: string;
  totalServers: number;
  servers: Server[];
}

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

// Create OpenAI client
function createOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is not set');
    return null;
  }
  
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Generate AI summary using GPT-4o mini
async function generateAISummary(openai: OpenAI, server: Server): Promise<{summary: string, useCases: string[]}> {
  const toolDescriptions = server.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n');
  
  const prompt = `Analyze this MCP (Model Context Protocol) server and provide a comprehensive summary focusing on its tools and capabilities:

Server Name: ${server.displayName}
Original Description: ${server.description}

Available Tools (${server.tools.length} total):
${toolDescriptions}

Please provide:
1. A clear, comprehensive summary (2-3 sentences) that explains what this server does, what domain/service it integrates with, and what key capabilities the tools provide
2. 2-3 specific, realistic use cases or example scenarios where someone would use this server

IMPORTANT: Return ONLY valid JSON with no additional text, explanations, or formatting. Use exactly this structure:

{
  "summary": "Your comprehensive summary here focusing on capabilities and integration",
  "useCases": [
    "Use case 1: Specific example of when/how to use this server",
    "Use case 2: Another practical scenario for this server", 
    "Use case 3: Third use case highlighting different capabilities"
  ]
}

Focus on practical applications, tool capabilities, and make the summary highly searchable for users looking for specific functionality.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing software tools and creating clear, practical summaries. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }

    try {
      // Try to extract JSON from the response (handle cases where AI adds extra text)
      let jsonContent = content.trim();
      
      // Look for JSON object in the response
      const jsonStart = jsonContent.indexOf('{');
      const jsonEnd = jsonContent.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
      }
      
      const parsed = JSON.parse(jsonContent);
      return {
        summary: parsed.summary || `AI-powered server that provides ${server.tools.length} tools for various operations.`,
        useCases: Array.isArray(parsed.useCases) ? parsed.useCases.slice(0, 3) : []
      };
    } catch (parseError) {
      console.warn(`Failed to parse JSON response for ${server.name}, using fallback`);
      console.warn(`Response was: ${content.substring(0, 200)}...`);
      return {
        summary: `AI-powered server that provides ${server.tools.length} tools for various operations including ${server.tools.slice(0, 3).map(t => t.name).join(', ')}.`,
        useCases: [
          `Use ${server.displayName} for ${server.tools[0]?.name || 'primary operations'}`,
          `Integrate ${server.displayName} when you need ${server.description.toLowerCase()}`,
          `Leverage ${server.displayName} for automated ${server.name} workflows`
        ]
      };
    }
  } catch (error) {
    console.error(`Error generating AI summary for ${server.name}:`, error);
    // Fallback summary
    return {
      summary: `Server providing ${server.tools.length} tools for ${server.description}`,
      useCases: [
        `Use ${server.displayName} for ${server.tools[0]?.name || 'operations'}`,
        `Integrate ${server.displayName} for ${server.description.toLowerCase()}`
      ]
    };
  }
}

// Generate embedding for text
async function generateEmbedding(openai: OpenAI, text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Main processing function
async function main() {
  console.log('🚀 Starting AI summary generation process...');
  
  const openai = createOpenAIClient();
  if (!openai) {
    process.exit(1);
  }

  // Read the index.json file
  const indexPath = path.join(__dirname, '../generated/index.json');
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ Index file not found at ${indexPath}`);
    process.exit(1);
  }

  let indexData: IndexData;
  try {
    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    indexData = JSON.parse(indexContent);
  } catch (error) {
    console.error('❌ Failed to read or parse index.json:', error);
    process.exit(1);
  }

  console.log(`📊 Found ${indexData.totalServers} servers to process`);

  const enhancedServers: EnhancedServer[] = [];

  // Process each server
  for (let i = 0; i < indexData.servers.length; i++) {
    const server = indexData.servers[i];
    console.log(`\n📝 Processing ${server.name} (${i + 1}/${indexData.servers.length})...`);

    try {
      // Generate AI summary and use cases
      console.log('   - Generating AI summary...');
      const aiResult = await generateAISummary(openai, server);
      
      // Create comprehensive text for embedding including detailed tool descriptions
      const toolDescriptions = server.tools.map(tool => {
        return `${tool.name}: ${tool.description}`;
      }).join('\n');
      
      const embeddingText = `Server: ${server.displayName}
Summary: ${aiResult.summary}

Use Cases:
${aiResult.useCases.join('\n')}

Available Tools and Capabilities:
${toolDescriptions}`;
      
      // Generate embedding
      console.log('   - Generating embedding...');
      const embedding = await generateEmbedding(openai, embeddingText);
      
      // Create enhanced server object
      const enhancedServer: EnhancedServer = {
        name: server.name,
        displayName: server.displayName,
        originalDescription: server.description,
        aiSummary: aiResult.summary,
        aiUseCases: aiResult.useCases,
        toolCount: server.tools.length,
        toolDescriptions: server.tools.map(t => ({ name: t.name, description: t.description })),
        embedding: embedding,
        lastProcessed: new Date().toISOString()
      };

      enhancedServers.push(enhancedServer);
      console.log(`   ✅ Successfully processed ${server.name}`);
      
    } catch (error) {
      console.error(`   ❌ Failed to process ${server.name}:`, error);
      // Add a fallback entry
      enhancedServers.push({
        name: server.name,
        displayName: server.displayName,
        originalDescription: server.description,
        aiSummary: `Server providing ${server.tools.length} tools for ${server.description}`,
        aiUseCases: [`Use ${server.displayName} for basic operations`],
        toolCount: server.tools.length,
        toolDescriptions: server.tools.map(t => ({ name: t.name, description: t.description })),
        embedding: [], // Empty embedding on failure
        lastProcessed: new Date().toISOString()
      });
    }

    // Add a small delay to respect rate limits
    if (i < indexData.servers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Create enhanced index
  const enhancedIndex: EnhancedIndex = {
    lastUpdated: new Date().toISOString(),
    totalServers: enhancedServers.length,
    servers: enhancedServers
  };

  // Write the enhanced index file
  const outputPath = path.join(__dirname, '../generated/enhanced-index.json');
  try {
    fs.writeFileSync(outputPath, JSON.stringify(enhancedIndex, null, 2));
    console.log(`\n✅ Enhanced index saved to ${outputPath}`);
  } catch (error) {
    console.error('❌ Failed to write enhanced index:', error);
    process.exit(1);
  }

  // Generate summary report
  console.log('\n📋 Summary Report:');
  console.log(`   - Total servers processed: ${enhancedServers.length}`);
  console.log(`   - Successful AI summaries: ${enhancedServers.filter(s => s.aiSummary && !s.aiSummary.startsWith('Server providing')).length}`);
  console.log(`   - Successful embeddings: ${enhancedServers.filter(s => s.embedding.length > 0).length}`);
  console.log(`   - Output file: ${outputPath}`);

  console.log('\n🎉 AI summary generation completed!');
}

// Run the script
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
}); 