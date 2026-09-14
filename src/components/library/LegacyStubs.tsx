/**
 * Hidden DOM anchors the legacy JS reaches for by id.
 *
 * The static site's motvin-icons.js has a `#legacy-elements` bag holding the
 * old hero-stats and collection-card cache used by scripts that are no longer
 * ported. Keeping them in the DOM as inert stubs means any residual code that
 * happens to look them up finds a valid empty node instead of crashing on a
 * null query.
 */
export function LegacyStubs() {
  return (
    <div id="legacy-elements" hidden aria-hidden="true">
      <div id="stat-icons" />
      <div id="stat-libraries" />
      <div id="stat-styles" />
      <div id="icon-of-day" />
      <div id="collections-grid" />
      <div id="categories-grid" />
      <button id="btn-collections" hidden />
      <button id="btn-make-consistent" hidden />
      <button id="btn-new-system" hidden />
      <div id="filter-category" />
    </div>
  );
}
