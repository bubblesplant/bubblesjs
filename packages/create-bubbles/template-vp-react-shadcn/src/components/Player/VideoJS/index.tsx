import { createPlayer } from "@videojs/react";
import { HlsVideo } from "@videojs/react/media/hls-video";
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import "@videojs/react/video/skin.css";
import type { ReactNode, VideoHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const VIDEO_JS_SOURCE_TYPES = {
  AUTO: "auto",
  HLS: "hls",
  MP4: "mp4",
  NATIVE: "native",
} as const;

export type VideoJSSourceType = (typeof VIDEO_JS_SOURCE_TYPES)[keyof typeof VIDEO_JS_SOURCE_TYPES];

export type VideoJSSource = {
  src: string;
  type?: string;
  sourceType?: Exclude<VideoJSSourceType, "auto">;
};

type VideoJSPreload = "" | "none" | "metadata" | "auto";

type NativeVideoProps = Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  "children" | "className" | "controls" | "poster" | "preload" | "src"
>;

export type VideoJSProps = NativeVideoProps & {
  src?: string;
  type?: string;
  sources?: VideoJSSource[];
  sourceType?: VideoJSSourceType;
  poster?: string;
  className?: string;
  videoClassName?: string;
  preload?: VideoJSPreload;
  hlsConfig?: Record<string, unknown>;
  hlsDebug?: boolean;
  preferPlayback?: "mse" | "native";
  children?: ReactNode;
};

const VideoJSPlayer = createPlayer({
  features: videoFeatures,
  displayName: "VideoJS",
});

const HLS_MIME_TYPES = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl"]);

const MP4_MIME_TYPES = new Set(["video/mp4", "application/mp4"]);

const getSourceList = ({ src, type, sources }: Pick<VideoJSProps, "src" | "type" | "sources">) => {
  if (sources?.length) {
    return sources;
  }

  return src ? [{ src, type }] : [];
};

const getUrlPath = (src: string) => src.split(/[?#]/)[0]?.toLowerCase() ?? "";

const inferSourceType = (source: VideoJSSource, fallback: VideoJSSourceType) => {
  if (source.sourceType) {
    return source.sourceType;
  }

  if (fallback !== VIDEO_JS_SOURCE_TYPES.AUTO) {
    return fallback;
  }

  const mimeType = source.type?.toLowerCase();
  const path = getUrlPath(source.src);

  if (mimeType && HLS_MIME_TYPES.has(mimeType)) {
    return VIDEO_JS_SOURCE_TYPES.HLS;
  }

  if (path.endsWith(".m3u8")) {
    return VIDEO_JS_SOURCE_TYPES.HLS;
  }

  if (mimeType && MP4_MIME_TYPES.has(mimeType)) {
    return VIDEO_JS_SOURCE_TYPES.MP4;
  }

  if (path.endsWith(".mp4")) {
    return VIDEO_JS_SOURCE_TYPES.MP4;
  }

  return VIDEO_JS_SOURCE_TYPES.NATIVE;
};

const VideoJS = ({
  src,
  type,
  sources,
  sourceType = VIDEO_JS_SOURCE_TYPES.AUTO,
  poster,
  className,
  videoClassName,
  preload = "metadata",
  playsInline = true,
  hlsConfig,
  hlsDebug = false,
  preferPlayback = "mse",
  children,
  ...videoProps
}: VideoJSProps) => {
  const sourceList = getSourceList({ src, type, sources });
  const primarySource = sourceList[0];

  if (!primarySource) {
    return null;
  }

  const resolvedSourceType = inferSourceType(primarySource, sourceType);
  const isHls = resolvedSourceType === VIDEO_JS_SOURCE_TYPES.HLS;

  return (
    <VideoJSPlayer.Provider>
      <VideoSkin
        poster={poster}
        className={cn(
          "aspect-video w-full overflow-hidden rounded-lg bg-black shadow-sm",
          className,
        )}
      >
        {isHls ? (
          <HlsVideo
            {...videoProps}
            src={primarySource.src}
            type={primarySource.type ?? "application/vnd.apple.mpegurl"}
            preload={preload}
            playsInline={playsInline}
            config={hlsConfig}
            debug={hlsDebug}
            preferPlayback={preferPlayback}
            className={cn("h-full w-full", videoClassName)}
          >
            {children}
          </HlsVideo>
        ) : (
          <Video
            {...videoProps}
            preload={preload}
            playsInline={playsInline}
            className={cn("h-full w-full", videoClassName)}
          >
            {sourceList.map((source) => (
              <source key={`${source.src}-${source.type}`} src={source.src} type={source.type} />
            ))}
            {children}
          </Video>
        )}
      </VideoSkin>
    </VideoJSPlayer.Provider>
  );
};

export default VideoJS;
