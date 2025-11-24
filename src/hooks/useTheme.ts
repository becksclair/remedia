import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { themeAtom } from "@/state/settings-atoms";

/**
 * Hook to apply theme to the document based on user preference and system theme
 * Detects system theme preference using prefers-color-scheme media query
 */
export function useTheme(): void {
  const theme = useAtomValue(themeAtom);

  useEffect(() => {
    const applyTheme = () => {
      const htmlElement = document.documentElement;
      let effectiveTheme: "light" | "dark" = "light";

      if (theme === "system") {
        // Check system preference
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        effectiveTheme = prefersDark ? "dark" : "light";
      } else {
        effectiveTheme = theme;
      }

      // Apply theme by toggling the .dark class
      if (effectiveTheme === "dark") {
        htmlElement.classList.add("dark");
      } else {
        htmlElement.classList.remove("dark");
      }
    };

    applyTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // Handle changes (use addEventListener for better compatibility)
    const handleChange = () => {
      if (theme === "system") {
        applyTheme();
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [theme]);
}
