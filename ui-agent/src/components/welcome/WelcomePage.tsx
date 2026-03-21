"use client";

import {
  Zap,
  Palette,
  BookOpen,
  Code,
  Heart,
  Wallet,
  MapPin,
  Briefcase,
  BarChart3,
  FileText,
  Users,
  HeadphonesIcon,
  Rocket,
  LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TemplateCategory =
  | "全部"
  | "运营"
  | "数据"
  | "文档"
  | "人事"
  | "客服"
  | "项目"
  | "效率"
  | "创意"
  | "学习"
  | "编码"
  | "生活"
  | "财务"
  | "旅行";

type CategoryConfig = {
  label: TemplateCategory;
  icon: LucideIcon;
  color: string;
  bgColor: string;
};

type TemplateItem = {
  title: string;
  category: TemplateCategory;
  description: string;
  detail: string;
};

const CATEGORY_CONFIGS: CategoryConfig[] = [
  { label: "运营", icon: Briefcase, color: "text-orange-600", bgColor: "bg-orange-50" },
  { label: "数据", icon: BarChart3, color: "text-blue-600", bgColor: "bg-blue-50" },
  { label: "文档", icon: FileText, color: "text-green-600", bgColor: "bg-green-50" },
  { label: "人事", icon: Users, color: "text-purple-600", bgColor: "bg-purple-50" },
  { label: "客服", icon: HeadphonesIcon, color: "text-pink-600", bgColor: "bg-pink-50" },
  { label: "项目", icon: Rocket, color: "text-indigo-600", bgColor: "bg-indigo-50" },
  { label: "效率", icon: Zap, color: "text-yellow-600", bgColor: "bg-yellow-50" },
  { label: "创意", icon: Palette, color: "text-rose-600", bgColor: "bg-rose-50" },
  { label: "学习", icon: BookOpen, color: "text-teal-600", bgColor: "bg-teal-50" },
  { label: "编码", icon: Code, color: "text-slate-600", bgColor: "bg-slate-50" },
  { label: "生活", icon: Heart, color: "text-red-600", bgColor: "bg-red-50" },
  { label: "财务", icon: Wallet, color: "text-amber-600", bgColor: "bg-amber-50" },
  { label: "旅行", icon: MapPin, color: "text-cyan-600", bgColor: "bg-cyan-50" },
];

const CATEGORIES: TemplateCategory[] = [
  "全部",
  "运营",
  "数据",
  "文档",
  "人事",
  "客服",
  "项目",
  "效率",
  "创意",
  "学习",
  "编码",
  "生活",
  "财务",
  "旅行",
];

// 全部显示时只显示企业场景的6个
const ITEMS_IN_ALL = ["运营", "数据", "文档", "人事", "客服", "项目"];

const RECOMMENDED_TEMPLATES: TemplateItem[] = [
  // === 企业场景 ===
  // 运营
  {
    title: "查询公司资质",
    category: "运营",
    description: "查询和整理公司各项资质证书",
    detail:
      "帮我整理一下公司都有哪些资质证书，包括营业执照、各类行业许可证、ISO认证等，最好能标注一下哪些即将过期需要续期",
  },
  {
    title: "生成周报总结",
    category: "运营",
    description: "自动生成本周工作总结",
    detail:
      "这周工作太多了，帮我对本周工作做个总结，包括完成了哪些任务、遇到了什么困难、下周有什么计划，用清晰的格式呈现",
  },
  {
    title: "制定月度计划",
    category: "运营",
    description: "规划月度工作目标",
    detail:
      "帮我规划一下下个月的工作安排，需要包括主要的业务目标、KPI指标、重要的项目节点和会议计划，还要考虑留出一些缓冲时间",
  },
  {
    title: "整理工作流程",
    category: "运营",
    description: "梳理和优化业务流程",
    detail:
      "我们部门最近流程特别乱，帮我梳理一下现有的工作流程，看看哪些环节可以优化，哪些地方存在瓶颈可以改进",
  },
  {
    title: "汇报材料准备",
    category: "运营",
    description: "制作汇报演示文稿",
    detail:
      "下周要给领导汇报工作进展，帮我准备一份汇报材料，包括这段时间的成果数据、遇到的问题和解决方案、下一步计划",
  },

  // 数据
  {
    title: "分析本月销售数据",
    category: "数据",
    description: "分析销售业绩趋势",
    detail:
      "这个月销售数据出来了，帮我分析一下销售额、订单量、客户增长这些指标，跟上个月和去年同期对比怎么样，有没有异常波动",
  },
  {
    title: "本周运营数据概览",
    category: "数据",
    description: "汇总本周关键指标",
    detail:
      "这周快结束了，帮我汇总一下本周的运营数据，包括网站流量、用户活跃度、转化率这些关键指标，做成简单的报表",
  },
  {
    title: "数据可视化建议",
    category: "数据",
    description: "推荐数据展示方式",
    detail:
      "我有一份数据需要展示，包括各地区的销售情况和不同时间段的趋势，应该用什么图表来呈现比较好，有什么建议",
  },
  {
    title: "趋势分析报告",
    category: "数据",
    description: "分析业务发展趋势",
    detail:
      "帮我分析一下业务的发展趋势，看看过去几个月的增长情况怎么样，未来几个月可能会怎么发展，需要注意什么",
  },
  {
    title: "业绩指标总结",
    category: "数据",
    description: "汇总业绩完成情况",
    detail:
      "到这个季度结束了，帮我统计一下各个团队和个人的业绩完成情况，谁完成得好，谁还有差距，原因是什么",
  },

  // 文档
  {
    title: "投标文件生成器",
    category: "文档",
    description: "智能分析招标文件并生成投标文件",
    detail: "/投标文件生成器\n我需要制作投标文件，请帮我分析招标文件并生成完整的技术标和商务标",
  },
  {
    title: "生成投标文档",
    category: "文档",
    description: "创建投标书",
    detail:
      "有个项目需要投标，帮我写一份完整的投标书，包括公司介绍、资质证明、技术方案和商务报价，要专业一些",
  },
  {
    title: "合同条款审查",
    category: "文档",
    description: "审核合同风险点",
    detail:
      "收到一份合作合同帮忙看看，里面有没有什么坑或者风险点，特别是付款方式、违约条款、知识产权这些方面",
  },
  {
    title: "会议纪要整理",
    category: "文档",
    description: "自动生成会议记录",
    detail:
      "下午开了个讨论会，帮忙整理一下会议纪要，包括讨论了什么问题、做了什么决定、谁负责什么任务、什么时候完成",
  },
  {
    title: "项目文档归档",
    category: "文档",
    description: "整理项目文档",
    detail:
      "项目快结束了，帮忙整理一下所有的项目文档，包括需求文档、设计稿、会议纪要、测试报告等，分门别类归档好",
  },
  {
    title: "技术方案撰写",
    category: "文档",
    description: "编写技术文档",
    detail:
      "需要写一个系统的技术方案，包括整体架构、技术选型、数据库设计、接口规范等，要详细一些方便开发参考",
  },

  // 人事
  {
    title: "查看今日考勤情况",
    category: "人事",
    description: "查询员工出勤记录",
    detail: "帮忙查一下今天公司员工的考勤情况，有多少人正常出勤，谁迟到了，谁请假了，还有谁在加班",
  },
  {
    title: "招聘需求分析",
    category: "人事",
    description: "分析招聘岗位需求",
    detail:
      "我们部门需要招人，帮忙分析一下这个岗位的要求，应该招什么样的人，薪资范围多少，通过哪些渠道招聘比较好",
  },
  {
    title: "员工培训计划",
    category: "人事",
    description: "制定培训方案",
    detail:
      "新员工入职培训的事情交给我了，帮我制定一个完整的培训方案，包括培训什么内容、怎么安排时间、培训后如何考核",
  },
  {
    title: "绩效考核汇总",
    category: "人事",
    description: "整理考核结果",
    detail:
      "年底了需要做绩效考核，帮我汇总一下各部门和员工的考核结果，谁是优秀，谁需要改进，改进方向是什么",
  },
  {
    title: "离职手续办理",
    category: "人事",
    description: "指导离职流程",
    detail:
      "有员工要离职了，帮忙梳理一下离职流程，需要办哪些手续，工作怎么交接，社保和工资怎么处理",
  },

  // 客服
  {
    title: "客服问题分类汇总",
    category: "客服",
    description: "整理客户问题",
    detail: "最近客服接到很多反馈，帮忙把客户的问题分分类，看看哪类问题最多，哪些是紧急需要解决的",
  },
  {
    title: "客户反馈分析",
    category: "客服",
    description: "分析用户反馈",
    detail:
      "收集了一批用户反馈意见，帮忙分析一下用户都在抱怨什么，哪些问题需要优先解决，能不能发现什么规律",
  },
  {
    title: "常见问题解答",
    category: "客服",
    description: "整理FAQ文档",
    detail: "客服每天被问很多重复问题，帮忙整理一份常见问题解答文档，把高频问题的标准答案写出来",
  },
  {
    title: "投诉处理方案",
    category: "客服",
    description: "制定投诉应对策略",
    detail:
      "遇到客户投诉了，帮忙制定一个处理方案，应该怎么跟客户沟通，如何解决问题，后续如何跟进让客户满意",
  },
  {
    title: "服务满意度调查",
    category: "客服",
    description: "分析满意度数据",
    detail:
      "刚做完客户满意度调查，帮忙分析一下调查结果，客户的满意度怎么样，哪些地方做得好，哪些需要改进",
  },

  // 项目
  {
    title: "项目里程碑风险检查",
    category: "项目",
    description: "评估项目风险",
    detail:
      "项目进行到一半了，帮忙检查一下项目进度，看看有哪些风险点，可能会延期或者出问题，提前预警",
  },
  {
    title: "项目进度汇报",
    category: "项目",
    description: "汇总项目状态",
    detail:
      "项目周报时间到了，帮忙整理一下项目目前的进度，完成情况怎么样，有什么问题阻塞，需要什么支持",
  },
  {
    title: "资源分配优化",
    category: "项目",
    description: "优化人力配置",
    detail: "项目太多人力不够用了，帮忙分析一下现有的人员配置，看看怎么调整能让工作效率更高",
  },
  {
    title: "需求评审纪要",
    category: "项目",
    description: "整理需求评审",
    detail:
      "今天评审了需求，帮忙整理一下评审结果，包括确认了哪些需求、哪些需要修改、优先级怎么调整",
  },
  {
    title: "上线检查清单",
    category: "项目",
    description: "准备上线验收",
    detail:
      "系统准备上线了，帮忙列一个上线检查清单，需要检查哪些功能、测试哪些场景、准备哪些应急预案",
  },

  // === 个人场景 ===
  // 效率
  {
    title: "分析我的时间分配",
    category: "效率",
    description: "分析时间使用情况",
    detail:
      "感觉自己每天都很忙但没产出，帮我分析一下时间都花哪儿了，哪些是有效工作时间，哪些可以优化",
  },
  {
    title: "制定专注工作计划",
    category: "效率",
    description: "安排专注时段",
    detail:
      "我容易在工作时分心，帮我制定一个专注工作计划，包括什么时候该专注做什么事，怎么减少干扰",
  },
  {
    title: "整理收件箱",
    category: "效率",
    description: "清理邮箱",
    detail: "邮箱堆积了太多邮件，帮我整理一下，哪些需要回复、哪些可以归档、哪些可以直接删除",
  },
  {
    title: "优化日程安排",
    category: "效率",
    description: "调整日程规划",
    detail: "明天的会议和待办事项太多了，帮我优化一下日程安排，看看怎么能更高效地完成所有事情",
  },
  {
    title: "制定每日待办清单",
    category: "效率",
    description: "创建任务列表",
    detail:
      "每天早上不知道干什么，帮我列一个今天的待办清单，按照重要紧急程度排序，确保重要的事不被遗漏",
  },

  // 创意
  {
    title: "撰写营销文案",
    category: "创意",
    description: "创作推广内容",
    detail: "产品要上线了需要推广，帮我写几段营销文案，要能突出产品卖点、吸引用户注意的那种",
  },
  {
    title: "创作社交媒体内容",
    category: "创意",
    description: "生成社媒帖子",
    detail: "帮我写几条小红书/微博帖子，关于分享某个话题的，要有意思能吸引人关注",
  },
  {
    title: "起草商业计划书",
    category: "创意",
    description: "撰写商业计划",
    detail: "我想做个项目需要找投资人，帮我起草一份商业计划书，包括市场分析、盈利模式、竞争优势等",
  },
  {
    title: "写一封感人的生日祝福",
    category: "创意",
    description: "定制祝福语",
    detail: "好朋友生日想送段祝福的话，帮我写一段走心的生日祝福，适合多年闺蜜/死党的那种",
  },
  {
    title: "创作短视频脚本",
    category: "创意",
    description: "编写视频文案",
    detail: "想拍个短视频发抖音，帮我写一个脚本，包括开场说什么、怎么展示产品、结尾怎么引导",
  },

  // 学习
  {
    title: "解释复杂概念",
    category: "学习",
    description: "通俗讲解知识",
    detail: "最近在学某个专业概念，但看不太懂，帮忙用通俗易懂的话解释一下，最好能举些例子",
  },
  {
    title: "创建学习计划",
    category: "学习",
    description: "制定学习路线",
    detail:
      "想系统学习某项技能，比如Python编程，帮我制定一个学习计划，包括先学什么后学什么、每天学多久",
  },
  {
    title: "总结一本书的核心要点",
    category: "学习",
    description: "提炼书籍精华",
    detail: "刚读完一本书太厚了，帮我总结一下核心观点和最有价值的内容，节省复习时间",
  },
  {
    title: "制定语言学习路线",
    category: "学习",
    description: "规划语言学习",
    detail:
      "想学英语但不知道从哪开始，帮我规划一下学习路线，词汇量要达到多少、语法要掌握哪些、怎么练习听说读写",
  },
  {
    title: "准备技术面试",
    category: "学习",
    description: "模拟面试问答",
    detail: "下周有技术面试，帮忙模拟一下可能会问的问题，包括项目经验、技术细节、解决方案思路等",
  },

  // 编码
  {
    title: "代码调试助手",
    category: "编码",
    description: "帮助定位bug",
    detail: "代码报错了帮忙看看什么问题，错误信息是XXX，应该怎么排查和修复",
  },
  {
    title: "优化代码性能",
    category: "编码",
    description: "提升代码效率",
    detail: "这段代码跑起来有点慢，帮忙看看有哪些可以优化的地方，能提升执行效率",
  },
  {
    title: "解释技术架构",
    category: "编码",
    description: "讲解系统设计",
    detail: "刚接手一个老项目，帮忙讲讲整体的技术架构，各个模块是怎么配合的，哪些地方要注意",
  },
  {
    title: "编写单元测试",
    category: "编码",
    description: "生成测试用例",
    detail: "写了新功能需要写测试，帮忙生成一些测试用例，覆盖主要的业务流程和边界情况",
  },
  {
    title: "代码重构建议",
    category: "编码",
    description: "改进代码质量",
    detail: "这段代码写得比较乱后期难维护，帮忙看看哪些地方可以重构，怎么改进设计让它更好",
  },

  // 生活
  {
    title: "制定健身计划",
    category: "生活",
    description: "安排锻炼方案",
    detail:
      "想开始健身但不知道怎么练，帮我制定一个月的健身计划，包括每周练几次、每次练什么动作、饮食建议",
  },
  {
    title: "推荐一周健康食谱",
    category: "生活",
    description: "规划每日饮食",
    detail: "想吃得健康一点，帮我推荐一周的食谱，早中晚餐搭配好，营养均衡又不麻烦",
  },
  {
    title: "改善睡眠质量建议",
    category: "生活",
    description: "优化睡眠习惯",
    detail: "最近睡眠质量很差，帮忙分析一下可能的原因，给一些改善睡眠的建议和技巧",
  },
  {
    title: "室内收纳整理方案",
    category: "生活",
    description: "整理居住空间",
    detail: "房子太乱了需要整理，帮我出一个收纳方案教我怎么归置东西，怎么利用空间",
  },
  {
    title: "压力管理技巧",
    category: "生活",
    description: "应对心理压力",
    detail: "最近工作压力太大了感觉焦虑，帮忙给一些缓解压力、管理情绪的方法和建议",
  },

  // 财务
  {
    title: "制定月度预算",
    category: "财务",
    description: "规划支出计划",
    detail: "花钱总是超支想控制一下，帮我制定一个本月预算，包括收入多少、各项支出多少、怎么存钱",
  },
  {
    title: "分析消费支出",
    category: "财务",
    description: "回顾开支情况",
    detail: "这个月又月光了，帮我分析一下钱都花哪儿了，哪些是不该花的，下个月怎么控制",
  },
  {
    title: "理财规划建议",
    category: "财务",
    description: "制定投资策略",
    detail: "存了点钱想理财但不懂投资，帮我分析一下适合我的理财方式，风险偏好是稳健型",
  },
  {
    title: "储蓄目标设定",
    category: "财务",
    description: "规划存钱计划",
    detail: "想存钱买房子，帮我算一下需要存多少、每月存多少、几年能存够，有什么好的存钱方法",
  },
  {
    title: "退休规划计算",
    category: "财务",
    description: "计算退休储备",
    detail: "想提前规划退休的事情，帮忙算一下退休需要多少钱、现在应该存多少、怎么配置保险和养老",
  },

  // 旅行
  {
    title: "制定旅行行程",
    category: "旅行",
    description: "规划路线安排",
    detail:
      "计划去某个地方玩一周，帮忙制定一个旅行行程，包括每天去哪些景点、怎么安排时间、住哪里方便",
  },
  {
    title: "推荐当地美食",
    category: "旅行",
    description: "发掘当地特色",
    detail: "要去某城市旅游，帮忙推荐一些当地必吃的美食餐厅，不要网红店要地道的那种",
  },
  {
    title: "打包行李清单",
    category: "旅行",
    description: "准备出行物品",
    detail: "下周要出差一周，帮忙列一个行李打包清单，需要带什么、哪些是必备的、有什么注意事项",
  },
  {
    title: "预算旅行攻略",
    category: "旅行",
    description: "控制旅行花费",
    detail: "想穷游某个地方，帮忙做一个预算攻略，包括机票酒店多少钱、当地交通费用、吃饭购物预算",
  },
  {
    title: "当地文化注意事项",
    category: "旅行",
    description: "了解风俗禁忌",
    detail: "要去国外旅行，帮忙查一下当地有什么文化禁忌和风俗习惯，有什么需要注意的避免冒犯",
  },
];

const getCategoryConfig = (category: TemplateCategory) => {
  return CATEGORY_CONFIGS.find((c) => c.label === category) || CATEGORY_CONFIGS[0];
};

const RECENT_STORAGE_KEY = "ui-agent.recentTemplates";

interface WelcomePageProps {
  onSelectPrompt: (prompt: string) => void;
  compact?: boolean;
  variant?: "chips" | "cards";
}

export function WelcomePage({
  onSelectPrompt,
  compact = false,
  variant = "chips",
}: WelcomePageProps) {
  const [recentTemplates, setRecentTemplates] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>("全部");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setRecentTemplates(parsed.filter((item) => typeof item === "string"));
    } catch {
      // ignore
    }
  }, []);

  // 获取过滤后的模板列表
  const getFilteredTemplates = (category: TemplateCategory) => {
    if (category === "全部") {
      // 全部时只显示企业场景的6个分类
      const templatesByCategory: Record<string, TemplateItem[]> = {};
      RECOMMENDED_TEMPLATES.forEach((item) => {
        if (!templatesByCategory[item.category]) {
          templatesByCategory[item.category] = [];
        }
        templatesByCategory[item.category].push(item);
      });

      const result: TemplateItem[] = [];
      // 只添加企业场景的6个分类
      ITEMS_IN_ALL.forEach((cat) => {
        if (templatesByCategory[cat] && templatesByCategory[cat].length > 0) {
          result.push(templatesByCategory[cat][0]);
        }
      });
      return result;
    }
    return RECOMMENDED_TEMPLATES.filter((item) => item.category === category);
  };

  const sections = useMemo(() => {
    const filteredRecommended = getFilteredTemplates(activeCategory);
    const recentItems: TemplateItem[] = recentTemplates
      .filter((item) => item && item !== "暂无最近记录")
      .map((title) => ({
        title,
        category: "运营" as TemplateCategory,
        description: "",
        detail: "",
      }))
      .filter((item) => (activeCategory === "全部" ? true : item.category === activeCategory));
    return [
      {
        title: "推荐",
        items: filteredRecommended,
      },
      {
        title: "最近",
        items:
          recentItems.length > 0
            ? recentItems
            : [
                {
                  title: "暂无最近记录",
                  category: "运营" as TemplateCategory,
                  description: "",
                  detail: "",
                },
              ],
        isEmpty: recentItems.length === 0,
      },
    ];
  }, [recentTemplates, activeCategory]);

  const handleSelect = (item: TemplateItem) => {
    if (!item.title || item.title === "暂无最近记录") return;
    // 直接使用完整的问题描述
    const fullPrompt = item.detail;
    const next = [item.title, ...recentTemplates.filter((t) => t !== item.title)].slice(0, 6);
    setRecentTemplates(next);
    try {
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    onSelectPrompt(fullPrompt);
  };

  return (
    <div className={`w-full ${compact ? "" : "text-center"}`}>
      {/* 标题 */}
      {!compact && (
        <>
          <h1 className="text-4xl font-bold text-text-primary mb-md flex items-center justify-center gap-md">
            <span className="text-primary">Hovi</span>
          </h1>
          <p className="text-sm text-text-tertiary mb-2xl">
            选择一个示例开始对话,或直接输入您的需求
          </p>
        </>
      )}

      {/* 分类筛选 */}
      {variant === "cards" && (
        <div className="flex flex-wrap gap-xs mb-lg w-full">
          {CATEGORIES.map((category) => {
            const config = getCategoryConfig(category);
            const isActive = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`flex items-center gap-xs px-sm py-xs rounded-full text-xs transition-colors ${
                  isActive
                    ? `${config.bgColor} ${config.color}`
                    : "bg-background-secondary text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <config.icon className="w-3.5 h-3.5" />
                {category}
              </button>
            );
          })}
        </div>
      )}

      {/* 模板分组 */}
      <div className={`flex flex-col gap-lg w-full ${compact ? "items-start" : "items-center"}`}>
        {sections.map((section) => (
          <div
            key={section.title}
            className={`flex flex-col gap-xs w-full ${compact ? "items-start" : "items-center"}`}
          >
            <div className="flex items-center gap-sm w-full">
              <div className="text-xs font-medium text-text-secondary">{section.title}</div>
              {section.title === "最近" && recentTemplates.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRecentTemplates([]);
                    try {
                      localStorage.removeItem(RECENT_STORAGE_KEY);
                    } catch {
                      // ignore
                    }
                  }}
                  className="text-[10px] text-text-tertiary hover:text-primary underline-offset-2 hover:underline"
                >
                  清空最近
                </button>
              )}
            </div>
            {variant === "cards" ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-sm w-full">
                {section.items.map((item, index) => {
                  const config = getCategoryConfig(item.category);
                  return (
                    <button
                      key={`${section.title}-${index}`}
                      onClick={() => handleSelect(item)}
                      className={`
                      text-left rounded-xl border px-md py-sm transition-colors h-28
                      ${
                        section.isEmpty
                          ? "border-border-light bg-background-secondary/40 text-text-tertiary/70 cursor-default"
                          : "border-border-light bg-white hover:bg-primary/5 hover:border-primary/40 text-text-secondary"
                      }
                    `}
                      disabled={section.isEmpty}
                    >
                      <div className="flex items-center gap-xs mb-xs">
                        <config.icon className={`w-3.5 h-3.5 ${config.color}`} />
                        <span className="text-[10px] text-text-tertiary">{item.category}</span>
                      </div>
                      <div className="text-sm font-medium truncate">{item.title}</div>
                      {item.description && (
                        <div className="text-[11px] text-text-tertiary mt-1 line-clamp-2">
                          {item.detail || item.description}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className={`flex flex-wrap gap-xs ${compact ? "" : "items-center justify-center"}`}
              >
                {section.items.map((item, index) => (
                  <button
                    key={`${section.title}-${index}`}
                    onClick={() => handleSelect(item)}
                    className={`text-xs transition-colors px-sm py-xs hover:underline ${
                      section.isEmpty
                        ? "text-text-tertiary/70 cursor-default"
                        : "text-text-tertiary hover:text-primary"
                    }`}
                    disabled={section.isEmpty}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
