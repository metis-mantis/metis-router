import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "./mcp-proxy.js";
import { v4 as uuidv4 } from "uuid";
import type { IncomingMessage, ServerResponse } from "http";
import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";

// Load environment variables from root .env file
dotenv.config({ path: path.resolve('../.env') });


const app = express();
type SessionData = {
  transport: SSEServerTransport;
  /** put anything else you want to persist here */
  config: Record<string, unknown>;
};

const sessions = new Map<string, SessionData>();
const { server, cleanup } = await createServer();


app.get("/sse", async (req, res) => {
  console.log("Received connection");
  const transport = new SSEServerTransport("/message", res);
  const sessionId = transport.sessionId;
  res.setHeader("X-Session-Id", sessionId);        

  const configPath = path.join(process.cwd(), "config.json");
  const rawConfig = await fs.readFile(configPath, "utf-8");
  const baseConfig = JSON.parse(rawConfig);

  // Create per-user config (clone + modify if needed)
  const userConfig = JSON.parse(JSON.stringify(baseConfig)); // deep clone

  sessions.set(sessionId, { transport, config: userConfig})
  await server.connect(transport);


  server.onerror = (err) => {
    console.error(`Server onerror: ${err.stack}`)
  }

  server.onclose = async () => {
    console.log('Server onclose')
    if (process.env.KEEP_SERVER_OPEN !== "1") {
      await cleanup();
      await server.close();
      process.exit(0);
    }
  };
});

app.post("/message", async (req, res) => {
  const sessionId = req.headers["x-session-id"] || req.query.sessionId || req.body?.sessionId;
  
  if (!sessionId || typeof sessionId !== "string" || !sessions.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }

  console.log(`Received message for session ${sessionId}`);
  const session = sessions.get(sessionId)!;
  await session.transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
