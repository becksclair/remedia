import { Settings, Download, Sliders } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRef, useEffect, useCallback } from "react";

import { GeneralTab, DownloadsTab, QualityTab } from "./settings";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const focusInitialElement = useCallback(() => {
    const contentEl = dialogContentRef.current;
    if (!contentEl) return;

    const explicitTarget = contentEl.querySelector<HTMLElement>("[data-dialog-initial-focus]");
    if (explicitTarget && typeof explicitTarget.focus === "function") {
      explicitTarget.focus();
      return;
    }

    const fallbackTarget = contentEl.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (fallbackTarget && typeof fallbackTarget.focus === "function") {
      fallbackTarget.focus();
      return;
    }

    dialogTitleRef.current?.focus();
  }, []);

  const restoreFocus = useCallback(() => {
    const previous = lastFocusedElementRef.current;
    if (previous && typeof previous.focus === "function") {
      previous.focus();
    }
    lastFocusedElementRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      const raf = typeof window !== "undefined" ? window.requestAnimationFrame : undefined;
      if (typeof raf === "function") {
        raf(() => {
          restoreFocus();
        });
      } else {
        restoreFocus();
      }
    }
  }, [open, restoreFocus]);

  useEffect(() => {
    if (open) {
      lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
      const raf = typeof window !== "undefined" ? window.requestAnimationFrame : undefined;
      if (typeof raf === "function") {
        raf(() => {
          focusInitialElement();
        });
      } else {
        focusInitialElement();
      }
    }
  }, [open, focusInitialElement]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        restoreFocus();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, restoreFocus],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle data-testid="settings-title" ref={dialogTitleRef} tabIndex={-1}>
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure your download preferences and quality settings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3" role="tablist">
            <TabsTrigger value="general" className="gap-2" role="tab" aria-selected="true">
              <Settings className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="downloads" className="gap-2" role="tab" aria-selected="false">
              <Download className="h-4 w-4" />
              Downloads
            </TabsTrigger>
            <TabsTrigger value="quality" className="gap-2" role="tab" aria-selected="false">
              <Sliders className="h-4 w-4" />
              Quality
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="pt-4">
            <GeneralTab />
          </TabsContent>

          <TabsContent value="downloads" className="pt-4">
            <DownloadsTab />
          </TabsContent>

          <TabsContent value="quality" className="pt-4">
            <QualityTab />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="submit" data-testid="settings-done" onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
