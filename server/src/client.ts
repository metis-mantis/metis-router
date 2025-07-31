import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ServerConfig } from './config.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve('../.env') });

const sleep = (time: number) => new Promise<void>(resolve => setTimeout(() => resolve(), time))
export interface ConnectedClient {
  client: Client;
  cleanup: () => Promise<void>;
  name: string;
}

function mcpLog(message: string) {
  console.log(JSON.stringify({
    jsonrpc: "2.0",
    method: "log",
    params: { message }
  }));
}

const createClient = (server: ServerConfig): { client: Client | undefined, transport: Transport | undefined } => {

  let transport: Transport | null = null
  try {
    if (server.transport.type === 'sse') {
      if (!server.transport.url) {
        throw new Error('URL must be provided for SSE transport');
      }
      transport = new SSEClientTransport(new URL(server.transport.url));
    } else if (server.transport.type === 'streamable-http') {
      if (!server.transport.url) {
        throw new Error('URL must be provided for streamable-http transport');
      }
      transport = new StreamableHTTPClientTransport(new URL(server.transport.url));
    } else {
      // For stdio transport
      const serverEnv: Record<string, string> = {};
      
      // Copy process.env, filtering out undefined values
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          serverEnv[key] = value;
        }
      }
      
      // Add any server-specific environment variables
      if (server.transport.env) {
        Object.assign(serverEnv, server.transport.env);
      }

      transport = new StdioClientTransport({
        command: server.transport.command || 'node',
        args: server.transport.args || [],
        env: serverEnv
      });
    }

    const client = new Client(
      {
        name: "metis",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    return { client, transport }
  } catch (error) {
    console.error(`Error creating client for ${server.name}:`, error);
    return { client: undefined, transport: undefined }
  }
}

export const createClients = async (servers: ServerConfig[]): Promise<ConnectedClient[]> => {
  const clients: ConnectedClient[] = [];

  for (const server of servers) {
    mcpLog(`Connecting to server: ${server.name}`);

    const waitFor = 2500
    const retries = 3
    let count = 0
    let retry = true

    while (retry) {

      const { client, transport } = createClient(server)
      if (!client || !transport) {
        break
      }

      try {
        await client.connect(transport);
        mcpLog(`Connected to server: ${server.name}`);

        // Add error handling for connection drops
        transport.onclose = () => {
          console.warn(`Connection to ${server.name} was closed unexpectedly`);
        };

        transport.onerror = (error: any) => {
          console.error(`Transport error for ${server.name}:`, error);
        };

        clients.push({
          client,
          name: server.name,
          cleanup: async () => {
            try {
              await transport.close();
            } catch (error) {
              console.error(`Error closing transport for ${server.name}:`, error);
            }
          }
        });

        break

      } catch (error) {
        console.error(`Failed to connect to ${server.name}:`, error);
        count++
        retry = (count < retries)
        if (retry) {
          try {
            await client.close()
          } catch { }
          mcpLog(`Retry connection to ${server.name} in ${waitFor}ms (${count}/${retries})`);
          await sleep(waitFor)
        }
      }

    }

  }

  return clients;
};
