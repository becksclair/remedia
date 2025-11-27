/**
 * Test Utilities for Component Testing
 *
 * Provides helpers for rendering components with necessary providers and mocks.
 */

import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { TauriApiProvider } from "@/lib/TauriApiContext";
import { mockTauriApi, mockState } from "@/lib/tauri-api.mock";
import { Provider as JotaiProvider } from "jotai";
import { useHydrateAtoms } from "jotai/utils";

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
        <HydrateAtoms initialValues={initialValues}>{children}</HydrateAtoms>
      </TauriApiProvider>
    </JotaiProvider>
  );
}

/**
 * Helper component to hydrate atoms in tests
 */
function HydrateAtoms({
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

// Re-export everything from @testing-library/react
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
