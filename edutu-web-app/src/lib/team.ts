/**
 * Single source of truth for the Edutu team roster, shared by the About page
 * founder block and the Meet-the-team row so a name, role, or portrait only
 * ever has to change in one place.
 */

export interface TeamMember {
  name: string;
  role: string;
  /** portrait URL — omitted members render an initials monogram instead */
  src?: string;
  /** card background */
  cardBg: string;
  /** organic blob behind the portrait */
  blob: string;
  /** text colour that reads on the card */
  text: string;
}

export const FOUNDER_IMG = "https://www.top100afl.com/team/Paul%20light.jpg.png";

export const team: TeamMember[] = [
  {
    name: "Nwosu Paul Light",
    role: "Founder & CTO",
    src: FOUNDER_IMG,
    cardBg: "#2F4BE0",
    blob: "#FFFFFF",
    text: "#FFFFFF",
  },
  {
    name: "Pelumi Adebayo",
    role: "Product Manager",
    cardBg: "#F5CE1B",
    blob: "#F4A6C7",
    text: "#3A2E05",
  },
  {
    name: "Darlington Amadi",
    role: "Head of Community",
    cardBg: "#0EA5A5",
    blob: "#FDE047",
    text: "#04201F",
  },
];

/** "Nwosu Paul Light" → "NP"; used when a member has no portrait. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
