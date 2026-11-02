import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  MCP_RESOURCE_METADATA_PATH,
  type McpAuthExtra,
  verifyMcpAccessToken,
} from "@/lib/mcp/auth";
import { registerGrokBotTools } from "@/lib/mcp/grok-bot-tools";
import {
  MCP_SERVER_INSTRUCTIONS,
  registerModerationTools,
} from "@/lib/mcp/tools";

const mcpHandler = createMcpHandler(
  (server) => {
    registerModerationTools(server);
    registerGrokBotTools(server);
  },
  {
    serverInfo: {
      name: "cursor-directory-community-plugins",
      version: "1.0.0",
    },
    instructions: MCP_SERVER_INSTRUCTIONS,
    // No subscriptions, so every response completes with its request.
    maxSubscriptions: 0,
  },
);

const handler = withMcpAuth(
  async (req) => {
    // Authenticated through the MCP OAuth client, but not on the admin list.
    if (!(req.auth?.extra as McpAuthExtra | undefined)?.isAdmin) {
      return Response.json(
        {
          error: "forbidden",
          error_description:
            "Only Cursor Directory admins can use the Community Plugins MCP server.",
        },
        { status: 403 },
      );
    }

    // Tool results are streamed (SSE) and the tool runs while the body is
    // written, but Next.js applies revalidateTag() calls when the route
    // handler returns. Reading the body here keeps tool side effects, such as
    // invalidating cached plugin pages, inside the handler.
    const res = await mcpHandler(req);
    return new Response(await res.arrayBuffer(), {
      status: res.status,
      headers: res.headers,
    });
  },
  verifyMcpAccessToken,
  { required: true, resourceMetadataPath: MCP_RESOURCE_METADATA_PATH },
);

export { handler as DELETE, handler as GET, handler as POST };
