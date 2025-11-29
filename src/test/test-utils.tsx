/**
 * Test Utilities for Component Testing
 *
 * Provides helpers for rendering components with necessary providers and mocks.
 */

import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { PlaylistProvider } from "@/lib/PlaylistContext";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import { Provider as JotaiProvider } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import {
  downloadLocationAtom,
  downloadModeAtom,
  videoQualityAtom,
  maxResolutionAtom,
  videoFormatAtom,
  audioFormatAtom,
  audioQualityAtom,
  downloadRateLimitAtom,
  maxFileSizeAtom,
  appendUniqueIdAtom,
  uniqueIdTypeAtom,
} from "@/state/settings-atoms";

/**
 * Default download settings for tests - avoids repeating in every test
 */
export const DEFAULT_DOWNLOAD_SETTINGS = [
  [downloadLocationAtom, "/tmp/downloads"],
  [downloadModeAtom, "video"],
  [videoQualityAtom, "best"],
  [maxResolutionAtom, "no-limit"],
  [videoFormatAtom, "best"],
  [audioFormatAtom, "best"],
  [audioQualityAtom, "0"],
  [downloadRateLimitAtom, "unlimited"],
  [maxFileSizeAtom, "unlimited"],
  [appendUniqueIdAtom, true],
  [uniqueIdTypeAtom, "native"],
] as const;

/**
 * Props for the AllTheProviders wrapper
 */
interface AllTheProvidersProps {
  children: ReactNode;
  initialValues?: Iterable<readonly [any, any]>;
}

/**
 * Wrapper component that provides all necessary providers for testing
 */
function AllTheProviders({ children, initialValues = [] }: AllTheProvidersProps) {
  return (
    <JotaiProvider>
      <TauriApiProvider api={mockTauriApi}>
        <PlaylistProvider>
          <HydrateAtoms initialValues={initialValues}>{children}</HydrateAtoms>
        </PlaylistProvider>
      </TauriApiProvider>
    </JotaiProvider>
  );
}

/**
 * Helper component to hydrate atoms in tests
 */
export function HydrateAtoms({
  initialValues,
  children,
}: {
  initialValues: Iterable<readonly [any, any]>;
  children: ReactNode;
}) {
  useHydrateAtoms(initialValues as any);
  return children;
}

/**
 * Custom render function that includes all providers
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & {
    initialAtomValues?: Iterable<readonly [any, any]>;
  },
) {
  const { initialAtomValues = [], ...renderOptions } = options || {};

  // Reset mock state before each render
  mockState.reset();

  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders initialValues={initialAtomValues}>{children}</AllTheProviders>
    ),
    ...renderOptions,
  });
}

/**
 * Helper to create a mock media item
 */
export function createMockMediaItem(
  url: string,
  overrides?: Partial<{
    title: string;
    thumbnail: string;
    previewUrl: string;
    audioOnly: boolean;
    progress: number;
    status: "Pending" | "Downloading" | "Done" | "Error" | "Cancelled";
  }>,
) {
  return {
    id: url,
    url,
    title: url,
    thumbnail: "",
    previewUrl: undefined,
    audioOnly: false,
    progress: 0,
    status: "Pending" as const,
    ...overrides,
  };
}

/**
 * Helper to wait for async state updates
 */
export function waitForAsync(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to create mock row selection state
 */
export function createMockRowSelection(selectedIndices: number[]): Record<string, boolean> {
  return selectedIndices.reduce(
    (acc, index) => {
      acc[index.toString()] = true;
      return acc;
    },
    {} as Record<string, boolean>,
  );
}

/**
 * Create a wrapper for renderHook with optional atom overrides
 * Merges DEFAULT_DOWNLOAD_SETTINGS with any overrides
 */
export function createTestWrapper(atomOverrides: Array<readonly [any, any]> = []) {
  // Merge defaults with overrides (overrides take precedence)
  const overrideMap = new Map(atomOverrides.map(([atom, val]) => [atom, val]));
  const merged: Array<readonly [any, any]> = DEFAULT_DOWNLOAD_SETTINGS.map(([atom, defaultVal]) =>
    overrideMap.has(atom)
      ? ([atom, overrideMap.get(atom)] as const)
      : ([atom, defaultVal] as const),
  );
  // Add any overrides that aren't in defaults
  for (const [atom, val] of atomOverrides) {
    if (!DEFAULT_DOWNLOAD_SETTINGS.some(([a]) => a === atom)) {
      merged.push([atom, val] as const);
    }
  }

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <JotaiProvider>
        <TauriApiProvider api={mockTauriApi}>
          <PlaylistProvider>
            <HydrateAtoms initialValues={merged}>{children}</HydrateAtoms>
          </PlaylistProvider>
        </TauriApiProvider>
      </JotaiProvider>
    );
  };
}

// Re-export everything from @testing-library/react
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

// Re-export commonly used atoms for convenience
export {
  downloadLocationAtom,
  downloadModeAtom,
  videoQualityAtom,
  maxResolutionAtom,
  videoFormatAtom,
  audioFormatAtom,
  audioQualityAtom,
  downloadRateLimitAtom,
  maxFileSizeAtom,
  appendUniqueIdAtom,
  uniqueIdTypeAtom,
} from "@/state/settings-atoms";
