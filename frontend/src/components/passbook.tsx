import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatAccountNumber, formatMoney } from "@/lib/format";
import type { Account } from "@/lib/types";

/**
 * An account drawn like a passbook: the marigold strip is the binding.
 * It is the only place that colour is used, so it reads as the app's signature.
 */
export function Passbook({ account, actions }: { account: Account; actions?: ReactNode }) {
  return (
    <article className="relative overflow-hidden rounded-lg border bg-card">
      <span aria-hidden className="absolute inset-y-0 left-0 w-3 bg-marigold" />
      <div className="space-y-5 py-5 pl-8 pr-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold leading-tight">{account.accountName || "Account"}</h3>
            <p className="tabular mt-1 text-sm tracking-wide text-muted-foreground">{formatAccountNumber(account.accountNumber)}</p>
          </div>
          <Badge variant="outline" className="shrink-0 capitalize">
            {account.accountType}
          </Badge>
        </header>
        <div>
          <p className="text-xs text-muted-foreground">Available balance</p>
          <p className="tabular font-display text-3xl font-semibold tracking-tight">{formatMoney(account.balance, account.currency)}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </article>
  );
}
