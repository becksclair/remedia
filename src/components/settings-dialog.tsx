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

import { GeneralTab, DownloadsTab, QualityTab } from "./settings";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="settings-title">Settings</DialogTitle>
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
          <Button type="submit" data-testid="settings-done" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
