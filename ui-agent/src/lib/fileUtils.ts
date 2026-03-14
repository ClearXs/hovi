import { FileItemProps } from "@/components/files/FileList";
import { FileItem } from "@/types";

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return "";

  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

/**
 * 将 Store 中的 FileItem 转换为 FileList 组件需要的 FileItemProps
 */
export function convertFileItemToProps(fileItem: FileItem): FileItemProps {
  // 从文件名推断类型
  const getFileType = (fileName: string): FileItemProps["type"] => {
    const extension = fileName.split(".").pop()?.toLowerCase();

    switch (extension) {
      case "pdf":
        return "pdf";
      case "doc":
      case "docx":
        return "docx";
      case "xls":
      case "xlsx":
        return "xlsx";
      case "ppt":
      case "pptx":
        return "pptx";
      case "md":
      case "markdown":
        return "md";
      case "png":
        return "png";
      case "jpg":
      case "jpeg":
        return "jpg";
      case "zip":
      case "rar":
      case "tar":
      case "gz":
        return "zip";
      default:
        return "md";
    }
  };

  return {
    name: fileItem.name,
    path: fileItem.path,
    type: getFileType(fileItem.name),
    size: formatFileSize(fileItem.size),
    description: fileItem.content ? `${fileItem.content.substring(0, 100)}...` : undefined,
  };
}

/**
 * 批量转换文件列表
 */
export function convertFileItems(fileItems: FileItem[]): FileItemProps[] {
  return fileItems.map(convertFileItemToProps);
}
