import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/config/share';
import { McpClientsIndex } from '@/components/mcp/McpDocs';
import { McpDocsPage } from '@/components/mcp/McpDocsPage';
import '@/styles/landing.css';
import '@/styles/landing-inspirations.css';
import '@/styles/mobile-menu.css';
import '@/styles/mcp.css';
import '@/styles/mcp-docs.css';

export const metadata: Metadata = pageMetadata(
  'Choose your tool — Motvin MCP',
  'Set up Motvin MCP in Claude, Claude Code, Cursor, ChatGPT, Codex, VS Code, Gemini CLI, Windsurf and other AI tools.',
);

/** /mcp/clients — every AI tool with a setup guide. */
export default function McpClientsPage() {
  return (
    <McpDocsPage>
      <McpClientsIndex />
    </McpDocsPage>
  );
}
