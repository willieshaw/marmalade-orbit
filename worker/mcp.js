// Just enough of MCP's HTTP transport for a hosted agent to call the star tools:
// stateless JSON-RPC over POST, no streaming and no sessions.

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'add_stars',
    description: "Award Grace gold stars on her sticker chart, one per thing she did. Use when Willie says she earned a star. Pass the reply on to him.",
    inputSchema: {
      type: 'object',
      properties: {
        labels: { type: 'array', items: { type: 'string', maxLength: 80 }, minItems: 1, maxItems: 10, description: 'What she did, in a few words, one entry per star.' },
        date: { type: 'string', description: 'YYYY-MM-DD, only if the star is for an earlier day. Leave out for today.' },
      },
      required: ['labels'],
    },
    annotations: { title: 'Add gold stars', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'undo_last_star',
    description: 'Remove the newest star on the chart, whoever added it.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Undo the last star', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  {
    name: 'list_stars',
    description: "List Grace's stars, newest first, with the ids edit_star and delete_star need. Can search by words or date.",
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Words from the label, or part of a date like 2026-10.' } },
    },
    annotations: { title: 'List stars', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'edit_star',
    description: "Fix the label or date of any star. Find its id with list_stars first.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id from list_stars.' },
        label: { type: 'string', maxLength: 80, description: 'The new label, if it should change.' },
        date: { type: 'string', description: 'The new date as YYYY-MM-DD, if it should change.' },
      },
      required: ['id'],
    },
    annotations: { title: 'Edit a star', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'delete_star',
    description: "Delete any star. Find its id with list_stars first, and only do this when Willie asks.",
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The id from list_stars.' } },
      required: ['id'],
    },
    annotations: { title: 'Delete a star', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  {
    name: 'star_status',
    description: "How many stars Grace has, her latest stars, and how far off the next reward is.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Star status', readOnlyHint: true, openWorldHint: false },
  },
];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const reply = (id, result) => json({ jsonrpc: '2.0', id, result });
const failure = (id, code, message) => json({ jsonrpc: '2.0', id, error: { code, message } });

// run(name, args) answers with { text, isError }.
export async function handleMcp(request, run) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  let message;
  try {
    message = await request.json();
  } catch {
    return failure(null, -32700, 'Parse error');
  }
  const { id, method, params } = message ?? {};
  if (id === undefined) return new Response(null, { status: 202 });

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'marmalade-orbit-stars', version: '1.0.0' },
        instructions: "Awards gold stars on Grace's sticker chart for Willie. Award right away when he asks, then pass on the reply. Only edit or delete stars when he asks.",
      });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: TOOLS });
    case 'tools/call': {
      if (!TOOLS.some(t => t.name === params?.name)) return failure(id, -32602, 'Unknown tool');
      const { text, isError } = await run(params.name, params.arguments ?? {});
      return reply(id, { content: [{ type: 'text', text }], isError });
    }
    default:
      return failure(id, -32601, 'Method not found');
  }
}
