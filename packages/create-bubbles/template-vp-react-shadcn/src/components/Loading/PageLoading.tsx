import { Spinner } from "@/components/ui/spinner";

const Loading = () => {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
};

export default Loading;
