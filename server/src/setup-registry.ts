#!/usr/bin/env tsx

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve('../.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for output
const colors = {
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

function printStatus(message: string) {
  console.log(`${colors.blue}[INFO]${colors.reset} ${message}`);
}

function printSuccess(message: string) {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

function printWarning(message: string) {
  console.log(`${colors.yellow}[WARNING]${colors.reset} ${message}`);
}

function printError(message: string) {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

async function runCommand(command: string, description: string): Promise<boolean> {
  try {
    printStatus(description);
    execSync(command, { 
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });
    return true;
  } catch (error) {
    printError(`Failed: ${description}`);
    console.error(error);
    return false;
  }
}

async function setupRegistry(): Promise<void> {
  console.log('🚀 Setting up MCP Registry...');
  console.log('=============================');
  
  // Step 1: Index servers
  printStatus('Step 1/2: Indexing MCP servers...');
  const indexSuccess = await runCommand(
    'tsx scripts/index-servers.ts',
    'Discovering and indexing available MCP servers'
  );
  
  if (!indexSuccess) {
    printError('Server indexing failed. Cannot proceed with AI summaries.');
    process.exit(1);
  }
  
  printSuccess('Server indexing completed!');
  console.log('');
  
  // Step 2: Generate AI summaries and embeddings
  printStatus('Step 2/2: Generating AI summaries and embeddings...');
  const summarySuccess = await runCommand(
    'tsx src/generate-ai-summaries.ts',
    'Creating AI-powered descriptions and semantic embeddings'
  );
  
  if (summarySuccess) {
    printSuccess('AI summaries and embeddings generated successfully!');
  } else {
    printWarning('AI summaries generation failed (likely missing OpenAI API key)');
    printWarning('Registry will work with basic text-based search only');
  }
  
  console.log('');
  printSuccess('🎉 MCP Registry setup complete!');
  
  // Check what was generated
  const generatedDir = path.resolve(__dirname, '../generated');
  const indexFile = path.join(generatedDir, 'index.json');
  const enhancedFile = path.join(generatedDir, 'enhanced-index.json');
  
  console.log('📊 Generated files:');
  
  if (fs.existsSync(indexFile)) {
    try {
      const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      console.log(`   ✅ Basic index: ${indexData.totalServers || 0} servers indexed`);
    } catch (error) {
      console.log(`   ⚠️  Basic index: File exists but may be corrupted`);
    }
  } else {
    console.log(`   ❌ Basic index: Not found`);
  }
  
  if (fs.existsSync(enhancedFile)) {
    try {
      const enhancedData = JSON.parse(fs.readFileSync(enhancedFile, 'utf-8'));
      console.log(`   ✅ Enhanced index: ${enhancedData.totalServers || 0} servers with AI summaries`);
      console.log(`   ✅ Embeddings: Available for semantic search`);
    } catch (error) {
      console.log(`   ⚠️  Enhanced index: File exists but may be corrupted`);
    }
  } else {
    console.log(`   ⚠️  Enhanced index: Not available (OpenAI API key needed)`);
  }
  
  console.log('');
  console.log('💡 Next steps:');
  console.log('   1. Configure MCP servers in mcp-registry.json');
  console.log('   2. Start the MCP server: npm run dev:http');
  console.log('   3. Test search: npm run search-servers "your query"');
}

// Run the setup
setupRegistry().catch((error) => {
  printError('Setup failed with error:');
  console.error(error);
  process.exit(1);
}); 