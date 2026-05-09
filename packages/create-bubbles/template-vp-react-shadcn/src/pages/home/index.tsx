import { PlayCircle } from "lucide-react";
import { useState } from "react";

import { VideoJS, VIDEO_JS_SOURCE_TYPES, type VideoJSSourceType } from "@/components/Player";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HOME_TEXT = {
  player: "VideoJS 播放器",
  title: "HLS / MP4 播放示例",
  play: "播放",
} as const;

type DemoSource = {
  id: Exclude<VideoJSSourceType, "auto" | "native">;
  name: string;
  src: string;
  type: string;
  poster: string;
};

const DEMO_SOURCES: DemoSource[] = [
  {
    id: VIDEO_JS_SOURCE_TYPES.HLS,
    name: "HLS",
    src: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    type: "application/vnd.apple.mpegurl",
    poster: "https://image.mux.com/x36xhzz/thumbnail.jpg?time=0",
  },
  {
    id: VIDEO_JS_SOURCE_TYPES.MP4,
    name: "MP4",
    src: "https://media.w3.org/2010/05/sintel/trailer.mp4",
    type: "video/mp4",
    poster: "https://media.w3.org/2010/05/sintel/poster.png",
  },
];

const Home = () => {
  const [activeSourceType, setActiveSourceType] = useState<DemoSource["id"]>(
    VIDEO_JS_SOURCE_TYPES.HLS,
  );
  const activeSource =
    DEMO_SOURCES.find((source) => source.id === activeSourceType) ?? DEMO_SOURCES[0];

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-emerald-300">{HOME_TEXT.player}</p>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              {HOME_TEXT.title}
            </h1>
          </div>

          <div className="flex rounded-lg border border-white/10 bg-white/5 p-1">
            {DEMO_SOURCES.map((source) => {
              const isActive = source.id === activeSource.id;

              return (
                <Button
                  key={source.id}
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-9 gap-2 rounded-md px-4 text-white hover:bg-white/10 hover:text-white",
                    isActive && "bg-white text-zinc-950 hover:bg-white hover:text-zinc-950",
                  )}
                  onClick={() => setActiveSourceType(source.id)}
                >
                  <PlayCircle className="size-4" />
                  {source.name}
                </Button>
              );
            })}
          </div>
        </div>

        <VideoJS
          key={activeSource.src}
          src={activeSource.src}
          type={activeSource.type}
          sourceType={activeSource.id}
          poster={activeSource.poster}
          preload="metadata"
          className="border border-white/10 shadow-2xl shadow-black/40"
        />
      </section>

      <Button>{HOME_TEXT.play}</Button>
    </main>
  );
};

export default Home;
