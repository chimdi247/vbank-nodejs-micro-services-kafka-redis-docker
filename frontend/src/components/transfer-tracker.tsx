import { useEffect, useRef } from "react";
import { Check, Loader2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useTransactionStatus } from "@/lib/queries";
import { isFinal, type Transaction } from "@/lib/types";
import { StatusBadge } from "./status-badge";
import { Skeleton } from "@/components/ui/skeleton";

/** "event: ACCOUNT_DEBIT_FAILED, error: insufficient balance, errorCode: E0" -> "insufficient balance" */
export function failureReason(details: string | null): string | null {
  if (!details) return null;
  const m = details.match(/error:\s*(.*?)(?:,\s*errorCode:|$)/);
  if (m && m[1] && m[1] !== "undefined") return m[1];
  return details.includes("COMPENSATED") ? "The destination could not receive the money." : null;
}

type StepState = "done" | "active" | "pending" | "failed";

function stepStates(tx: Transaction): StepState[] {
  const { status, details } = tx;
  if (status === "completed") return ["done", "done", "done"];
  if (status === "failed" || status === "credit_failed") {
    const debitFailed = details?.includes("ACCOUNT_DEBIT_FAILED");
    return debitFailed ? ["done", "failed", "pending"] : ["done", "done", "failed"];
  }
  if (status === "initiated") return ["done", "active", "pending"];
  return ["done", "done", "active"]; // debit_success / credit_success
}

function Step({ state, label }: { state: StepState; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
          state === "done" && "border-success bg-success text-success-foreground",
          state === "active" && "border-primary text-primary",
          state === "failed" && "border-destructive bg-destructive text-destructive-foreground",
          state === "pending" && "border-border text-muted-foreground",
        )}
      >
        {state === "done" && <Check className="h-3.5 w-3.5" />}
        {state === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {state === "failed" && <X className="h-3.5 w-3.5" />}
      </span>
      <span className={cn("text-sm", state === "pending" && "text-muted-foreground", state === "failed" && "text-destructive")}>{label}</span>
    </li>
  );
}

export function TransferSummary({ tx }: { tx: Transaction }) {
  const states = stepStates(tx);
  const failed = tx.status === "failed";
  const reason = failed ? failureReason(tx.details) : null;
  const reversed = failed && tx.details?.includes("COMPENSATED");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tabular font-display text-2xl font-semibold">{formatMoney(tx.amount)}</p>
          <p className="text-xs text-muted-foreground">{tx.transactionId}</p>
        </div>
        <StatusBadge status={tx.status} />
      </div>

      <ol className="space-y-3">
        <Step state={states[0]} label="Transfer received" />
        <Step state={states[1]} label="Money taken from your account" />
        <Step state={states[2]} label={tx.isDestinationExternal ? "Delivered to the other bank" : "Delivered to the destination account"} />
      </ol>

      {failed && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">This transfer didn't go through.</p>
          {reason && <p className="mt-1 text-muted-foreground">Reason: {reason}</p>}
          {reversed && (
            <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <Undo2 className="h-3.5 w-3.5" /> The money was returned to your account.
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">From</dt>
        <dd className="tabular text-right">{tx.sourceAccountNumber}</dd>
        <dt className="text-muted-foreground">To</dt>
        <dd className="tabular text-right">
          {tx.destinationAccountNumber}
          {tx.destinationBankCode && tx.isDestinationExternal ? ` · ${tx.destinationBankCode}` : ""}
        </dd>
        {tx.note && (
          <>
            <dt className="text-muted-foreground">Note</dt>
            <dd className="text-right">{tx.note}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Started</dt>
        <dd className="text-right">{formatDateTime(tx.createdAt)}</dd>
        {tx.completedAt && (
          <>
            <dt className="text-muted-foreground">Finished</dt>
            <dd className="text-right">{formatDateTime(tx.completedAt)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Live view of one transaction: polls until it succeeds or fails. */
export function TransferTracker({ transactionId, onSettled }: { transactionId: string; onSettled?: () => void }) {
  const { data: tx, isLoading, isError } = useTransactionStatus(transactionId);
  const settled = tx ? isFinal(tx.status) : false;

  // let the parent refresh balances once, when the transfer reaches its final state
  useSettledOnce(settled, onSettled);

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (isError || !tx) return <p className="text-sm text-destructive">We couldn't load this transfer. Check the Transactions page.</p>;
  return <TransferSummary tx={tx} />;
}

function useSettledOnce(settled: boolean, cb?: () => void) {
  const fired = useRef(false);
  useEffect(() => {
    if (settled && !fired.current) {
      fired.current = true;
      cb?.();
    }
  }, [settled, cb]);
}
