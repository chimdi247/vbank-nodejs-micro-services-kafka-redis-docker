import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Plus, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAccounts, useTransactions } from "@/lib/queries";
import { formatDateTime, formatMoney, greeting, maskAccountNumber } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { Passbook } from "@/components/passbook";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DAY = 24 * 60 * 60 * 1000;

function lastSevenDays(txs: Transaction[], mine: Set<string>) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * DAY);
    return { key: d.toDateString(), label: d.toLocaleDateString("en-IN", { weekday: "short" }), in: 0, out: 0 };
  });

  for (const tx of txs) {
    if (tx.status !== "completed") continue;
    const bucket = days.find((d) => d.key === new Date(tx.createdAt).toDateString());
    if (!bucket) continue;
    const from = mine.has(tx.sourceAccountNumber);
    const to = mine.has(tx.destinationAccountNumber);
    if (from && !to) bucket.out += tx.amount;
    if (to && !from) bucket.in += tx.amount;
  }
  return days;
}

export function TransactionLine({ tx, mine }: { tx: Transaction; mine: Set<string> }) {
  const from = mine.has(tx.sourceAccountNumber);
  const to = mine.has(tx.destinationAccountNumber);
  const between = from && to;
  const outgoing = from && !to;
  const counterparty = outgoing ? tx.destinationAccountNumber : tx.sourceAccountNumber;

  const title = between ? "Between your accounts" : outgoing ? `Sent to ${maskAccountNumber(counterparty)}` : `Received from ${maskAccountNumber(counterparty)}`;

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
        {outgoing ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatDateTime(tx.createdAt)}
          {tx.note ? ` · ${tx.note}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="tabular text-sm font-semibold">
          {between ? "" : outgoing ? "− " : "+ "}
          {formatMoney(tx.amount)}
        </p>
        <StatusBadge status={tx.status} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const accounts = useAccounts();
  const txs = useTransactions({ limit: 100 });

  const mine = useMemo(() => new Set((accounts.data ?? []).map((a) => a.accountNumber)), [accounts.data]);
  const total = (accounts.data ?? []).reduce((sum, a) => sum + a.balance, 0);
  const chart = useMemo(() => lastSevenDays(txs.data?.data ?? [], mine), [txs.data, mine]);
  const recent = (txs.data?.data ?? []).slice(0, 5);
  const hasActivity = chart.some((d) => d.in > 0 || d.out > 0);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.firstName}`}
        description="Here is where your money stands today."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/accounts">
                <Plus /> Open account
              </Link>
            </Button>
            <Button asChild>
              <Link to="/transfer">
                <Send /> Send money
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Total balance" className="mb-10">
        <p className="text-sm text-muted-foreground">
          Total balance{accounts.data ? ` across ${accounts.data.length} ${accounts.data.length === 1 ? "account" : "accounts"}` : ""}
        </p>
        {accounts.isLoading ? (
          <Skeleton className="mt-2 h-14 w-80" />
        ) : (
          <p className="tabular font-display text-5xl font-semibold tracking-tight sm:text-6xl">{formatMoney(total)}</p>
        )}
      </section>

      <section aria-label="Accounts" className="mb-10">
        {accounts.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        ) : accounts.data && accounts.data.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.data.map((a) => (
              <Passbook key={a.id} account={a} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-8">
              <h2 className="text-xl font-semibold">You don't have an account yet</h2>
              <p className="max-w-md text-muted-foreground">Open a savings or current account to receive money and start sending it.</p>
              <Button asChild>
                <Link to="/accounts">
                  <Plus /> Open your first account
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Money in and out</CardTitle>
            <CardDescription>Completed transfers with other people, last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {txs.isLoading ? (
              <Skeleton className="h-64" />
            ) : hasActivity ? (
              <div className="h-64" role="img" aria-label="Bar chart of money received and sent per day over the last 7 days">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} barGap={4}>
                    <CartesianGrid vertical={false} stroke="#dfe6e2" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} cursor={{ fill: "#eef2ef" }} />
                    <Bar dataKey="in" name="Received" fill="#0e6b63" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="out" name="Sent" fill="#9db8b3" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Nothing to chart yet. Completed transfers to or from other people show up here.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent activity</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/transactions">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {txs.isLoading ? (
              <Skeleton className="h-64" />
            ) : recent.length > 0 ? (
              <div className="divide-y">
                {recent.map((tx) => (
                  <TransactionLine key={tx.transactionId} tx={tx} mine={mine} />
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No transfers yet. Send money to see it here.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
