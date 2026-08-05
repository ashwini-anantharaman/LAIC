/**
 * Recolour an inlined SVG's ink.
 *
 * Several brand icons ship cream or dark because they also sit in the cream top
 * app bar; on the maroon sheets, green rows and the glass tab bar they need a
 * different colour.
 *
 * BOTH fill and stroke are replaced. The Play icon's outer ring is a
 * `<circle stroke="#FFF4D7" stroke-width="2">` with no fill at all, so a
 * fill-only recolour left that ring the original colour while the rest of the
 * icon changed — it is the only tab icon drawn with a stroke.
 *
 * `fill="none"` / `stroke="none"` are deliberately left alone: "none" means the
 * shape intentionally has no paint there (it is usually on the <svg> element
 * itself), and painting it would flood the whole box or outline it.
 */
export function tintSvg(svg: string, color: string): string {
  return svg
    .replace(/fill="(?!none)[^"]*"/g, `fill="${color}"`)
    .replace(/stroke="(?!none)[^"]*"/g, `stroke="${color}"`);
}
