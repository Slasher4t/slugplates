import { useTheme, type ThemeMode } from "../context/ThemeContext";
import { SegmentedControl } from "./SegmentedControl";

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <SegmentedControl options={OPTIONS} value={theme} onChange={setTheme} ariaLabel="Appearance" />;
}
