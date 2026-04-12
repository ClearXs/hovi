import { fireEvent, render, screen } from "@testing-library/react";
import { FileList, type FileItemProps } from "@/components/files/FileList";

jest.mock("@/stores/toastStore", () => ({
  useToastStore: () => ({
    addToast: jest.fn(),
  }),
}));

describe("FileList path cards", () => {
  test("renders inaccessible path card as disabled with warning text", () => {
    const files: FileItemProps[] = [
      {
        name: "missing.txt",
        path: "missing.txt",
        source: "detected-path",
        resolvedPath: "missing.txt",
        access: "missing",
        kind: "file",
      },
    ];
    render(<FileList files={files} title="相关路径" />);
    expect(screen.getByText("路径不可访问")).toBeInTheDocument();
  });

  test("calls preview callback when clicking preview action", () => {
    const onPreviewFile = jest.fn();
    const files: FileItemProps[] = [
      {
        name: "a.ts",
        path: "a.ts",
        source: "detected-path",
        resolvedPath: "a.ts",
        kind: "file",
        previewable: true,
      },
    ];
    render(<FileList files={files} onPreviewFile={onPreviewFile} />);
    fireEvent.click(screen.getByTitle("预览"));
    expect(onPreviewFile).toHaveBeenCalledTimes(1);
    expect(onPreviewFile).toHaveBeenCalledWith(expect.objectContaining({ name: "a.ts" }));
  });

  test("does not open a new window when preview callback is missing", () => {
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    const files: FileItemProps[] = [
      {
        name: "notes.md",
        path: "/workspace/notes.md",
        source: "detected-path",
        resolvedPath: "/workspace/notes.md",
        kind: "file",
        previewable: true,
      },
    ];

    render(<FileList files={files} />);
    fireEvent.click(screen.getByTitle("预览"));

    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  test("calls system open callback for detected path cards", () => {
    const onSystemOpenFile = jest.fn();
    const files: FileItemProps[] = [
      {
        name: "b.ts",
        path: "b.ts",
        source: "detected-path",
        resolvedPath: "b.ts",
        kind: "file",
      },
    ];
    render(<FileList files={files} onSystemOpenFile={onSystemOpenFile} />);
    fireEvent.click(screen.getByTitle("系统打开"));
    expect(onSystemOpenFile).toHaveBeenCalledTimes(1);
    expect(onSystemOpenFile).toHaveBeenCalledWith(expect.objectContaining({ name: "b.ts" }));
    expect(screen.getByTestId("icon-system-open")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-download")).not.toBeInTheDocument();
  });

  test("maps file icon by extension even when type is default", () => {
    const files: FileItemProps[] = [
      {
        name: "main.ts",
        path: "main.ts",
        source: "detected-path",
        resolvedPath: "src/main.ts",
        type: "md",
      },
      {
        name: "song.mp3",
        path: "song.mp3",
        source: "detected-path",
        resolvedPath: "media/song.mp3",
        type: "md",
      },
    ];
    render(<FileList files={files} />);
    expect(screen.getByTestId("file-icon-code")).toBeInTheDocument();
    expect(screen.getByTestId("file-icon-audio")).toBeInTheDocument();
  });

  test("maps structured text extensions to dedicated icons", () => {
    const files: FileItemProps[] = [
      {
        name: "config.json",
        path: "config.json",
        source: "detected-path",
        resolvedPath: "workspace/config.json",
      },
      {
        name: "pipeline.yaml",
        path: "pipeline.yaml",
        source: "detected-path",
        resolvedPath: "workspace/pipeline.yaml",
      },
      {
        name: "table.csv",
        path: "table.csv",
        source: "detected-path",
        resolvedPath: "workspace/table.csv",
      },
      {
        name: "query.sql",
        path: "query.sql",
        source: "detected-path",
        resolvedPath: "workspace/query.sql",
      },
      {
        name: "deploy.sh",
        path: "deploy.sh",
        source: "detected-path",
        resolvedPath: "workspace/deploy.sh",
      },
    ];
    render(<FileList files={files} />);
    expect(screen.getByTestId("file-icon-json")).toBeInTheDocument();
    expect(screen.getByTestId("file-icon-yaml")).toBeInTheDocument();
    expect(screen.getByTestId("file-icon-csv")).toBeInTheDocument();
    expect(screen.getByTestId("file-icon-sql")).toBeInTheDocument();
    expect(screen.getByTestId("file-icon-shell")).toBeInTheDocument();
  });

  test("renders directory icon for trailing slash path cards", () => {
    const files: FileItemProps[] = [
      {
        name: "招标书",
        path: "/Users/jiangwei/clawd/招标书/",
        source: "detected-path",
        resolvedPath: "/Users/jiangwei/clawd/招标书/",
        kind: "directory",
      },
    ];
    render(<FileList files={files} />);
    expect(screen.getByTestId("file-icon-directory")).toBeInTheDocument();
  });

  test("disambiguates same filename with parent path tail", () => {
    const files: FileItemProps[] = [
      {
        name: "report.md",
        path: "report.md",
        source: "detected-path",
        resolvedPath: "/workspace/alpha/report.md",
      },
      {
        name: "report.md",
        path: "report.md",
        source: "detected-path",
        resolvedPath: "/workspace/beta/report.md",
      },
    ];
    render(<FileList files={files} />);
    expect(screen.getByText("report.md · alpha")).toBeInTheDocument();
    expect(screen.getByText("report.md · beta")).toBeInTheDocument();
  });

  test("shows truncated path text with full path hover hint", () => {
    const longPath =
      "/Users/jiangwei/workspace/very/long/path/for/proposal/docs/2026/remote/sensing/report.md";
    const files: FileItemProps[] = [
      {
        name: "report.md",
        path: longPath,
        source: "detected-path",
        resolvedPath: longPath,
      },
    ];
    render(<FileList files={files} />);
    const trigger = screen.getByText((value) => value.includes("..."));
    expect(trigger).toHaveAttribute("title", longPath);
  });
});
