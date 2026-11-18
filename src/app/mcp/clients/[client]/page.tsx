import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/config/share';
import { getClient, MCP_CLIENTS } from '@/lib/mcp/clients';
import { McpClientGuide } from '@/components/mcp/McpDocs';
import { McpDocsPage } from '@/components/mcp/McpDocsPage';
import '@/styles/landing.css';
import '@/styles/landing-inspirations.css';
import '@/styles/mcp.css';
import '@/styles/mcp-docs.css';

/** /mcp/clients/<id> — one AI tool's Motvin MCP setup guide, built for every tool in MCP_CLIENTS. */

type Props = { params: Promise<{ client: string }> };

export function generateStaticParams() {
  return MCP_CLIENTS.map((client) => ({ client: client.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const client = getClient((await params).client);
  if (!client) return {};
  return pageMetadata(`${client.name} — Motvin MCP`, `How to connect ${client.name} to Motvin MCP. ${client.intro}`);
}

export default async function McpClientPage({ params }: Props) {
  const client = getClient((await params).client);
  if (!client) notFound();
  return (
    <McpDocsPage>
      <McpClientGuide client={client} />
    </McpDocsPage>
  );
}
