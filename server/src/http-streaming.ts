import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve('../.env') });
import express, { Request, Response, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from './mcp-proxy.js';
import cors from 'cors';
import { z } from 'zod';
import { addNewMcp, storeAuthData } from './add-new-mcp.js';

// Declare global types
declare global {
  var notifyAllSessions: ((notification: any) => void) | undefined;
  var notifySpecificSession: ((sessionId: string, notification: any) => void) | undefined;
}

function mcpLog(message: string) {
  console.log(JSON.stringify({
    jsonrpc: "2.0",
    method: "log",
    params: { message }
  }));
}

// Function to check if a request has valid authentication
function hasValidAuth(req: Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  
  // For now, we'll just check if there's a Bearer token
  // Later we'll properly validate the token
  return authHeader.startsWith('Bearer ');
}

// Function to extract Bearer token from request
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // Remove "Bearer " prefix
}

// Function to handle unauthorized responses
function handleUnauthorized(res: Response) {
  // Set WWW-Authenticate header according to OAuth 2.0 Protected Resource Metadata spec
  res.setHeader('WWW-Authenticate', 'Bearer realm="MCP Server", resource_metadata_uri="/.well-known/oauth-protected-resource"');
  
  res.status(401).json({
    jsonrpc: "2.0",
    error: {
      code: -32001,
      message: "Unauthorized: Authentication required",
    },
    id: null
  });
}

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());

// Authentication middleware for all routes except well-known endpoints
app.use((req, res, next) => {
  // Skip auth for well-known endpoints and health check
  if (req.path.startsWith('/.well-known/') || req.path === '/health') {
    return next();
  }

  // Skip authentication for local development
  // if (!hasValidAuth(req)) {
  //   return handleUnauthorized(res);
  // }
  
  next();
});

// Create shared MCP server instance
const { server, cleanup } = await createServer();
let sharedTransport: StreamableHTTPServerTransport | null = null;

// Set up global notification function for the MCP proxy
global.notifyAllSessions = (notification: any) => {
  console.log(`Sending notification:`, notification);
  if (sharedTransport) {
    try {
      // Use the MCP Server's notification method
      server.notification(notification).catch((error: any) => {
        console.error(`Error sending notification:`, error);
      });
    } catch (error) {
      console.error(`Error sending notification:`, error);
    }
  }
};

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  mcpLog(`POST request received`);
  
  // If this is an initialization request, always create a fresh transport
  if (isInitializeRequest(req.body)) {
    mcpLog('Creating new transport for initialization request (resetting existing if needed)');
    
    // Clean up existing transport if it exists
    if (sharedTransport) {
      try {
        await sharedTransport.close();
        mcpLog('Cleaned up existing transport for fresh initialization');
      } catch (error) {
        console.warn('Warning: Error cleaning up existing transport:', error);
      }
    }
    
    sharedTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        mcpLog(`Session initialized: ${sessionId}`);
      }
    });

    try {
      // Clean up transport when it closes
      sharedTransport.onclose = async () => {
        mcpLog(`Cleaning up shared transport`);
        sharedTransport = null;
      };

      // Connect to the MCP server
      console.log('Connecting to shared MCP server');
      await server.connect(sharedTransport);
      
      // Handle the initialization request
      await sharedTransport.handleRequest(req, res, req.body);
    } catch (error: any) {
      sharedTransport = null;
      if (error.code === -32001 || error.message?.includes('Unauthorized')) {
        handleUnauthorized(res);
        return;
      }
      console.error('Error setting up shared transport:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error during initialization',
        },
        id: null,
      });
    }
    return;
  }
  
  // For non-initialization requests, use existing transport
  if (sharedTransport) {
    mcpLog(`Using existing shared transport`);
    try {
      await sharedTransport.handleRequest(req, res, req.body);
    } catch (error: any) {
      if (error.code === -32001 || error.message?.includes('Unauthorized')) {
        handleUnauthorized(res);
        return;
      }
      throw error;
    }
    return;
  }
  
  mcpLog(`Invalid request - No transport available and not an initialization request`);
  // Invalid request
  res.status(400).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Bad Request: No transport available and not an initialization request',
    },
    id: null,
  });
});

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', async (req, res) => {
  if (!sharedTransport) {
    mcpLog('No shared transport available for GET request');
    res.status(400).send('No active transport available');
    return;
  }
  
  mcpLog(`Handling GET request`);
  await sharedTransport.handleRequest(req, res);

  // Send a comment line every 4 minutes
  const hb = setInterval(() => {
    // A colon-line is ignored by browsers but counts as data for proxies
    res.write(':keep-alive\n\n');
  }, 240000); // 4 minutes

  // Stop the timer when the client disconnects
  res.on('close', () => clearInterval(hb));
});

// Handle DELETE requests for session termination
app.delete('/mcp', async (req, res) => {
  if (!sharedTransport) {
    mcpLog('No shared transport available for DELETE request');
    res.status(400).send('No active transport available');
    return;
  }
  
  mcpLog(`Deleting shared transport`);
  await sharedTransport.close();
  sharedTransport = null;
  res.status(200).send('Transport deleted');
});

// Health check endpoint
app.get('/health', async (req, res) => {
  res.json({ 
    status: 'ok', 
    transportActive: !!sharedTransport,
    timestamp: new Date().toISOString()
  });
});

// OAuth Protected Resource Metadata endpoint
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  // Get the server's base URL
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}`;

  res.json({
    resource: baseUrl,
    authorization_servers: []
  });
});

// Start the server
const PORT = process.env.PORT || 9999;
const httpServer = app.listen(PORT, async () => {
  console.log(`MCP Proxy Streamable HTTP Server listening on port ${PORT}`);
  mcpLog(`Server started on port ${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  // Close HTTP server first (stop accepting new connections)
  httpServer.close((err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
    } else {
      console.log('HTTP server closed successfully');
    }
  });
  
  // Clean up shared transport and server
  try {
    if (sharedTransport) {
      await sharedTransport.close();
    }
    await cleanup();
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
  
  process.exit(0);
};

// Handle different shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));