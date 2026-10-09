import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TransactionStatus } from "@/lib/types";

const LABELS: Record<TransactionStatus, string> = {
  initiated: "Processing",
  debit_success: "Processing",
  credit_success: "Finishing up",
  completed: "Completed",
  failed: "Failed",
  credit_failed: "Failed",
  debit_compensate: "Reversing",
  compensation_success: "Reversed",
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  if (status === "completed")
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" />
        {LABELS[status]}
      </Badge>
    );
  if (status === "failed" || status === "credit_failed")
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3" />
        {LABELS[status]}
      </Badge>
    );
  return (
    <Badge variant="warning">
      <Clock className="h-3 w-3" />
      {LABELS[status]}
    </Badge>
  );
}
