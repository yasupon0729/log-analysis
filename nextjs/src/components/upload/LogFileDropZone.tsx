"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  uploadDropZoneRecipe,
  uploadDropZoneSubtitleRecipe,
  uploadDropZoneTitleRecipe,
  uploadHiddenInputRecipe,
} from "@/styles/recipes/components/upload-log-client.recipe";

interface LogFileDropZoneProps {
  isLoading: boolean;
  accept: string;
  onFilesSelected: (files: FileList | null) => void;
}

export function LogFileDropZone({
  isLoading,
  accept,
  onFilesSelected,
}: LogFileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      onFilesSelected(files);
    },
    [onFilesSelected],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files);
      event.target.value = "";
    },
    [handleFiles],
  );

  const onDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      handleFiles(event.dataTransfer?.files ?? null);
    },
    [handleFiles],
  );

  const triggerFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <Button
      type="button"
      onClick={triggerFileDialog}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={uploadDropZoneRecipe({
        dragging: isDragging,
        loading: isLoading,
      })}
      variant="unstyled"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className={uploadHiddenInputRecipe()}
        onChange={handleInputChange}
      />
      <p className={uploadDropZoneTitleRecipe()}>
        {isLoading ? "復号処理中..." : "ここにファイルをドロップ"}
      </p>
      <p className={uploadDropZoneSubtitleRecipe()}>
        クリックでファイル選択もできます
      </p>
    </Button>
  );
}
