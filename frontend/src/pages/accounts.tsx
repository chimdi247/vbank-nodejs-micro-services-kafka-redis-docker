import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, HandCoins, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorMessage, useAccounts } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import type { Account, AccountType } from "@/lib/types";
import { Passbook } from "@/components/passbook";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_NAMES: Record<AccountType, string> = { savings: "Savings account", current: "Current account" };

function OpenAccountDialog({ open, onOpenChange, taken }: { open: boolean; onOpenChange: (o: boolean) => void; taken: AccountType[] }) {
  const qc = useQueryClient();
  const available = (["savings", "current"] as AccountType[]).filter((t) => !taken.includes(t));
  const [type, setType] = useState<AccountType | "">("");
  const [name, setName] = useState("");
  const chosen = (type || available[0]) as AccountType | undefined;

  const create = useMutation({
    mutationFn: () => api.createAccount({ accountType: chosen!, accountName: name.trim() || DEFAULT_NAMES[chosen!] }),
    onSuccess: (acc) => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account opened", { description: `${acc.accountName} is ready to use.` });
      setName("");
      setType("");
      onOpenChange(false);
    },
    onError: (e) => toast.error("Couldn't open the account", { description: errorMessage(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open an account</DialogTitle>
          <DialogDescription>You can hold one savings and one current account.</DialogDescription>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">You already have both account types.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Account type</Label>
              <Select value={chosen} onValueChange={(v) => setType(v as AccountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {available.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Account name</Label>
              <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={chosen ? DEFAULT_NAMES[chosen] : ""} maxLength={40} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={available.length === 0 || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Open account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMoneyDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const value = Number(amount);
  const valid = /^\d+(\.\d{1,2})?$/.test(amount) && value > 0 && value <= 1_000_000;

  const deposit = useMutation({
    mutationFn: () => api.depositToAccount(account!.accountNumber, value),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Money added", { description: `New balance: ${formatMoney(res.availableBalance)}` });
      setAmount("");
      onClose();
    },
    onError: (e) => toast.error("Couldn't add money", { description: errorMessage(e) }),
  });

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add money</DialogTitle>
          <DialogDescription>Sandbox top-up for {account?.accountName}. No real money moves.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="deposit-amount">Amount (INR)</Label>
          <Input id="deposit-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" autoFocus />
          <p className="text-xs text-muted-foreground">Up to ₹10,00,000 at a time.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || deposit.isPending} onClick={() => deposit.mutate()}>
            {deposit.isPending && <Loader2 className="animate-spin" />}
            Add money
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseAccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const qc = useQueryClient();
  const close = useMutation({
    mutationFn: () => api.deleteAccount(account!.accountNumber),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Account closed");
      onClose();
    },
    onError: (e) => toast.error("Couldn't close the account", { description: errorMessage(e) }),
  });

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {account?.accountName}?</DialogTitle>
          <DialogDescription>The account is removed permanently. Past transactions stay in your history.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep account
          </Button>
          <Button variant="destructive" disabled={close.isPending} onClick={() => close.mutate()}>
            {close.isPending && <Loader2 className="animate-spin" />}
            Close account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountsPage() {
  const { data: accounts, isLoading, isError } = useAccounts();
  const [opening, setOpening] = useState(false);
  const [depositFor, setDepositFor] = useState<Account | null>(null);
  const [closing, setClosing] = useState<Account | null>(null);

  const copy = async (n: string) => {
    try {
      await navigator.clipboard.writeText(n);
      toast.success("Account number copied");
    } catch {
      toast.error("Couldn't copy", { description: "Select the number and copy it manually." });
    }
  };

  const taken = (accounts ?? []).map((a) => a.accountType);
  const canOpenMore = taken.length < 2;

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Your savings and current accounts."
        actions={
          <Button onClick={() => setOpening(true)} disabled={!canOpenMore && !isLoading}>
            <Plus /> Open account
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : isError ? (
        <p className="text-destructive">We couldn't load your accounts. Refresh the page to try again.</p>
      ) : accounts && accounts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((a) => (
            <Passbook
              key={a.id}
              account={a}
              actions={
                <>
                  <Button size="sm" variant="secondary" onClick={() => setDepositFor(a)}>
                    <HandCoins /> Add money
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void copy(a.accountNumber)}>
                    <Copy /> Copy number
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setClosing(a)}
                    disabled={a.balance > 0}
                    title={a.balance > 0 ? "Move the balance out before closing" : undefined}
                  >
                    <Trash2 /> Close
                  </Button>
                </>
              }
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-8">
            <h2 className="text-xl font-semibold">No accounts yet</h2>
            <p className="max-w-md text-muted-foreground">Open your first account to start receiving and sending money.</p>
            <Button onClick={() => setOpening(true)}>
              <Plus /> Open an account
            </Button>
          </CardContent>
        </Card>
      )}

      <OpenAccountDialog open={opening} onOpenChange={setOpening} taken={taken} />
      <AddMoneyDialog account={depositFor} onClose={() => setDepositFor(null)} />
      <CloseAccountDialog account={closing} onClose={() => setClosing(null)} />
    </>
  );
}
