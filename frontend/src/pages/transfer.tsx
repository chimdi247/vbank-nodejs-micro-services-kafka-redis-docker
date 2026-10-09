import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorMessage, useAccounts } from "@/lib/queries";
import { formatAccountNumber, formatMoney } from "@/lib/format";
import type { Account } from "@/lib/types";
import { PageHeader } from "@/components/layout/app-shell";
import { TransferTracker } from "@/components/transfer-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const BANKS = [
  { code: "SBANK", name: "Sample Bank" },
  { code: "HBANK", name: "Harbour Bank" },
  { code: "NBANK", name: "Northern Bank" },
];

const schema = z.object({
  from: z.string().min(1, "Choose the account to send from"),
  to: z.string().regex(/^\d{15}$/, "Account numbers have 15 digits"),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount, for example 1500 or 99.50")
    .refine((v) => Number(v) > 0, "Enter an amount above zero"),
  note: z.string().max(100, "Keep the note under 100 characters").optional(),
  bank: z.string().optional(),
});
type Values = z.infer<typeof schema>;

function TransferForm({ external, accounts, onStarted }: { external: boolean; accounts: Account[]; onStarted: (id: string) => void }) {
  const qc = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { from: accounts[0]?.accountNumber ?? "", to: "", amount: "", note: "", bank: BANKS[0].code },
  });
  const { errors, isSubmitting } = form.formState;
  const from = form.watch("from");
  const source = accounts.find((a) => a.accountNumber === from);
  const others = accounts.filter((a) => a.accountNumber !== from);

  const send = useMutation({
    mutationFn: (v: Values) => {
      const base = {
        sourceAccountNumber: v.from,
        destinationAccountNumber: v.to,
        amount: Number(v.amount),
        note: v.note?.trim() || undefined,
      };
      return external
        ? api.transferExternal({ ...base, sourceBankCode: "VBANK", destinationBankCode: v.bank || BANKS[0].code })
        : api.transfer(base);
    },
    onSuccess: (res) => {
      toast.success("Transfer started", { description: "Follow its progress on the right." });
      form.reset({ ...form.getValues(), to: "", amount: "", note: "" });
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      onStarted(res.transactionId);
    },
    onError: (e) => toast.error("Couldn't start the transfer", { description: errorMessage(e) }),
  });

  const submit = form.handleSubmit((v) => {
    if (v.to === v.from) return form.setError("to", { message: "Choose a different account than the one you send from" });
    if (source && Number(v.amount) > source.balance)
      return form.setError("amount", { message: `You have ${formatMoney(source.balance)} available in this account` });
    send.mutate(v);
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label>From</Label>
        <Controller
          control={form.control}
          name="from"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-invalid={!!errors.from}>
                <SelectValue placeholder="Choose an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.accountNumber}>
                    {a.accountName} · {formatMoney(a.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.from && <p role="alert" className="text-sm text-destructive">{errors.from.message}</p>}
      </div>

      {external && (
        <div className="space-y-1.5">
          <Label>Receiving bank</Label>
          <Controller
            control={form.control}
            name="bank"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="to">To account number</Label>
        <Input id="to" inputMode="numeric" maxLength={15} placeholder="15-digit account number" aria-invalid={!!errors.to} className="tabular" {...form.register("to")} />
        {errors.to && <p role="alert" className="text-sm text-destructive">{errors.to.message}</p>}
        {!external && others.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
            Your other account:
            {others.map((a) => (
              <Button key={a.id} type="button" size="sm" variant="outline" onClick={() => form.setValue("to", a.accountNumber, { shouldValidate: true })}>
                {a.accountName} · {formatAccountNumber(a.accountNumber).slice(-7)}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount (INR)</Label>
          <Input id="amount" inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.amount} className="tabular" {...form.register("amount")} />
          {errors.amount && <p role="alert" className="text-sm text-destructive">{errors.amount.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" maxLength={100} placeholder="What is it for?" {...form.register("note")} />
        </div>
      </div>

      <Button type="submit" size="lg" disabled={isSubmitting || send.isPending}>
        {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
        Send money
      </Button>
    </form>
  );
}

export default function TransferPage() {
  const qc = useQueryClient();
  const { data: accounts, isLoading } = useAccounts();
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["accounts"] });
    void qc.invalidateQueries({ queryKey: ["transactions"] });
  }, [qc]);

  return (
    <>
      <PageHeader title="Send money" description="Move money to another VBank account or to a different bank." />

      {!isLoading && (!accounts || accounts.length === 0) ? (
        <Card>
          <CardContent className="p-8">
            <h2 className="text-xl font-semibold">Open an account first</h2>
            <p className="mt-1 text-muted-foreground">You need an account to send money from. Open one on the Accounts page.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardContent className="p-6">
              {accounts && (
                <Tabs defaultValue="internal">
                  <TabsList>
                    <TabsTrigger value="internal">Within VBank</TabsTrigger>
                    <TabsTrigger value="external">To another bank</TabsTrigger>
                  </TabsList>
                  <TabsContent value="internal">
                    <TransferForm key="internal" external={false} accounts={accounts} onStarted={setActiveId} />
                  </TabsContent>
                  <TabsContent value="external">
                    <p className="mb-5 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                      Sandbox tip: the partner bank always accepts ₹200, always declines ₹400, and answers randomly for any other amount. A declined transfer returns your money.
                    </p>
                    <TransferForm key="external" external accounts={accounts} onStarted={setActiveId} />
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>

          <Card className="self-start lg:col-span-2">
            <CardHeader>
              <CardTitle>Transfer status</CardTitle>
              <CardDescription>{activeId ? "Updates every couple of seconds." : "Your latest transfer will appear here."}</CardDescription>
            </CardHeader>
            <CardContent>
              {activeId ? (
                <TransferTracker key={activeId} transactionId={activeId} onSettled={refresh} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Nothing in progress.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
