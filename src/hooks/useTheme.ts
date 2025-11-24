import { useEffect, useMemo } from "react";
import { useAtomValue } from "jotai";
import { themeAtom } from "@/state/settings-atoms";

/**
 * Hook to apply theme to the document based on user preference and system theme
 * Detects system theme preference using prefers-color-scheme media query
 */
export function useTheme(): void {
  const theme = useAtomValue(themeAtom);

  // Performance optimization: Memoize DOM query
  const htmlElement = useMemo(() => {
    if (typeof document !== "undefined") {
      return document.documentElement;
    }
    return null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !htmlElement) return;

    const applyTheme = () => {
      try {
        let effectiveTheme: "light" | "dark" = "light";

        if (theme === "system") {
          // Check system preference with error handling
          if (!window.matchMedia) return;

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
      } catch (error) {
        console.warn("Theme application failed:", error);
      }
    };

    applyTheme();

    try {
      // Listen for system theme changes
      if (!window.matchMedia) return;

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      if (!mediaQuery) return;

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
    } catch (error) {
      console.warn("Theme detection failed:", error);
    }
  }, [theme, htmlElement]);
}
