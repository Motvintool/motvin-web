import Link from 'next/link';
import { MCP_CLIENTS, type McpClient } from '@/lib/mcp/clients';
import { McpIcon } from './McpShared';

/**
 * AI-tool cards, each leading to that tool's setup guide.
 *
 * `bento` (the /mcp page) lays nine tools and a "See all" card out as a
 * bento: Claude Code large with its command, ChatGPT and "See all" wide, the
 * rest small. Without it (on /mcp/clients) every card is the same size.
 */

/** The home page cards' corner arrow, shown on hover. */
const ARROW = <img className="mcl-tile-arrow" src="/ASSET/Icons/Motvin/view-apps.svg" alt="" width={18} height={18} aria-hidden="true" />;

/** Which tiles span more than one cell in the bento. */
const SIZE: Record<string, 'xl' | 'wide'> = { 'claude-code': 'xl', chatgpt: 'wide' };

/** The big tile's command, cut short to fit; the guide has the full one. */
const XL_COMMAND = 'claude mcp add --transport http motvin …';

export function ClientGrid({ clients, bento = false }: { clients: McpClient[]; bento?: boolean }) {
  if (!bento) {
    return (
      <ul className="mcl-grid">
        {clients.map((client) => (
          <li key={client.id}>
            <Link href={`/mcp/clients/${client.id}`} className="mcl-card">
              <span className="mcl-card-icon" style={{ color: client.color }}>
                <McpIcon id={client.icon} size={28} />
              </span>
              <span className="mcl-card-name">{client.name}</span>
              {ARROW}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const shown = new Set(clients.map((client) => client.id));
  const more = MCP_CLIENTS.filter((client) => !shown.has(client.id));

  return (
    <ul className="mcl-bento">
      {clients.map((client) => {
        const size = SIZE[client.id];
        return (
          <li key={client.id} className={size ? `is-${size}` : undefined}>
            <Link href={`/mcp/clients/${client.id}`} className="mcl-tile">
              <span className="mcl-tile-icon" style={{ color: client.color }}>
                <McpIcon id={client.icon} size={size === 'xl' ? 34 : 28} />
              </span>
              <span className="mcl-tile-text">
                <b>{client.name}</b>
                {size ? <span>{client.intro}</span> : null}
              </span>
              {size === 'xl' ? <code className="mcl-tile-code">{XL_COMMAND}</code> : null}
              {ARROW}
            </Link>
          </li>
        );
      })}
      <li className="is-wide">
        <Link href="/mcp/clients" className="mcl-tile is-more">
          <span className="mcl-tile-stack" aria-hidden="true">
            {more.slice(0, 4).map((client) => (
              <span key={client.id} style={{ color: client.color }}>
                <McpIcon id={client.icon} size={18} />
              </span>
            ))}
          </span>
          <span className="mcl-tile-text">
            <b>See all {MCP_CLIENTS.length} tools</b>
            <span>{more.filter((client) => client.id !== 'other').map((client) => client.name.replace(/ CLI$/, '')).join(', ')} and any MCP client</span>
          </span>
          {ARROW}
        </Link>
      </li>
    </ul>
  );
}
