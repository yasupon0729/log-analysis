import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // Where to look for CSS declarations
  include: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./pages/**/*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
  ],

  // Files to exclude
  exclude: [],

  // CSS reset and preflight styles
  preflight: true,

  // Output directory
  outdir: "styled-system",

  // Theme configuration
  theme: {
    extend: {
      tokens: {
        colors: {
          // Primary color (Blue)
          primary: {
            50: { value: "#e6f2ff" },
            100: { value: "#bae3ff" },
            200: { value: "#7cc4fa" },
            300: { value: "#47a3f3" },
            400: { value: "#2186eb" },
            500: { value: "#0967d2" },
            600: { value: "#0552b5" },
            700: { value: "#03449e" },
            800: { value: "#01337d" },
            900: { value: "#002159" },
            950: { value: "#001135" },
          },

          // Secondary color (Green)
          secondary: {
            50: { value: "#ecfdf5" },
            100: { value: "#d1fae5" },
            200: { value: "#a7f3d0" },
            300: { value: "#6ee7b7" },
            400: { value: "#34d399" },
            500: { value: "#10b981" },
            600: { value: "#059669" },
            700: { value: "#047857" },
            800: { value: "#065f46" },
            900: { value: "#064e3b" },
            950: { value: "#022c22" },
          },

          // Tertiary color (Pink)
          tertiary: {
            50: { value: "#fdf2f8" },
            100: { value: "#fce7f3" },
            200: { value: "#fbcfe8" },
            300: { value: "#f9a8d4" },
            400: { value: "#f472b6" },
            500: { value: "#ec4899" },
            600: { value: "#db2777" },
            700: { value: "#be185d" },
            800: { value: "#9d174d" },
            900: { value: "#831843" },
            950: { value: "#500724" },
          },

          // Dark theme backgrounds and surfaces
          dark: {
            bg: { value: "#0f172a" },
            bgSubtle: { value: "#0c1425" },
            surface: { value: "#1e293b" },
            surfaceHover: { value: "#263244" },
            surfaceActive: { value: "#334155" },
            border: { value: "#334155" },
            borderSubtle: { value: "#1e293b" },
          },

          // Text colors for dark theme
          text: {
            primary: { value: "#f1f5f9" },
            secondary: { value: "#cbd5e1" },
            tertiary: { value: "#94a3b8" },
            disabled: { value: "#64748b" },
            inverse: { value: "#0f172a" },
          },

          // Status colors
          status: {
            error: { value: "#ef4444" },
            errorBg: { value: "rgba(239, 68, 68, 0.1)" },
            warning: { value: "#f59e0b" },
            warningBg: { value: "rgba(245, 158, 11, 0.1)" },
            success: { value: "#10b981" },
            successBg: { value: "rgba(16, 185, 129, 0.1)" },
            info: { value: "#3b82f6" },
            infoBg: { value: "rgba(59, 130, 246, 0.1)" },
          },
        },

        fonts: {
          body: {
            value:
              "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          },
          mono: {
            value:
              "'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          },
        },

        fontSizes: {
          xs: { value: "0.75rem" }, // 12px
          sm: { value: "0.875rem" }, // 14px
          md: { value: "1rem" }, // 16px
          lg: { value: "1.125rem" }, // 18px
          xl: { value: "1.25rem" }, // 20px
          "2xl": { value: "1.5rem" }, // 24px
          "3xl": { value: "1.875rem" }, // 30px
          "4xl": { value: "2.25rem" }, // 36px
          "5xl": { value: "3rem" }, // 48px
        },

        fontWeights: {
          thin: { value: "100" },
          light: { value: "300" },
          normal: { value: "400" },
          medium: { value: "500" },
          semibold: { value: "600" },
          bold: { value: "700" },
          extrabold: { value: "800" },
          black: { value: "900" },
        },

        lineHeights: {
          none: { value: "1" },
          tight: { value: "1.25" },
          snug: { value: "1.375" },
          normal: { value: "1.5" },
          relaxed: { value: "1.625" },
          loose: { value: "2" },
        },

        letterSpacings: {
          tighter: { value: "-0.05em" },
          tight: { value: "-0.025em" },
          normal: { value: "0" },
          wide: { value: "0.025em" },
          wider: { value: "0.05em" },
          widest: { value: "0.1em" },
        },

        spacing: {
          0: { value: "0" },
          1: { value: "0.25rem" }, // 4px
          2: { value: "0.5rem" }, // 8px
          3: { value: "0.75rem" }, // 12px
          4: { value: "1rem" }, // 16px
          5: { value: "1.25rem" }, // 20px
          6: { value: "1.5rem" }, // 24px
          7: { value: "1.75rem" }, // 28px
          8: { value: "2rem" }, // 32px
          10: { value: "2.5rem" }, // 40px
          12: { value: "3rem" }, // 48px
          14: { value: "3.5rem" }, // 56px
          16: { value: "4rem" }, // 64px
          20: { value: "5rem" }, // 80px
          24: { value: "6rem" }, // 96px
          28: { value: "7rem" }, // 112px
          32: { value: "8rem" }, // 128px
        },

        radii: {
          none: { value: "0" },
          sm: { value: "0.125rem" }, // 2px
          md: { value: "0.375rem" }, // 6px
          lg: { value: "0.5rem" }, // 8px
          xl: { value: "0.75rem" }, // 12px
          "2xl": { value: "1rem" }, // 16px
          "3xl": { value: "1.5rem" }, // 24px
          full: { value: "9999px" },
        },

        borders: {
          none: { value: "none" },
          thin: { value: "1px solid" },
          thick: { value: "2px solid" },
        },

        shadows: {
          xs: { value: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
          sm: {
            value:
              "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
          },
          md: {
            value:
              "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
          },
          lg: {
            value:
              "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
          },
          xl: {
            value:
              "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
          },
          "2xl": { value: "0 25px 50px -12px rgb(0 0 0 / 0.25)" },
          inner: { value: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" },
          none: { value: "none" },
        },

        zIndex: {
          hide: { value: "-1" },
          base: { value: "0" },
          dropdown: { value: "1000" },
          sticky: { value: "1100" },
          fixed: { value: "1200" },
          overlay: { value: "1300" },
          modal: { value: "1400" },
          popover: { value: "1500" },
          toast: { value: "1600" },
          tooltip: { value: "1700" },
        },
      },

      semanticTokens: {
        colors: {
          // Semantic color mappings
          background: {
            value: { base: "{colors.dark.bg}" },
          },
          backgroundSubtle: {
            value: { base: "{colors.dark.bgSubtle}" },
          },
          surface: {
            value: { base: "{colors.dark.surface}" },
          },
          surfaceHover: {
            value: { base: "{colors.dark.surfaceHover}" },
          },
          surfaceActive: {
            value: { base: "{colors.dark.surfaceActive}" },
          },
          border: {
            value: { base: "{colors.dark.border}" },
          },
          borderSubtle: {
            value: { base: "{colors.dark.borderSubtle}" },
          },
          text: {
            value: { base: "{colors.text.primary}" },
          },
          textSecondary: {
            value: { base: "{colors.text.secondary}" },
          },
          textTertiary: {
            value: { base: "{colors.text.tertiary}" },
          },
          textDisabled: {
            value: { base: "{colors.text.disabled}" },
          },
        },
      },
    },
  },

  // Global styles
  globalCss: {
    html: {
      height: "100%",
      scrollBehavior: "smooth",
    },
    body: {
      bg: "background",
      color: "text",
      fontFamily: "body",
      fontSize: "md",
      lineHeight: "normal",
      height: "100%",
      WebkitFontSmoothing: "antialiased",
      MozOsxFontSmoothing: "grayscale",
    },
    "*, *::before, *::after": {
      borderColor: "border",
    },
    "*::selection": {
      bg: "primary.600",
      color: "white",
    },
    // Scrollbar styles
    "::-webkit-scrollbar": {
      width: "10px",
      height: "10px",
    },
    "::-webkit-scrollbar-track": {
      bg: "dark.bg",
    },
    "::-webkit-scrollbar-thumb": {
      bg: "dark.border",
      borderRadius: "md",
      _hover: {
        bg: "primary.700",
      },
    },
    // Focus styles
    "*:focus-visible": {
      outline: "2px solid",
      outlineColor: "primary.500",
      outlineOffset: "2px",
    },
  },

  // JSX framework
  jsxFramework: "react",

  // Utilities
  utilities: {
    extend: {
      // Custom utilities for common patterns
      truncate: {
        className: "truncate",
        values: ["single", "multi"],
        transform(value: string) {
          if (value === "single") {
            return {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            };
          }
          return {
            display: "-webkit-box",
            overflow: "hidden",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          };
        },
      },
    },
  },
});
