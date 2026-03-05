"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type UploadQueueStatus = "pending" | "uploading" | "success" | "error";

export interface UploadQueueItem {
  id: string;
  file: File;
  description?: string;
  tags?: string[];
  progress: number;
  status: UploadQueueStatus;
  error?: string;
}

interface AddQueueOptions {
  description?: string;
  tags?: string[];
}

interface UseUploadQueueOptions {
  concurrency?: number;
  uploadFile: (item: UploadQueueItem, onProgress: (progress: number) => void) => Promise<void>;
  onItemSuccess?: (item: UploadQueueItem) => void;
}

export function useUploadQueue({
  uploadFile,
  onItemSuccess,
  concurrency = 2,
}: UseUploadQueueOptions) {
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const activeCountRef = useRef(0);
  const runningRef = useRef(false);

  const runNext = useCallback(() => {
    if (!runningRef.current) return;
    if (activeCountRef.current >= concurrency) return;

    setItems((prevItems) => {
      const nextIndex = prevItems.findIndex((item) => item.status === "pending");
      if (nextIndex === -1) {
        if (activeCountRef.current === 0) {
          runningRef.current = false;
          setIsRunning(false);
        }
        return prevItems;
      }

      const current = prevItems[nextIndex];
      activeCountRef.current += 1;

      const nextItems = [...prevItems];
      nextItems[nextIndex] = {
        ...current,
        status: "uploading",
        progress: current.progress > 0 ? current.progress : 1,
        error: undefined,
      };

      const startedItem = nextItems[nextIndex];
      void uploadFile(startedItem, (progress) => {
        const safeProgress = Number.isFinite(progress)
          ? Math.max(0, Math.min(100, Math.round(progress)))
          : 0;
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === startedItem.id
              ? { ...item, progress: Math.max(item.progress, safeProgress) }
              : item,
          ),
        );
      })
        .then(() => {
          setItems((currentItems) =>
            currentItems.map((item) =>
              item.id === startedItem.id ? { ...item, status: "success", progress: 100 } : item,
            ),
          );
          onItemSuccess?.(startedItem);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "上传失败";
          setItems((currentItems) =>
            currentItems.map((item) =>
              item.id === startedItem.id ? { ...item, status: "error", error: message } : item,
            ),
          );
        })
        .finally(() => {
          activeCountRef.current = Math.max(0, activeCountRef.current - 1);
          runNext();
        });

      return nextItems;
    });
  }, [concurrency, onItemSuccess, uploadFile]);

  const addFiles = useCallback(
    (files: File[], options?: AddQueueOptions) => {
      const now = Date.now();
      const nextItems: UploadQueueItem[] = files.map((file, index) => ({
        id: `${now}-${index}-${file.name}`,
        file,
        description: options?.description,
        tags: options?.tags,
        progress: 0,
        status: "pending",
      }));
      setItems((prevItems) => [...prevItems, ...nextItems]);
      if (runningRef.current) {
        const workers = Math.max(1, concurrency);
        for (let i = 0; i < workers; i += 1) {
          runNext();
        }
      }
    },
    [concurrency, runNext],
  );

  const start = useCallback(() => {
    if (isRunning) return;
    runningRef.current = true;
    setIsRunning(true);
    const workers = Math.max(1, concurrency);
    for (let i = 0; i < workers; i += 1) {
      runNext();
    }
  }, [concurrency, isRunning, runNext]);

  const retry = useCallback(
    (id: string) => {
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.id === id ? { ...item, status: "pending", error: undefined, progress: 0 } : item,
        ),
      );
      if (!isRunning) {
        runningRef.current = true;
        setIsRunning(true);
        runNext();
      }
    },
    [isRunning, runNext],
  );

  const remove = useCallback((id: string) => {
    setItems((prevItems) =>
      prevItems.filter((item) => item.id !== id || item.status === "uploading"),
    );
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prevItems) =>
      prevItems.filter((item) => item.status === "uploading" || item.status === "pending"),
    );
  }, []);

  const summary = useMemo(() => {
    const pending = items.filter((item) => item.status === "pending").length;
    const uploading = items.filter((item) => item.status === "uploading").length;
    const success = items.filter((item) => item.status === "success").length;
    const error = items.filter((item) => item.status === "error").length;
    return { pending, uploading, success, error, total: items.length };
  }, [items]);

  return {
    items,
    summary,
    isRunning,
    addFiles,
    start,
    retry,
    remove,
    clearFinished,
  };
}
