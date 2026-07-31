export interface NavItem {
  href: string;
  label: string;
  /** lucide-react icon name used by the sidebar/mobile nav. */
  icon: "home" | "github" | "calendar" | "settings";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/github", label: "GitHub", icon: "github" },
  { href: "/standup", label: "Standup", icon: "calendar" },
  { href: "/config", label: "Configure", icon: "settings" },
];
