import {
  CheckCircledIcon,
  ExclamationTriangleIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
export type OperationResult = {
  id: string;
  status:
    "progress" | "confirmed" | "unchanged" | "warning" | "uncertain" | "error";
  title: string;
  repository: string;
  path: string;
  destination: string;
  message: string;
  warning?: string;
};
export default function OperationNotice({
  result,
  onClose,
}: {
  result: OperationResult;
  onClose: () => void;
}) {
  const important =
    result.status === "warning" ||
    result.status === "uncertain" ||
    result.status === "error";
  const Icon =
    result.status === "progress"
      ? ReloadIcon
      : important
        ? ExclamationTriangleIcon
        : CheckCircledIcon;
  return (
    <div
      className={`banner operation-notice ${result.status === "error" ? "error" : important ? "warning" : "notice"}`}
      role={important ? "alert" : "status"}
      aria-atomic="true"
    >
      <Icon aria-hidden="true" />
      <div>
        <strong>{result.title}</strong>
        <p title={result.path}>
          {result.repository} · {result.destination}
        </p>
        <p>{result.path}</p>
        <p>{result.message}</p>
        {result.warning && <p>{result.warning}</p>}
      </div>
      {result.status !== "progress" && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar resultado de operación"
        >
          ×
        </button>
      )}
    </div>
  );
}
