import type { UploadProgress } from "@/presentation/hooks/use-media-upload";
import { formatBytes } from "@/lib/utils";

export function getUploadSpeed(upload: UploadProgress): string | null {
  if (!upload.startedAt || !upload.bytesLoaded || upload.status !== "uploading") return null;
  const elapsed = (Date.now() - upload.startedAt) / 1000;
  if (elapsed < 1) return null;
  const bytesPerSec = upload.bytesLoaded / elapsed;
  return `${formatBytes(bytesPerSec)}/s`;
}

export function UploadRow({
  upload,
  onRetry,
  onRemove,
}: {
  upload: UploadProgress;
  onRetry: (fileId: string) => void;
  onRemove: (fileId: string) => void;
}) {
  const isQueued = upload.status === "queued";
  const isActive = upload.status === "uploading" || upload.status === "retrying";
  const isError = upload.status === "error";
  const isComplete = upload.status === "complete";
  const speed = getUploadSpeed(upload);

  const barColor = isError
    ? "bg-red-500"
    : isComplete
      ? "bg-green-500"
      : upload.status === "retrying"
        ? "bg-yellow-500"
        : "bg-blue-500";

  const statusIcon = isError
    ? "\u26A0"
    : isComplete
      ? "\u2713"
      : upload.status === "retrying"
        ? "\u21BB"
        : isQueued
          ? "\u2022"
          : null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${
        isError ? "bg-red-50 dark:bg-red-900/20" : "bg-gray-50 dark:bg-gray-900"
      }`}
    >
      {/* Progress bar */}
      <div
        className={`absolute bottom-0 left-0 h-1 transition-all duration-300 ${barColor}`}
        style={{ width: `${upload.progress}%` }}
      />
      <div className="flex items-center gap-3 p-3">
        {/* Status icon */}
        <span className="flex-shrink-0 w-5 text-center">
          {statusIcon ? (
            <span className={isError ? "text-red-500" : isComplete ? "text-green-600" : isQueued ? "text-gray-400" : "text-yellow-500"}>
              {statusIcon}
            </span>
          ) : (
            <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </span>

        {/* Filename + details */}
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium">{upload.filename}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
            {isError ? (
              <span className="text-red-600 dark:text-red-400">{upload.error || "Failed"}</span>
            ) : (
              <>
                {upload.bytesLoaded != null && upload.bytesTotal != null && upload.bytesTotal > 0 && (
                  <span>{formatBytes(upload.bytesLoaded)} / {formatBytes(upload.bytesTotal)}</span>
                )}
                {speed && <span>{speed}</span>}
                {isActive && upload.retryCount > 0 && (
                  <span>Retry {upload.retryCount}/{3}</span>
                )}
                {upload.status === "processing" && <span>Processing...</span>}
                {upload.status === "pending" && <span>Waiting...</span>}
                {upload.status === "queued" && <span>Queued</span>}
              </>
            )}
          </div>
        </div>

        {/* Progress percentage */}
        {!isError && !isComplete && (
          <span className="text-sm tabular-nums text-gray-500 flex-shrink-0">{upload.progress}%</span>
        )}

        {/* Retry button for errors */}
        {isError && (
          <button
            onClick={() => onRetry(upload.fileId)}
            className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/60 flex-shrink-0"
          >
            Retry
          </button>
        )}

        {/* Dismiss */}
        <button
          onClick={() => onRemove(upload.fileId)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
