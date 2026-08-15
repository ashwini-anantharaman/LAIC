import { ComingSoon } from "../components/coming-soon";

/**
 * Curated Deals — reserved by the design (Figma 870:752), not yet specified.
 *
 * The Play card is real because the design draws it; what is behind it is not
 * decided, so this says so plainly rather than showing invented boards. Same
 * treatment Analysis gets.
 */
export default function CuratedDealsScreen() {
  return (
    <ComingSoon
      title="Curated Deals"
      blurb="Hand-picked boards, chosen to teach one thing at a time. Not ready yet."
    />
  );
}
