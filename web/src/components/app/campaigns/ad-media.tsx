"use client";

/**
 * Images and videos for an ad, uploaded to the Meta ad account as they are
 * picked. Videos then process on Meta's side; they are polled until ready.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Film, ImageUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { manageApi } from "@/lib/manage-api";
import { cn } from "@/lib/utils";

export interface MediaItem {
  key: string;
  kind: "image" | "video";
  fileName: string;
  /** Local object URL for the preview. */
  previewUrl: string;
  hash?: string;
  videoId?: string;
  status: "uploading" | "processing" | "ready" | "error";
  error?: string;
}

const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 1024 * 1024 * 1024;
const POLL_MS = 5000;

/** Uploads and tracks an ad's media. `accountId` is the Meta ad account. */
export function useAdMedia(orgId: string, accountId: string | undefined) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const urls = useRef(new Set<string>());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const set = urls.current;
    return () => {
      alive.current = false;
      for (const u of set) URL.revokeObjectURL(u);
      set.clear();
    };
  }, []);

  const patch = useCallback((key: string, p: Partial<MediaItem>) => {
    if (alive.current) setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }, []);

  const pollVideo = useCallback(
    async (key: string, videoId: string) => {
      for (let i = 0; i < 240 && alive.current; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!accountId || !alive.current) return;
        try {
          const { video } = await manageApi.videoStatus(orgId, accountId, videoId);
          if (video.status === "ready") return patch(key, { status: "ready" });
          if (video.status === "error") return patch(key, { status: "error", error: "Meta couldn't process this video." });
        } catch {
          // Transient; keep polling.
        }
      }
      patch(key, { status: "error", error: "Still processing after 20 minutes. Try again later." });
    },
    [orgId, accountId, patch],
  );

  const add = useCallback(
    (files: File[], opts: { max: number; videos: boolean }) => {
      if (!accountId) {
        toast.error("Choose the ad account first");
        return;
      }
      const room = opts.max - items.length;
      if (room <= 0) {
        toast.error(`This format takes up to ${opts.max} ${opts.max === 1 ? "file" : "files"}`);
        return;
      }
      if (files.length > room) toast.message(`Only the first ${room} ${room === 1 ? "file was" : "files were"} added`);
      for (const file of files.slice(0, room)) {
        const isVideo = file.type.startsWith("video/");
        if (isVideo && !opts.videos) {
          toast.error("This format takes images only");
          continue;
        }
        if (!isVideo && !/^image\/(jpeg|png)$/.test(file.type)) {
          toast.error(`${file.name}: use a JPG or PNG image, or an MP4/MOV video`);
          continue;
        }
        if (file.size > (isVideo ? VIDEO_MAX : IMAGE_MAX)) {
          toast.error(`${file.name} is larger than ${isVideo ? "1 GB" : "8 MB"}`);
          continue;
        }
        const key = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);
        urls.current.add(previewUrl);
        setItems((xs) => [...xs, { key, kind: isVideo ? "video" : "image", fileName: file.name, previewUrl, status: "uploading" }]);
        void (async () => {
          try {
            if (isVideo) {
              const { video } = await manageApi.uploadVideo(orgId, accountId, file);
              patch(key, { videoId: video.id, status: video.status === "ready" ? "ready" : "processing" });
              if (video.status !== "ready") void pollVideo(key, video.id);
            } else {
              const { image } = await manageApi.uploadImage(orgId, accountId, file);
              patch(key, { hash: image.hash, status: "ready" });
            }
          } catch (e) {
            patch(key, { status: "error", error: e instanceof ApiError || e instanceof Error ? e.message : "Upload failed" });
          }
        })();
      }
    },
    [orgId, accountId, items.length, patch, pollVideo],
  );

  const remove = useCallback((key: string) => {
    setItems((xs) => {
      const it = xs.find((x) => x.key === key);
      if (it) {
        URL.revokeObjectURL(it.previewUrl);
        urls.current.delete(it.previewUrl);
      }
      return xs.filter((x) => x.key !== key);
    });
  }, []);

  const move = useCallback((key: string, by: -1 | 1) => {
    setItems((xs) => {
      const i = xs.findIndex((x) => x.key === key);
      const j = i + by;
      if (i < 0 || j < 0 || j >= xs.length) return xs;
      const out = [...xs];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  }, []);

  /** Keeps only the first n items (switching to a format that takes fewer). */
  const trim = useCallback(
    (n: number) => {
      setItems((xs) => {
        for (const x of xs.slice(n)) {
          URL.revokeObjectURL(x.previewUrl);
          urls.current.delete(x.previewUrl);
        }
        return xs.slice(0, n);
      });
    },
    [],
  );

  return { items, add, remove, move, trim };
}

export function mediaProblem(items: MediaItem[], min: number): string | null {
  if (items.length < min) return min === 1 ? "Add an image or video." : `Add at least ${min} images or videos.`;
  if (items.some((x) => x.status === "uploading")) return "Wait for the uploads to finish.";
  if (items.some((x) => x.status === "processing")) return "Wait for Meta to finish processing the video.";
  if (items.some((x) => x.status === "error")) return "Remove the files that failed to upload.";
  return null;
}

/** Thumbnails with upload state, plus an add button. */
export function MediaGrid({
  items,
  max,
  videos,
  onAdd,
  onRemove,
  hint,
  disabled,
}: {
  items: MediaItem[];
  max: number;
  videos: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  hint: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-1.5">
      <input
        ref={ref}
        type="file"
        multiple={max > 1}
        accept={videos ? "image/jpeg,image/png,video/mp4,video/quicktime" : "image/jpeg,image/png"}
        className="sr-only"
        aria-label="Upload media"
        onChange={(e) => {
          onAdd(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <ul className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <li key={it.key} className="group relative size-20 overflow-hidden rounded-md border border-border bg-bg-subtle">
            {it.kind === "video" ? (
              <video src={it.previewUrl} muted playsInline className="size-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={it.previewUrl} alt="" className="size-full object-cover" />
            )}
            <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white tabular-nums">
              {i + 1}
              {it.kind === "video" && <Film className="ml-0.5 inline size-2.5" aria-label="video" />}
            </span>
            {it.status !== "ready" && (
              <span
                className={cn(
                  "absolute inset-x-0 bottom-0 flex items-center gap-1 px-1 py-0.5 text-[10px] text-white",
                  it.status === "error" ? "bg-danger/90" : "bg-black/60",
                )}
                title={it.error}
              >
                {it.status === "error" ? (
                  <AlertTriangle className="size-3" aria-hidden="true" />
                ) : (
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                )}
                {it.status === "uploading" ? "Uploading" : it.status === "processing" ? "Processing" : "Failed"}
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(it.key)}
              className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove ${it.fileName}`}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
        {items.length < max && (
          <li>
            <Button
              type="button"
              variant="outline"
              className="size-20 flex-col gap-1 border-dashed text-xs text-fg-muted"
              onClick={() => ref.current?.click()}
              disabled={disabled}
            >
              {items.length ? <Plus aria-hidden="true" /> : <ImageUp aria-hidden="true" />}
              {items.length ? "Add" : "Upload"}
            </Button>
          </li>
        )}
      </ul>
      <p className="text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}
