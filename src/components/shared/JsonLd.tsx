/**
 * Structured data (JSON-LD) for search engines: a page describes itself in schema.org terms — who runs the site,
 * where a page sits in it — so results can show Motvin's name, logo and a path like "Apps › Canva".
 *
 * Rendered by the server into the page, as Next recommends. `<` is escaped so a value from the library (an app's
 * name) can never close the script tag.
 */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
