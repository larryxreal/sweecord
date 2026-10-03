export type Theme = "dark" | "light" | "midnight";
export const themeOptions: { value: Theme; label: string }[] = [
  { value: "dark", label: "Koyu" },
  { value: "light", label: "Açık" },
  { value: "midnight", label: "Gece" },
];
export function applyTheme(theme: Theme) {
  document.documentElement.dataset['theme'] = theme;
  document.documentElement.classList.toggle("dark", theme !== "light");
  localStorage.setItem("sweecord-theme", theme);
}
export function savedTheme(): Theme {
  const value = localStorage.getItem("sweecord-theme");
  return value === "light" || value === "midnight" ? value : "dark";
}
