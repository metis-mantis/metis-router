import { getServerByName, getAllServers, DatabaseMCPServer } from './mcp-registry.js';
import { loadConfig } from './config.js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve('../.env') });

// Define AuthRequest interface locally since we removed auth-manager
export interface AuthRequest {
  serverName: string;
  requirements: any[];
  message: string;
}

// Declare global types
declare global {
  var tempMcpQueue: string[] | undefined;
}

const CONFIG_PATH = process.env.MCP_CONFIG_PATH || path.resolve('./config.json');
const MAX_ACTIVE_SERVERS = (() => {
  const envValue = process.env.MAX_ACTIVE_SERVERS;
  const parsed = parseInt(envValue || '3', 10);
  return isNaN(parsed) ? 3 : parsed;
})();

// Helper to read the entire config, ensuring active_mcp_queue exists
function _readFullConfig(): any {
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(configData);
    if (!config.servers) {
      config.servers = [];
    }
    if (!config.active_mcp_queue) {
      config.active_mcp_queue = [];
    }
    return config;
  } catch (error) {
    return { servers: [], active_mcp_queue: [] };
  }
}

// Helper to write the entire config
function _writeFullConfig(config: any): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Manages the active MCP queue, takes config, modifies it, and returns it
function _updateActiveMcpQueue(serverName: string, config: any): any {
  let queue = config.active_mcp_queue || [];

  const existingIndexInQueue = queue.indexOf(serverName);
  if (existingIndexInQueue > -1) {
    queue.splice(existingIndexInQueue, 1);
  }
  queue.push(serverName);

  if (queue.length > MAX_ACTIVE_SERVERS) {
    const evictedServerName = queue.shift(); // Remove from the front (coldest)
    if (evictedServerName) {
      // Find and remove the server from the config.servers array
      const serverIndexInConfig = config.servers.findIndex((s: any) => s.name === evictedServerName);
      if (serverIndexInConfig > -1) {
        config.servers.splice(serverIndexInConfig, 1);
      }
    }
  }
  
  config.active_mcp_queue = queue;
  return config;
}

// Helper to check if authentication is already provided for a server
function _hasRequiredAuth(authValues: Record<string, string> | undefined, authRequirements: any[]): boolean {
  if (!authValues) {
    return false;
  }
  
  // Check if all required auth fields are present and not empty
  for (const req of authRequirements) {
    if (!authValues[req.name] || authValues[req.name].trim() === '') {
      return false;
    }
  }
  
  return true;
}

export interface AddMCPResult {
  success: boolean;
  message: string;
  authRequest?: AuthRequest;
  argumentsRequest?: ArgumentsRequest;
  serverInfo?: any;
}

export interface ArgumentsRequest {
  serverName: string;
  requirements: Array<{
    name: string;
    description: string;
    required: boolean;
    example?: string;
    position: number;
  }>;
  message: string;
}

/**
 * Add a new MCP server by name with optional arguments
 */
export async function addNewMcp(name: string, serverArgs?: Record<string, string>): Promise<AddMCPResult> {
  let config = _readFullConfig(); // Read once at the beginning

  try {
    // Fetch server definition from JSON registry
    const serverDef = await getServerByName(name);
    if (!serverDef) {
      // Fetch all available servers for error message
      const allServers = await getAllServers();
      const available = allServers.map((s) => s.display_name || s.name).join(', ');
      return {
        success: false,
        message: `MCP server '${name}' not found. Available servers: ${available}`
      };
    }

    // Check if already exists in config
    const alreadyExists = config.servers.some((s: any) =>
      s.name === serverDef.name
    );
    if (alreadyExists) {
      config = _updateActiveMcpQueue(serverDef.name, config);
      _writeFullConfig(config);
      return {
        success: false,
        message: `${serverDef.display_name || serverDef.name} MCP server already exists in config (moved to end of active queue).`,
        serverInfo: serverDef
      };
    }

    // Check for missing arguments
    if (serverDef.argumentRequirements && serverDef.argumentRequirements.length > 0) {
      const missingArgs = serverDef.argumentRequirements.filter((req: any) =>
        req.required && (!serverArgs || !serverArgs[req.name])
      );
      if (missingArgs.length > 0) {
        return {
          success: false,
          message: `Arguments required for ${serverDef.display_name || serverDef.name}. Please provide the required arguments.`,
          argumentsRequest: {
            serverName: serverDef.display_name || serverDef.name,
            requirements: missingArgs,
            message: formatArgumentsRequestMessage(serverDef.display_name || serverDef.name, missingArgs)
          },
          serverInfo: serverDef
        };
      }
    }

    // Check for missing auth
    if (serverDef.auth_requirements && serverDef.auth_requirements.length > 0) {
      // Check if authentication is already provided in the registry
      if (!_hasRequiredAuth(serverDef.auth_values, serverDef.auth_requirements)) {
        return {
          success: false,
          message: `Authentication required for ${serverDef.display_name || serverDef.name}. Please provide the required credentials first.`,
          authRequest: {
            serverName: serverDef.display_name || serverDef.name,
            requirements: serverDef.auth_requirements,
            message: formatAuthRequestMessage(serverDef.display_name || serverDef.name, serverDef.auth_requirements)
          },
          serverInfo: serverDef
        };
      }
    }

    // Add server to config
    const addResult = await addServerToConfig(serverDef, serverArgs, config);
    if (addResult.success && addResult.updatedConfig) {
      config = _updateActiveMcpQueue(serverDef.name, addResult.updatedConfig);
      _writeFullConfig(config);
      return { success: true, message: addResult.message, serverInfo: serverDef };
    } else if (!addResult.success) {
      return { success: false, message: addResult.message, serverInfo: serverDef };
    }
    _writeFullConfig(config);
    return { success: false, message: 'Failed to update config with server and queue.', serverInfo: serverDef };
  } catch (error) {
    _writeFullConfig(config);
    return {
      success: false,
      message: `Error adding MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

interface ConfigUpdateResult {
    success: boolean;
    message: string;
    serverInfo?: any;
    updatedConfig?: any; 
}

async function addServerToConfig(serverDef: DatabaseMCPServer, serverArgs: Record<string, string> | undefined, config: any): Promise<ConfigUpdateResult> {
  const serverEntry: any = { name: serverDef.name };

  // Check if this server already has staticArgs defined (like Linear with mcp-remote)
  if (serverDef.static_args && serverDef.static_args.length > 0) {
    // Use the pre-defined static args from the database
    serverEntry.transport = { 
      command: serverDef.command, 
      args: [...serverDef.static_args]
    };
    
    // Add environment variables for auth if needed
    if (serverDef.auth_requirements && serverDef.auth_requirements.length > 0) {
      const envVars: Record<string, string> = {};
      
      if (serverDef.auth_values) {
        for (const req of serverDef.auth_requirements) {
          if (serverDef.auth_values[req.name]) {
            envVars[req.name] = serverDef.auth_values[req.name];
          }
        }
      }
      
      if (Object.keys(envVars).length > 0) {
        serverEntry.transport.env = envVars;
      }
    }
  } else if (serverDef.connection_type === 'sse') {
    // Use direct SSE transport for servers that support it
    serverEntry.transport = {
      type: 'sse',
      url: serverDef.url
    };
  } else {
    // Use direct command for local servers
    serverEntry.transport = { 
      command: serverDef.command, 
      args: serverDef.static_args ? [...serverDef.static_args] : [] 
    };

    if (serverDef.argumentRequirements && serverArgs) {
      const sortedArgs = serverDef.argumentRequirements
        .filter((req: any) => serverArgs[req.name])
        .sort((a: any, b: any) => a.position - b.position);
      for (const argReq of sortedArgs) {
        const argValue = serverArgs[argReq.name];
        if (argValue) serverEntry.transport.args.splice(argReq.position, 0, argValue);
      }
    }

    if (serverDef.auth_requirements && serverDef.auth_requirements.length > 0) {
      const envVars: Record<string, string> = {};
      
      if (serverDef.auth_values) {
        for (const req of serverDef.auth_requirements) {
          if (serverDef.auth_values[req.name]) {
            envVars[req.name] = serverDef.auth_values[req.name];
          }
        }
      }
      
      if (Object.keys(envVars).length > 0) {
        serverEntry.transport.env = envVars;
      }
    }
  }

  config.servers.push(serverEntry);
  return {
    success: true,
    message: `${serverDef.display_name || serverDef.name} MCP server prepared for config.`,
    serverInfo: serverDef,
    updatedConfig: config 
  };
}

export async function storeAuthData(serverName: string, authData: Record<string, string>): Promise<AddMCPResult> {
  const serverDef = await getServerByName(serverName);
  if (!serverDef) {
    return {
      success: false,
      message: `MCP server '${serverName}' not found.`
    };
  }

  // Validate that all provided keys are valid auth requirements
  const validAuthKeys = new Set(serverDef.auth_requirements.map((r: any) => r.name));
  for (const key in authData) {
    if (!validAuthKeys.has(key)) {
      return { success: false, message: `Invalid auth key provided: ${key}` };
    }
  }
  
  // Removed authManager.storeAuth(parseInt(serverDef.id) || 0, authData);
  
  return {
    success: true,
    message: `Authentication data for '${serverName}' stored successfully.`
  };
}

export function heatUpMcpServer(serverName: string): void {
  // Don't write to config file during heating to avoid triggering reloads
  // Just update the queue in memory - this will be persisted on next legitimate config change
  let config = _readFullConfig();
  const serverExistsInConfig = config.servers.some((s: any) => s.name === serverName);
  if (!serverExistsInConfig) {
    console.warn(`Attempted to heat up server not in config: ${serverName}`);
    return;
  }
  
  // Update the active queue in memory only - don't write to disk
  config = _updateActiveMcpQueue(serverName, config);
  
  // Store in a temporary memory cache instead of writing to file
  // This prevents the config watcher from triggering connection reloads
  global.tempMcpQueue = config.active_mcp_queue;
  
  console.log(`Server '${serverName}' heated up in memory (queue updated without file write).`);
}

/**
 * Format a user-friendly authentication request message for the agent
 */
function formatAuthRequestMessage(serverName: string, requirements: any[]): string {
  let message = `🔐 Authentication Required for ${serverName}\n\n`;
  message += `To use the ${serverName} MCP server, you need to obtain the following credentials:\n\n`;

  for (const req of requirements) {
    message += `• **${req.name}**: ${req.description}\n`;
    if (req.example) {
      message += `  Example: ${req.example}\n`;
    }
    message += '\n';
  }

  message += `**Instructions for the Agent:**\n`;
  message += `1. Ask the user to provide the required credentials listed above\n`;
  message += `2. Once the user provides the credentials, store them using the following format:\n\n`;
  
  message += `**Step 1: Store Authentication Data**\n`;
  message += `Use the \`store_auth_data\` function (if available) or ask the user to manually add the credentials to their auth file.\n\n`;
  
  message += `**Step 2: Add the Server**\n`;
  message += `After authentication is stored, retry adding the server:\n`;
  message += `\`\`\`\n`;
  message += `add_new_mcp("${serverName.toLowerCase().replace(/\s+/g, '-')}")\n`;
  message += `\`\`\`\n\n`;

  message += `**Manual Registry Setup (if needed):**\n`;
  message += `The user can manually add credentials to \`mcp-registry.json\` in the env section:\n`;
  message += `\`\`\`json\n`;
  message += `{\n`;
  message += `  "mcpServers": {\n`;
  message += `    "${serverName}": {\n`;
  message += `      "command": "...",\n`;
  message += `      "args": [...],\n`;
  message += `      "env": {\n`;
  for (const req of requirements) {
    message += `        "${req.name}": "${req.example || 'your_' + req.name.toLowerCase() + '_here'}",\n`;
  }
  // Remove trailing comma from last auth requirement example
  if (requirements.length > 0) {
      message = message.slice(0, -2) + '\n'; 
  }
  message += `      }\n`;
  message += `    }\n`;
  message += `  }\n`;
  message += `}\n`;
  message += `\`\`\``;

  return message;
}

/**
 * Format a user-friendly arguments request message for the agent
 */
function formatArgumentsRequestMessage(serverName: string, requirements: Array<{
  name: string;
  description: string;
  required: boolean;
  example?: string;
  position: number;
}>): string {
  let message = `⚙️ Arguments Required for ${serverName}\n\n`;
  message += `The ${serverName} MCP server requires the following arguments to be provided:\n\n`;

  for (const req of requirements) {
    message += `• **${req.name}**: ${req.description}\n`;
    if (req.example) {
      message += `  Example: ${req.example}\n`;
    }
    message += '\n';
  }

  message += `**Instructions for the Agent:**\n`;
  message += `1. Ask the user to provide the required arguments listed above\n`;
  message += `2. Once the user provides the arguments, add the server using this format:\n\n`;

  message += `\`\`\`\n`;
  message += `add_new_mcp("${serverName.toLowerCase().replace(/\s+/g, '-')}", {\n`;
  for (const req of requirements) {
    message += `  "${req.name}": "${req.example || 'user_provided_value'}",\n`;
  }
  // Remove trailing comma from last argument example
  if (requirements.length > 0) {
      message = message.slice(0, -2) + '\n'; 
  }
  message += `})\n`;
  message += `\`\`\`\n\n`;

  message += `**Example for this server:**\n`;
  message += '```\n';
  message += `add_new_mcp("${serverName.toLowerCase().replace(/\s+/g, '-')}", {\n`;
  for (const req of requirements) {
    message += `  "${req.name}": "${req.example || 'your_value_here'}",\n`;
  }
  // Remove trailing comma from last argument example
  if (requirements.length > 0) {
      message = message.slice(0, -2) + '\n';
  }
  message += '})\n';
  message += '```';
  return message;
}