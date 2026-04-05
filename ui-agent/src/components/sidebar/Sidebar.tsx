"use client";

import {
  Plus,
  MessageSquare,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Filter,
  Settings,
  Info,
  ArrowLeft,
  MoreHorizontal,
  Trash2,
  Check,
  X,
  TrendingUp,
  ListChecks,
  Mail,
  User,
  Box,
  ChevronUp,
  Sparkles,
  Clock,
  Bot,
  Compass,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { FiEdit3, FiSearch, FiBook } from "react-icons/fi";
import { SidebarQuotaBar } from "@/components/quota/SidebarQuotaBar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import type { GatewaySessionRow } from "@/types/clawdbot";
import appMeta from "../../../package.json";

interface SidebarProps {
  sessions?: GatewaySessionRow[];
  unreadMap?: Record<string, boolean>;
  currentSessionKey?: string | null;
  onSelectSession?: (key: string) => void;
  onNewSession?: () => void;
  onRenameSession?: (key: string) => void;
  onDeleteSession?: (key: string) => void;
  onViewSession?: (key: string) => void;
  filterKind?: "all" | "direct" | "group" | "global" | "unknown";
  onFilterChange?: (value: SidebarProps["filterKind"]) => void;
  unreadOnly?: boolean;
  onUnreadToggle?: (value: boolean) => void;
  sortMode?: "recent" | "name";
  onSortChange?: (value: SidebarProps["sortMode"]) => void;
  selectionMode?: boolean;
  selectedKeys?: string[];
  onToggleSelectionMode?: () => void;
  onToggleSelectedKey?: (key: string) => void;
  onSelectAllKeys?: (keys: string[]) => void;
  onClearSelection?: () => void;
  onBatchDelete?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isLoading?: boolean;
  onOpenKnowledge?: () => void;
  onOpenDiscover?: () => void;
  onOpenChannel?: () => void;
  onOpenPersonaSettings?: () => void;
  onOpenCronJobs?: () => void;
  onOpenAgentManage?: () => void;
  onOpenTaskSearch?: () => void;
  onGoHome?: () => void;
  assistantVisible?: boolean;
  onToggleAssistantVisible?: () => void;
  activeView?: "chat" | "channel" | "discover" | "knowledge" | "persona" | "my";
  searchShortcutLabel?: string;
  newSessionShortcutLabel?: string;
}

const Sidebar = ({
  sessions = [],
  unreadMap = {},
  currentSessionKey = null,
  onSelectSession = () => {},
  onNewSession = () => {},
  onRenameSession = () => {},
  onDeleteSession = () => {},
  onViewSession = () => {},
  filterKind = "all",
  onFilterChange = () => {},
  unreadOnly = false,
  onUnreadToggle = () => {},
  sortMode = "recent",
  onSortChange = () => {},
  selectionMode = false,
  selectedKeys = [],
  onToggleSelectionMode = () => {},
  onToggleSelectedKey = () => {},
  onSelectAllKeys = () => {},
  onClearSelection = () => {},
  onBatchDelete = () => {},
  isCollapsed = false,
  onToggleCollapse = () => {},
  isLoading = false,
  onOpenKnowledge = () => {},
  onOpenDiscover = () => {},
  onOpenChannel = () => {},
  onOpenPersonaSettings = () => {},
  onOpenCronJobs = () => {},
  onOpenAgentManage = () => {},
  onOpenTaskSearch = () => {},
  onGoHome = () => {},
  assistantVisible = true,
  onToggleAssistantVisible = () => {},
  activeView = "chat",
  searchShortcutLabel = "Ctrl+Cmd+K",
  newSessionShortcutLabel = "Ctrl+Cmd+N",
}: SidebarProps) => {
  // 任务列表收缩状态
  const [isTasksExpanded, setIsTasksExpanded] = useState(true);
  // 品牌图标悬停状态（用于收起时显示返回箭头）
  const [isHoveringBrand, setIsHoveringBrand] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [versionPopupOpen, setVersionPopupOpen] = useState(false);
  const { openSettings } = useSettingsStore();

  // Character quotes - random selection
  const characterQuotes = useMemo(
    () => [
      "有时候不用急着得到答案，只要继续走下去，很多事情会慢慢变得清楚。",
      "如果现在觉得有点累，就先停一下也没关系，没有人规定必须一直向前。",
      "我觉得你已经比之前更好了，只是你自己还没有注意到这些变化。",
      "有些事情现在看不明白，但以后回头的时候，你会理解它的意义。",
      "你不用总是表现得那么坚强，偶尔放松下来也是很正常的事情。",
      "就算不知道结果会怎样，只要是你认真选择的路，就没有问题。",
      "有时候安静下来，比一直寻找答案，更容易知道自己该做什么。",
      "我会一直听你说，所以不用急，可以慢慢把想法整理清楚。",
      "也许现在还不确定方向，但这不代表你走错了，只是还在路上。",
      "和别人不一样也没关系，你本来就不需要变成任何人的样子。",
    ],
    [],
  );

  const randomQuote = characterQuotes[0] ?? "";

  // 版本更新内容
  const versionUpdates = [
    "新增知识库卡片模式支持",
    "新增知识库文档批量删除",
    "优化对话输入框交互",
    "修复若干已知问题",
  ];

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastScrollTopRef = useRef(0);
  const lastSessionKeysRef = useRef<string[]>([]);
  const sessionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Mock functions for search and library
  const handleSearchClick = () => {
    onOpenTaskSearch();
  };

  const handleLibraryClick = () => {
    onOpenKnowledge();
  };
  const handleDiscoverClick = () => {
    onOpenDiscover();
  };
  const handleChannelClick = () => {
    onOpenChannel();
  };

  const handlePersonaSettingsClick = () => {
    onOpenPersonaSettings();
  };

  const handleCronJobsClick = () => {
    onOpenCronJobs();
  };

  const handleAgentManageClick = () => {
    onOpenAgentManage();
  };

  const resolveTitle = (session: GatewaySessionRow) =>
    session.label || session.derivedTitle || session.displayName || "新建对话";

  const resolveUpdatedAt = (session: GatewaySessionRow) => {
    if (!session.updatedAt) return "—";
    return new Date(session.updatedAt).toLocaleString("zh-CN", { hour12: false });
  };

  useEffect(() => {
    if (!scrollAreaRef.current) return;
    viewportRef.current = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleScroll = () => {
      lastScrollTopRef.current = viewport.scrollTop;
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextKeys = sessions.map((session) => session.key);
    if (nextKeys.join("|") === lastSessionKeysRef.current.join("|")) return;
    lastSessionKeysRef.current = nextKeys;
    requestAnimationFrame(() => {
      viewport.scrollTop = lastScrollTopRef.current;
    });
  }, [sessions]);

  useEffect(() => {
    if (!currentSessionKey) return;
    const node = sessionRefs.current[currentSessionKey];
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
  }, [currentSessionKey, sessions]);

  const isAllSelected = sessions.length > 0 && selectedKeys.length === sessions.length;
  const aboutDialog = (
    <>
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="max-w-[640px] p-0 max-h-[80vh] flex flex-col">
          {/* 标题 */}
          <div className="px-5 pt-5 pb-3 border-b border-border-light flex items-center gap-2 flex-shrink-0">
            <DialogTitle className="text-base font-semibold">关于 Hovi</DialogTitle>
            <button
              onClick={() => setVersionPopupOpen(true)}
              className="p-1 rounded-md hover:bg-surface-subtle transition-colors"
              title="版本和作者信息"
            >
              <Info className="w-3.5 h-3.5 text-text-tertiary" />
            </button>
          </div>

          {/* 内容区域 */}
          <div className="flex-1 overflow-y-auto scrollbar-default p-5">
            {/* 角色卡片 */}
            <div className="rounded-lg border border-border-light p-4 mb-4">
              <div className="flex items-center gap-3">
                <img
                  src="/img/logo.png"
                  alt="Hovi"
                  className="w-14 h-14 rounded-lg object-contain flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text-primary">赫薇 Hovi</div>
                  <div className="text-xs text-text-tertiary">虚拟个人助手</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-text-secondary leading-relaxed">{randomQuote}</div>
            </div>

            {/* Tabs - 功能/使用/问答 */}
            <Tabs defaultValue="feature" className="mt-4">
              <TabsList className="w-full justify-start gap-1 bg-transparent h-auto p-0 mb-3 border-b border-border-light rounded-none">
                <TabsTrigger
                  value="feature"
                  className="text-xs px-3 py-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
                >
                  功能
                </TabsTrigger>
                <TabsTrigger
                  value="guide"
                  className="text-xs px-3 py-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
                >
                  使用
                </TabsTrigger>
                <TabsTrigger
                  value="faq"
                  className="text-xs px-3 py-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
                >
                  问答
                </TabsTrigger>
                <TabsTrigger
                  value="knowledge"
                  className="text-xs px-3 py-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
                >
                  知识库
                </TabsTrigger>
                <TabsTrigger
                  value="persona"
                  className="text-xs px-3 py-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
                >
                  角色
                </TabsTrigger>
                <TabsTrigger
                  value="project"
                  className="text-xs px-3 py-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
                >
                  项目
                </TabsTrigger>
              </TabsList>

              {/* 功能介绍 */}
              <TabsContent value="feature" className="mt-0 space-y-2">
                <div className="text-xs text-text-secondary leading-relaxed">
                  Hovi 是专注于个人效率提升的 AI
                  助手平台，通过自然语言交互帮助你管理任务、整理信息、优化工作流程。
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">智能对话</div>
                    <div className="text-xs text-text-tertiary mt-0.5">自然语言交互，任务执行</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">虚拟形象</div>
                    <div className="text-xs text-text-tertiary mt-0.5">实时对话可视化交互</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">语音交互</div>
                    <div className="text-xs text-text-tertiary mt-0.5">语音输入输出对话</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">知识管理</div>
                    <div className="text-xs text-text-tertiary mt-0.5">构建个人知识库</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">自动化流程</div>
                    <div className="text-xs text-text-tertiary mt-0.5">重复工作自动化处理</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">会话管理</div>
                    <div className="text-xs text-text-tertiary mt-0.5">任务追踪与复盘</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">设备控制</div>
                    <div className="text-xs text-text-tertiary mt-0.5">电脑手机智能设备</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">文件处理</div>
                    <div className="text-xs text-text-tertiary mt-0.5">文档图片音视频</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">数据处理</div>
                    <div className="text-xs text-text-tertiary mt-0.5">数据分析可视化</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">网络搜索</div>
                    <div className="text-xs text-text-tertiary mt-0.5">实时信息检索</div>
                  </div>
                  <div className="rounded border border-border-light p-2">
                    <div className="text-xs font-medium text-text-primary">技能市场</div>
                    <div className="text-xs text-text-tertiary mt-0.5">自定义工作流</div>
                  </div>
                </div>
                <div className="rounded border border-border-light p-2 mt-2">
                  <div className="text-xs font-medium text-text-primary mb-1">适用场景</div>
                  <div className="text-xs text-text-tertiary space-y-0.5">
                    <p>
                      工作：日程管理、数据汇总、文档处理、会议纪要、项目协作、邮件处理、报表生成
                    </p>
                    <p>学习：知识查询、学习计划、答疑解惑、语言翻译、论文写作、考试复习</p>
                    <p>生活：健康理财、旅行规划、购物建议、饮食管理、健身指导、情绪疏导</p>
                    <p>创作：文案撰写、灵感激发、内容策划、视频脚本、图像生成提示、社交媒体</p>
                    <p>设备控制：电脑操作、手机管理、智能家居、IoT设备、远程控制、自动化脚本</p>
                    <p>开发：代码编写、调试优化、技术文档、API调用、Bug修复、技术选型</p>
                    <p>娱乐：音乐推荐、电影推荐、游戏攻略、阅读推荐、星座运势</p>
                    <p>社交：通讯管理、联系人整理、消息汇总、关系维护提醒</p>
                  </div>
                </div>
              </TabsContent>

              {/* 使用指南 */}
              <TabsContent value="guide" className="mt-0 space-y-2">
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">创建任务</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    点击「新建任务」或直接输入需求，也可选择模板快速开始。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">对话交互</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    发送需求后，Hovi 会处理任务。所有过程保留在会话中，可随时查看回顾。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">管理会话</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    左侧边栏显示所有会话，可搜索、筛选，重命名、删除。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">知识库</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    上传文档构建个人知识库，在对话中引用相关知识。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">语音对话</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    点击「对话」按钮打开虚拟形象界面，按住麦克风进行语音交流。
                  </div>
                </div>
                <div className="pt-2 border-t border-border-light mt-2">
                  <div className="text-xs text-text-tertiary">
                    内容仅用于任务处理，不做公开展示。会话记录可随时删除。
                  </div>
                </div>
              </TabsContent>

              {/* 问答 */}
              <TabsContent value="faq" className="mt-0 space-y-2">
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">必须使用模板吗？</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    不需要。模板只是快捷入口，你可以直接输入任何需求。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">
                    任务会拆分成多个对话吗？
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    不会。一次发送会聚合为一个完整的对话气泡。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">
                    如何与 Hovi 进行语音对话？
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    点击「对话」按钮打开虚拟形象，按住麦克风即可开始。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">
                    可以自定义 Hovi 的形象吗？
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    支持配置 VRM 模型作为虚拟形象，可在设置中配置。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">数据存储在哪里？</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    所有数据存储在本地网关中，不会上传到云端。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">支持哪些模型？</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    支持 OpenAI、Anthropic、Ollama 等多种模型，可在设置中配置。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">如何添加技能？</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    在设置→技能中添加自定义提示词或工作流。
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">如何连接外部服务？</div>
                  <div className="text-xs text-text-tertiary mt-0.5">在设置→连接器中配置 API</div>
                </div>
              </TabsContent>

              {/* 知识库介绍 */}
              <TabsContent value="knowledge" className="mt-0 space-y-2">
                <div className="text-xs text-text-secondary leading-relaxed">
                  知识库功能让你构建个人专属的知识管理体系，基于文档进行智能问答。
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">文档支持</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    支持 PDF、Word、Markdown、TXT 等格式
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">智能检索</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    基于向量搜索，快速找到相关内容
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">知识标签</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    自定义标签体系，便于分类管理
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">自动摘要</div>
                  <div className="text-xs text-text-tertiary mt-0.5">AI 自动提取关键信息</div>
                </div>
              </TabsContent>

              {/* 角色形象介绍 */}
              <TabsContent value="persona" className="mt-0 space-y-2">
                <div className="text-xs text-text-secondary leading-relaxed">
                  为 Hovi 配置专属的虚拟形象，带来更自然的交互体验。
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">VRM 模型</div>
                  <div className="text-xs text-text-tertiary mt-0.5">支持 VRM 3.0 虚拟形象</div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">语音交互</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    TTS 文字转语音、ASR 语音识别
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">口型同步</div>
                  <div className="text-xs text-text-tertiary mt-0.5">基于音频的口型动画</div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">表情同步</div>
                  <div className="text-xs text-text-tertiary mt-0.5">实时表情动画</div>
                </div>
              </TabsContent>

              {/* 项目介绍 */}
              <TabsContent value="project" className="mt-0 space-y-2">
                <div className="text-xs text-text-secondary leading-relaxed">
                  Hovi 是一个开源的个人 AI 助手项目，致力于打造一个完全本地化、私密安全的智能助手。
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">完全本地化</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    所有数据存储在本地，不上传云端
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">开源免费</div>
                  <div className="text-xs text-text-tertiary mt-0.5">MIT 开源协议，可自由定制</div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">多模型支持</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    支持 OpenAI、Anthropic、Ollama 等
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">可扩展性</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    支持技能、工作流、连接器扩展
                  </div>
                </div>
                <div className="rounded border border-border-light p-2">
                  <div className="text-xs font-medium text-text-primary">技术栈</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    Next.js + React + TypeScript + Node.js
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={versionPopupOpen} onOpenChange={setVersionPopupOpen}>
        <DialogContent className="max-w-[320px] p-0">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-5 h-5 text-primary" />
              <DialogTitle className="text-base font-semibold">版本与作者</DialogTitle>
            </div>

            {/* 版本信息 */}
            <div className="mb-4">
              <div className="text-xs text-text-tertiary mb-1">版本</div>
              <div className="text-sm font-medium text-text-primary mb-2">{appMeta.version}</div>
              <ul className="space-y-1">
                {versionUpdates.map((update, index) => (
                  <li key={index} className="text-xs text-text-secondary flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary mt-1 flex-shrink-0" />
                    {update}
                  </li>
                ))}
              </ul>
            </div>

            {/* 作者信息 */}
            <div className="border-t border-border-light pt-3">
              <div className="text-xs text-text-tertiary mb-1">作者</div>
              <div className="text-sm font-medium text-text-primary">jiangwei</div>
              <div className="text-xs text-text-tertiary mt-1">
                Hovi 是由独立开发者打造的虚拟个人助手项目。
              </div>
            </div>

            <button
              onClick={() => setVersionPopupOpen(false)}
              className="w-full py-2 text-xs font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors mt-4"
            >
              知道了
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (isCollapsed) {
    return (
      <>
        {aboutDialog}
        <aside
          className="h-full bg-sidebar transition-all duration-base flex flex-col"
          style={{ width: "var(--sidebar-collapsed-width)" }}
        >
          {/* 品牌标识 - 收起状态（悬停显示返回图标） */}
          <div className="p-md flex justify-center flex-shrink-0">
            <div
              onMouseEnter={() => setIsHoveringBrand(true)}
              onMouseLeave={() => setIsHoveringBrand(false)}
              onClick={onToggleCollapse}
              className="w-8 h-8 flex items-center justify-center transition-all duration-fast hover:bg-surface-hover overflow-hidden cursor-pointer"
              title="展开侧边栏"
            >
              {isHoveringBrand ? (
                <ArrowLeft className="w-5 h-5 text-text-secondary rotate-180" />
              ) : (
                <img
                  src="/img/logo.png"
                  alt="Logo"
                  className="w-full h-full object-contain"
                  style={{ backgroundColor: "transparent" }}
                />
              )}
            </div>
          </div>

          {/* 新建任务按钮 */}
          <div className="flex flex-col items-center pt-lg gap-md flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onNewSession}
                  aria-label="新建任务"
                  className={cn(
                    "group w-10 h-10 rounded-md flex items-center justify-center transition-all duration-fast cursor-pointer active:bg-surface-subtle",
                    activeView === "chat"
                      ? "bg-primary/10 hover:bg-primary/20"
                      : "hover:bg-background-secondary",
                  )}
                >
                  <Plus
                    className={cn(
                      "w-5 h-5 transition-colors",
                      activeView === "chat"
                        ? "text-primary"
                        : "text-text-secondary group-hover:text-text-primary",
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">新建任务 ({newSessionShortcutLabel})</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* 搜索按钮 */}
          <div className="flex flex-col items-center gap-md flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSearchClick}
                  aria-label="搜索"
                  className="group w-10 h-10 rounded-md hover:bg-background-secondary active:bg-surface-subtle flex items-center justify-center transition-all duration-fast cursor-pointer"
                >
                  <FiSearch className="w-5 h-5 text-text-secondary group-hover:text-text-primary transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">搜索 ({searchShortcutLabel})</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* 知识库按钮 */}
          <div className="flex flex-col items-center gap-md flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLibraryClick}
                  aria-label="知识库"
                  className={cn(
                    "group w-10 h-10 rounded-md flex items-center justify-center transition-all duration-fast cursor-pointer active:bg-surface-subtle",
                    activeView === "knowledge"
                      ? "bg-primary/10 hover:bg-primary/20"
                      : "hover:bg-background-secondary",
                  )}
                >
                  <FiBook
                    className={cn(
                      "w-5 h-5 transition-colors",
                      activeView === "knowledge"
                        ? "text-primary"
                        : "text-text-secondary group-hover:text-text-primary",
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">知识库</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleDiscoverClick}
                  aria-label="动态"
                  className={cn(
                    "group w-10 h-10 rounded-md flex items-center justify-center transition-all duration-fast cursor-pointer active:bg-surface-subtle",
                    activeView === "discover"
                      ? "bg-primary/10 hover:bg-primary/20"
                      : "hover:bg-background-secondary",
                  )}
                >
                  <Compass
                    className={cn(
                      "w-5 h-5 transition-colors",
                      activeView === "discover"
                        ? "text-primary"
                        : "text-text-secondary group-hover:text-text-primary",
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">动态</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleChannelClick}
                  aria-label="频道"
                  className={cn(
                    "group w-10 h-10 rounded-md flex items-center justify-center transition-all duration-fast cursor-pointer active:bg-surface-subtle",
                    activeView === "channel"
                      ? "bg-primary/10 hover:bg-primary/20"
                      : "hover:bg-background-secondary",
                  )}
                >
                  <Box
                    className={cn(
                      "w-5 h-5 transition-colors",
                      activeView === "channel"
                        ? "text-primary"
                        : "text-text-secondary group-hover:text-text-primary",
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">频道</p>
              </TooltipContent>
            </Tooltip>
            {/* 虚拟助手设定按钮 */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handlePersonaSettingsClick}
                    className="group w-10 h-10 rounded-md flex items-center justify-center transition-all duration-fast hover:bg-background-secondary active:bg-surface-subtle cursor-pointer"
                  >
                    <Sparkles className="w-5 h-5 text-text-secondary group-hover:text-text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">助手设定</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* 定时任务按钮 */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCronJobsClick}
                    className="group w-10 h-10 rounded-md flex items-center justify-center transition-all duration-fast hover:bg-background-secondary active:bg-surface-subtle cursor-pointer"
                  >
                    <Clock className="w-5 h-5 text-text-secondary group-hover:text-text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">定时任务</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Agent管理按钮 */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleAgentManageClick}
                    className="group w-10 h-10 rounded-md flex items-center justify-center transition-all duration-fast hover:bg-background-secondary active:bg-surface-subtle cursor-pointer"
                  >
                    <Bot className="w-5 h-5 text-text-secondary group-hover:text-text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Agent管理</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* 占位符 - 撑开空间 */}
          <div className="flex-1" />

          {/* 设置按钮和关于按钮 */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => openSettings()}
                  aria-label="设置"
                  className="group w-10 h-10 rounded-md hover:bg-background-secondary active:bg-surface-subtle flex items-center justify-center transition-all duration-fast cursor-pointer"
                >
                  <Settings className="w-5 h-5 text-text-secondary group-hover:text-text-primary transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">设置</p>
              </TooltipContent>
            </Tooltip>

            {/* 关于按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="group w-10 h-10 rounded-md hover:bg-background-secondary active:bg-surface-subtle flex items-center justify-center transition-all duration-fast cursor-pointer"
                  onClick={() => setAboutOpen(true)}
                  aria-label="关于我"
                >
                  <Info className="w-5 h-5 text-text-secondary group-hover:text-text-primary transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">关于我</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </aside>
      </>
    );
  }

  return (
    <>
      {aboutDialog}
      <aside
        className="h-full bg-sidebar transition-all duration-base flex flex-col"
        style={{ width: "var(--sidebar-width)" }}
      >
        {/* 品牌标识 - 展开状态（折叠按钮在右侧） */}
        <div className="p-lg flex-shrink-0">
          <div className="flex items-center justify-between gap-sm">
            <div
              className="flex items-center gap-sm flex-1 min-w-0 cursor-pointer hover:opacity-80"
              onClick={onGoHome}
            >
              <img
                src="/img/logo.png"
                alt="Logo"
                className="w-8 h-8 object-contain flex-shrink-0"
                style={{ backgroundColor: "transparent" }}
              />
              <h1 className="text-base font-semibold text-text-primary">Hovi</h1>
            </div>
            {/* 折叠按钮 */}
            <button
              onClick={onToggleCollapse}
              className="w-6 h-6 rounded hover:bg-surface-hover flex items-center justify-center transition-colors duration-fast text-text-tertiary flex-shrink-0"
              title="折叠侧边栏"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 顶部功能选项列表 */}
        <div className="flex-shrink-0">
          {/* 新建任务 */}
          <button
            onClick={onNewSession}
            className={cn(
              "group w-full flex items-center justify-between rounded-md px-lg py-sm transition-all duration-fast cursor-pointer active:bg-surface-subtle",
              activeView === "chat"
                ? "bg-primary/10 hover:bg-primary/20"
                : "hover:bg-background-secondary",
            )}
          >
            <span className="flex items-center gap-sm min-w-0">
              <FiEdit3
                className={cn(
                  "w-4 h-4 flex-shrink-0 transition-colors",
                  activeView === "chat"
                    ? "text-primary"
                    : "text-text-secondary group-hover:text-text-primary",
                )}
              />
              <span
                className={cn(
                  "text-xs font-medium transition-colors",
                  activeView === "chat"
                    ? "text-text-primary"
                    : "text-text-secondary group-hover:text-text-primary",
                )}
              >
                新建任务
              </span>
            </span>
            <span className="text-[11px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {newSessionShortcutLabel}
            </span>
          </button>

          {/* 搜索 */}
          <button
            onClick={handleSearchClick}
            className="group w-full flex items-center justify-between rounded-md px-lg py-sm hover:bg-background-secondary active:bg-surface-subtle transition-all duration-fast cursor-pointer"
          >
            <span className="flex items-center gap-sm min-w-0">
              <FiSearch className="w-4 h-4 text-text-secondary group-hover:text-text-primary transition-colors flex-shrink-0" />
              <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">
                搜索
              </span>
            </span>
            <span className="text-[11px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {searchShortcutLabel}
            </span>
          </button>

          {/* 知识库 */}
          <button
            onClick={handleLibraryClick}
            className={cn(
              "group w-full flex items-center gap-sm rounded-md px-lg py-sm transition-all duration-fast cursor-pointer active:bg-surface-subtle",
              activeView === "knowledge"
                ? "bg-primary/10 hover:bg-primary/20"
                : "hover:bg-background-secondary",
            )}
          >
            <FiBook
              className={cn(
                "w-4 h-4 flex-shrink-0 transition-colors",
                activeView === "knowledge"
                  ? "text-primary"
                  : "text-text-secondary group-hover:text-text-primary",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium transition-colors",
                activeView === "knowledge"
                  ? "text-text-primary"
                  : "text-text-secondary group-hover:text-text-primary",
              )}
            >
              知识库
            </span>
          </button>
          <button
            onClick={handleDiscoverClick}
            className={cn(
              "group w-full flex items-center gap-sm rounded-md px-lg py-sm transition-all duration-fast cursor-pointer active:bg-surface-subtle",
              activeView === "discover"
                ? "bg-primary/10 hover:bg-primary/20"
                : "hover:bg-background-secondary",
            )}
          >
            <Compass
              className={cn(
                "w-4 h-4 flex-shrink-0 transition-colors",
                activeView === "discover"
                  ? "text-primary"
                  : "text-text-secondary group-hover:text-text-primary",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium transition-colors",
                activeView === "discover"
                  ? "text-text-primary"
                  : "text-text-secondary group-hover:text-text-primary",
              )}
            >
              动态
            </span>
          </button>
          {/* 频道 */}
          <button
            onClick={handleChannelClick}
            className={cn(
              "group w-full flex items-center gap-sm rounded-md px-lg py-sm transition-all duration-fast cursor-pointer active:bg-surface-subtle",
              activeView === "channel"
                ? "bg-primary/10 hover:bg-primary/20"
                : "hover:bg-background-secondary",
            )}
          >
            <Box
              className={cn(
                "w-4 h-4 flex-shrink-0 transition-colors",
                activeView === "channel"
                  ? "text-primary"
                  : "text-text-secondary group-hover:text-text-primary",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium transition-colors",
                activeView === "channel"
                  ? "text-text-primary"
                  : "text-text-secondary group-hover:text-text-primary",
              )}
            >
              频道
            </span>
          </button>
        </div>

        {/* 对话列表 - 顶部有border和间距 */}
        <div className="flex-1 overflow-hidden border-t border-border-light mt-sm pt-md flex flex-col">
          {/* 任务列表标题栏 */}
          <div className="flex items-center justify-between px-lg pb-sm flex-shrink-0">
            <button
              onClick={() => setIsTasksExpanded(!isTasksExpanded)}
              className="flex items-center gap-xs text-text-tertiary hover:text-text-primary transition-colors"
            >
              {isTasksExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <span className="text-xs font-medium">所有任务</span>
            </button>
            <div className="flex items-center gap-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={cn(
                      "p-1 rounded transition-colors hover:bg-surface-hover active:bg-surface-subtle text-text-tertiary hover:text-text-primary cursor-pointer",
                      unreadOnly && "bg-primary/10 text-primary",
                    )}
                    onClick={() => onUnreadToggle(!unreadOnly)}
                  >
                    <Mail className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>只看未读</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-1 rounded hover:bg-surface-hover active:bg-surface-subtle transition-colors cursor-pointer"
                    onClick={onToggleSelectionMode}
                  >
                    {selectionMode ? (
                      <X className="w-3.5 h-3.5 text-text-tertiary hover:text-text-primary transition-colors" />
                    ) : (
                      <ListChecks className="w-3.5 h-3.5 text-text-tertiary hover:text-text-primary transition-colors" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{selectionMode ? "退出批量" : "批量管理"}</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="排序"
                        className="p-1 rounded hover:bg-surface-hover active:bg-surface-subtle transition-colors cursor-pointer"
                      >
                        <TrendingUp
                          className={cn(
                            "w-3.5 h-3.5 transition-colors",
                            sortMode !== "recent"
                              ? "text-primary"
                              : "text-text-tertiary hover:text-text-primary",
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>排序</p>
                    </TooltipContent>
                  </Tooltip>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onSortChange("recent")}>
                    <span className="mr-2 inline-flex w-3.5 h-3.5 items-center justify-center">
                      {sortMode === "recent" && <Check className="w-3.5 h-3.5 text-primary" />}
                    </span>
                    <span className={sortMode === "recent" ? "text-primary" : undefined}>
                      最近活动
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSortChange("name")}>
                    <span className="mr-2 inline-flex w-3.5 h-3.5 items-center justify-center">
                      {sortMode === "name" && <Check className="w-3.5 h-3.5 text-primary" />}
                    </span>
                    <span className={sortMode === "name" ? "text-primary" : undefined}>名称</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="过滤"
                        className="p-1 rounded hover:bg-surface-hover active:bg-surface-subtle transition-colors cursor-pointer"
                      >
                        <Filter
                          className={cn(
                            "w-3.5 h-3.5 transition-colors",
                            filterKind !== "all"
                              ? "text-primary"
                              : "text-text-tertiary hover:text-text-primary",
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>过滤</p>
                    </TooltipContent>
                  </Tooltip>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onFilterChange("all")}>
                    <span className="mr-2 inline-flex w-3.5 h-3.5 items-center justify-center">
                      {filterKind === "all" && <Check className="w-3.5 h-3.5 text-primary" />}
                    </span>
                    <span className={filterKind === "all" ? "text-primary" : undefined}>全部</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onFilterChange("direct")}>
                    <span className="mr-2 inline-flex w-3.5 h-3.5 items-center justify-center">
                      {filterKind === "direct" && <Check className="w-3.5 h-3.5 text-primary" />}
                    </span>
                    <span className={filterKind === "direct" ? "text-primary" : undefined}>
                      私聊
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onFilterChange("group")}>
                    <span className="mr-2 inline-flex w-3.5 h-3.5 items-center justify-center">
                      {filterKind === "group" && <Check className="w-3.5 h-3.5 text-primary" />}
                    </span>
                    <span className={filterKind === "group" ? "text-primary" : undefined}>
                      群组
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onFilterChange("global")}>
                    <span className="mr-2 inline-flex w-3.5 h-3.5 items-center justify-center">
                      {filterKind === "global" && <Check className="w-3.5 h-3.5 text-primary" />}
                    </span>
                    <span className={filterKind === "global" ? "text-primary" : undefined}>
                      全局
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onFilterChange("unknown")}>
                    <span className="mr-2 inline-flex w-3.5 h-3.5 items-center justify-center">
                      {filterKind === "unknown" && <Check className="w-3.5 h-3.5 text-primary" />}
                    </span>
                    <span className={filterKind === "unknown" ? "text-primary" : undefined}>
                      未知
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {selectionMode && (
            <div className="px-lg pb-sm flex items-center justify-between text-xs text-text-tertiary">
              <button
                className="text-text-secondary hover:text-text-primary"
                onClick={() => {
                  if (isAllSelected) {
                    onClearSelection();
                  } else {
                    onSelectAllKeys(sessions.map((session) => session.key));
                  }
                }}
              >
                {isAllSelected ? "取消全选" : "全选"}
              </button>
              <span>已选 {selectedKeys.length}</span>
            </div>
          )}

          {/* 任务列表内容 - 可收缩 */}
          {isTasksExpanded && (
            <ScrollArea ref={scrollAreaRef} className="flex-1 px-md">
              {isLoading ? (
                <div className="space-y-xs pb-lg">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={`session-skeleton-${index}`}
                      className="w-full rounded-md px-sm py-sm border border-border-light bg-surface-subtle/60"
                    >
                      <div className="flex items-center gap-sm">
                        <div className="w-5 h-5 rounded bg-background-secondary animate-pulse" />
                        <div className="flex-1 min-w-0">
                          <div className="h-3 w-32 rounded bg-background-secondary animate-pulse" />
                          <div className="mt-1 h-3 w-24 rounded bg-background-secondary animate-pulse" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                // 空状态
                <div className="flex flex-col items-center justify-center py-4xl text-center">
                  <MessageSquare className="w-12 h-12 text-text-tertiary mb-md" />
                  {filterKind !== "all" || unreadOnly ? (
                    <>
                      <p className="text-sm text-text-secondary mb-xs">没有找到相关会话</p>
                      <p className="text-xs text-text-tertiary">试试调整筛选条件</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-text-secondary mb-xs">暂无对话</p>
                      <p className="text-xs text-text-tertiary">点击上方按钮</p>
                      <p className="text-xs text-text-tertiary">开始新对话</p>
                    </>
                  )}
                </div>
              ) : (
                // 任务列表 - 不按时间分组
                <div className="space-y-xs pb-lg">
                  {sessions.map((session) => {
                    const isSelected = session.key === currentSessionKey;
                    const title = resolveTitle(session);
                    const unread = unreadMap[session.key] === true;
                    const isChecked = selectedKeys.includes(session.key);

                    return (
                      <button
                        key={session.key}
                        ref={(node) => {
                          sessionRefs.current[session.key] = node;
                        }}
                        onClick={() => {
                          if (selectionMode) {
                            onToggleSelectedKey(session.key);
                          } else {
                            onSelectSession(session.key);
                          }
                        }}
                        className={cn(
                          "w-full cursor-pointer text-left rounded-md px-sm py-sm transition-all duration-fast group relative",
                          isSelected ? "bg-primary-light" : "hover:bg-surface-hover",
                        )}
                      >
                        <div className="flex items-center gap-sm">
                          {selectionMode && (
                            <div
                              className={cn(
                                "flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center",
                                isChecked
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border",
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggleSelectedKey(session.key);
                              }}
                            >
                              {isChecked && <Check className="w-3 h-3" />}
                            </div>
                          )}
                          <div
                            className={cn(
                              "flex-shrink-0 w-5 h-5 flex items-center justify-center",
                              isSelected
                                ? "text-text-primary"
                                : "text-text-tertiary group-hover:text-text-secondary",
                            )}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </div>
                          {/* 标题 - 限制宽度确保省略号生效 */}
                          <div className="flex-1 min-w-0 max-w-[180px]">
                            <div
                              className={cn(
                                "text-xs font-medium truncate",
                                isSelected
                                  ? "text-text-primary"
                                  : "text-text-secondary group-hover:text-text-primary",
                              )}
                            >
                              {title}
                            </div>
                            <div className="text-[11px] text-text-tertiary truncate">
                              {session.lastMessagePreview || resolveUpdatedAt(session)}
                            </div>
                          </div>

                          <div className="flex items-center gap-xs">
                            {unread && <span className="w-2 h-2 rounded-full bg-primary" />}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <div
                                  className={cn(
                                    "flex-shrink-0 w-5 h-5 rounded hover:bg-surface-hover active:bg-surface-subtle flex items-center justify-center transition-all duration-fast cursor-pointer",
                                    "opacity-0 group-hover:opacity-100",
                                  )}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="w-3.5 h-3.5 text-text-tertiary hover:text-text-primary transition-colors" />
                                </div>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onViewSession(session.key);
                                  }}
                                >
                                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                                  详情
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRenameSession(session.key);
                                  }}
                                >
                                  <FiEdit3 className="mr-2 h-3.5 w-3.5" />
                                  重命名
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-error focus:text-error"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSession(session.key);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  删除
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          )}

          {selectionMode && selectedKeys.length > 0 && (
            <div className="px-lg py-sm border-t border-border-light flex items-center gap-sm">
              <button
                className="w-full text-xs px-sm py-xs rounded-md bg-error/10 hover:bg-error/20 transition-colors text-error"
                onClick={onBatchDelete}
              >
                批量删除
              </button>
            </div>
          )}
        </div>

        {/* 底部功能区 */}
        <div className="p-md flex-shrink-0 border-t border-border-light">
          <div className="flex items-center gap-sm">
            {/* 助手设定 */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handlePersonaSettingsClick}
                    className="flex-shrink-0 w-6 h-6 rounded hover:bg-surface-hover active:bg-surface-subtle flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-text-secondary hover:text-text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">助手设定</p>
                </TooltipContent>
              </Tooltip>

              {/* 定时任务 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleCronJobsClick}
                    className="flex-shrink-0 w-6 h-6 rounded hover:bg-surface-hover active:bg-surface-subtle flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-text-secondary hover:text-text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">定时任务</p>
                </TooltipContent>
              </Tooltip>

              {/* Agent管理 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleAgentManageClick}
                    className="flex-shrink-0 w-6 h-6 rounded hover:bg-surface-hover active:bg-surface-subtle flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Bot className="w-3.5 h-3.5 text-text-secondary hover:text-text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Agent管理</p>
                </TooltipContent>
              </Tooltip>

              {/* 设置 - 仅图标（左侧） */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openSettings()}
                    className="flex-shrink-0 w-6 h-6 rounded hover:bg-surface-hover active:bg-surface-subtle flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-text-secondary hover:text-text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">设置</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* 配额和 Token 使用量 - 中间 */}
            <div className="flex-1">
              <SidebarQuotaBar />
            </div>

            {/* 关于企业运营助手 - 图标（最右侧） */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center hover:bg-surface-hover active:bg-surface-subtle transition-colors rounded-md cursor-pointer"
                    onClick={() => setAboutOpen(true)}
                  >
                    <Info className="w-4 h-4 text-text-secondary hover:text-text-primary transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">关于我</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
