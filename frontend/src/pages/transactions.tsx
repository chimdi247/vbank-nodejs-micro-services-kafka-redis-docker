import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAccounts, useTransactions } from "@/lib/queries";
import { formatDateTime, formatMoney, maskAccountNumber } from "@/lib/format";
import type { Transaction, TransactionStatus } from "@/lib/types";
import { PageHeader } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { TransferTracker } from "@/components/transfer-tracker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PAGE_SIZE = 15;

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "initiated", label: "Processing" },
];

export default function TransactionsPage() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");
  const [account, setAccount] = useState("all");
  const [selected, setSelected] = useState<Transaction | null>(null);

  const accounts = useAccounts();
  const mine = useMemo(() => new Set((accounts.data ?? []).map((a) => a.accountNumber)), [accounts.data]);

  const { data, isLoading, isError, isFetching } = useTransactions({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    status: status === "all" ? undefined : (status as TransactionStatus),
    accountNumber: account === "all" ? undefined : account,
  });

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };

  return (
    <>
      <PageHeader title="Transactions" description="Every transfer to or from your accounts." />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-44">
          <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
            <SelectTrigger aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <Select value={account} onValueChange={(v) => reset(() => setAccount(v))}>
            <SelectTrigger aria-label="Filter by account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {(accounts.data ?? []).map((a) => (
                <SelectItem key={a.id} value={a.accountNumber}>
                  {a.accountName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-8 text-destructive">We couldn't load your transactions. Refresh the page to try again.</p>
        ) : data && data.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={isFetching ? "opacity-70 transition-opacity" : undefined}>
              {data.data.map((tx) => {
                const from = mine.has(tx.sourceAccountNumber);
                const to = mine.has(tx.destinationAccountNumber);
                const outgoing = from && !to;
                const between = from && to;
                const counterparty = outgoing ? tx.destinationAccountNumber : tx.sourceAccountNumber;
                return (
                  <TableRow
                    key={tx.transactionId}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setSelected(tx)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(tx)}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(tx.createdAt)}</TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {between ? "Between your accounts" : outgoing ? `Sent to ${maskAccountNumber(counterparty)}` : `Received from ${maskAccountNumber(counterparty)}`}
                        {tx.isDestinationExternal && tx.destinationBankCode ? ` (${tx.destinationBankCode})` : ""}
                      </p>
                      {tx.note && <p className="text-xs text-muted-foreground">{tx.note}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={tx.status} />
                    </TableCell>
                    <TableCell className="tabular whitespace-nowrap text-right font-semibold">
                      {between ? "" : outgoing ? "− " : "+ "}
                      {formatMoney(tx.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="p-10 text-center text-muted-foreground">No transactions match these filters.</p>
        )}
      </Card>

      {data && data.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page + 1} of {pages} · {data.total} transactions
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction details</DialogTitle>
            <DialogDescription>Reference numbers are useful if you need to contact support.</DialogDescription>
          </DialogHeader>
          {selected && <TransferTracker transactionId={selected.transactionId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
