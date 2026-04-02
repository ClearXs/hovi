describe("DocPreview lazy Univer imports", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("does not eagerly import Univer preview modules on DocPreview module load", () => {
    jest.isolateModules(() => {
      jest.doMock("@monaco-editor/react", () => ({
        __esModule: true,
        default: () => null,
      }));
      jest.doMock("react-markdown", () => ({
        __esModule: true,
        default: () => null,
      }));
      jest.doMock("react-syntax-highlighter", () => ({
        Prism: () => null,
      }));
      jest.doMock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
        oneDark: {},
      }));
      jest.doMock("remark-gfm", () => ({
        __esModule: true,
        default: {},
      }));
      jest.doMock("@/components/ui/button", () => ({
        Button: () => null,
      }));
      jest.doMock("@/components/ui/tooltip", () => ({
        Tooltip: ({ children }: { children?: React.ReactNode }) => children ?? null,
        TooltipContent: ({ children }: { children?: React.ReactNode }) => children ?? null,
        TooltipProvider: ({ children }: { children?: React.ReactNode }) => children ?? null,
        TooltipTrigger: ({ children }: { children?: React.ReactNode }) => children ?? null,
      }));
      jest.doMock("@/services/knowledgeApi", () => ({
        buildHeaders: jest.fn(() => ({})),
        convertToUniver: jest.fn(),
        getGatewayBaseUrl: jest.fn(() => ""),
        getKnowledgeFile: jest.fn(),
        updateKnowledgeDocumentContent: jest.fn(),
      }));
      jest.doMock("@/stores/connectionStore", () => ({
        useConnectionStore: jest.fn(() => ({ wsClient: null })),
      }));
      jest.doMock("@/stores/toastStore", () => ({
        useToastStore: jest.fn(() => ({ addToast: jest.fn() })),
      }));

      jest.doMock("./UniverDocPreview", () => {
        throw new Error("eager-univer-doc-import");
      });
      jest.doMock("./UniverSheetPreview", () => {
        throw new Error("eager-univer-sheet-import");
      });

      expect(() => {
        require("./DocPreview");
      }).not.toThrow();
    });
  });
});
