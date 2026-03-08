"use client";

import { Settings, Zap, Bot, Palette, Cog, Plug, DollarSign, Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSettingsStore, type SettingsTab } from "@/stores/settingsStore";
import { AdvancedTab } from "./tabs/AdvancedTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { ConnectorsTab } from "./tabs/ConnectorsTab";
import { GeneralSettingsTab } from "./tabs/GeneralSettingsTab";
import { ModelsTab } from "./tabs/ModelsTab";
import { QuotaTab } from "./tabs/QuotaTab";
import { ShortcutsTab } from "./tabs/ShortcutsTab";
import { SkillsTab } from "./tabs/SkillsTab";

const tabs: { value: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { value: "general", label: "通用", icon: <Settings className="w-4 h-4" /> },
  { value: "shortcuts", label: "快捷键", icon: <Keyboard className="w-4 h-4" /> },
  { value: "skills", label: "Skills", icon: <Zap className="w-4 h-4" /> },
  { value: "connectors", label: "连接器", icon: <Plug className="w-4 h-4" /> },
  { value: "models", label: "模型", icon: <Bot className="w-4 h-4" /> },
  { value: "appearance", label: "外观", icon: <Palette className="w-4 h-4" /> },
  { value: "advanced", label: "高级", icon: <Cog className="w-4 h-4" /> },
  { value: "quota", label: "配额", icon: <DollarSign className="w-4 h-4" /> },
];

export function SettingsDialog() {
  const { isOpen, activeTab, closeSettings, setActiveTab } = useSettingsStore();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent className="max-w-[48rem] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">设置</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as SettingsTab)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="mx-6 mt-4 mb-0 justify-start bg-transparent border-b border-border-light rounded-none p-0 h-auto gap-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
              >
                {tab.icon}
                <span className="text-sm">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="general" className="mt-0 h-full">
              <GeneralSettingsTab onClose={closeSettings} />
            </TabsContent>
            <TabsContent value="shortcuts" className="mt-0 h-full">
              <ShortcutsTab />
            </TabsContent>
            <TabsContent value="skills" className="mt-0 h-full">
              <SkillsTab />
            </TabsContent>
            <TabsContent value="connectors" className="mt-0 h-full">
              <ConnectorsTab />
            </TabsContent>
            <TabsContent value="models" className="mt-0 h-full">
              <ModelsTab onClose={closeSettings} />
            </TabsContent>
            <TabsContent value="appearance" className="mt-0 h-full">
              <AppearanceTab onClose={closeSettings} />
            </TabsContent>
            <TabsContent value="advanced" className="mt-0 h-full">
              <AdvancedTab onClose={closeSettings} />
            </TabsContent>
            <TabsContent value="quota" className="mt-0 h-full">
              <QuotaTab onClose={closeSettings} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
