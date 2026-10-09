export type AccountType = "savings" | "current";

export interface Account {
  id: number;
  userId: number;
  accountNumber: string;
  accountName: string | null;
  accountType: AccountType;
  accountStatus: "active" | "frozen" | "closed";
  balance: number;
  currency: string;
  createdAt: string;
}

export type TransactionStatus =
  | "initiated"
  | "debit_success"
  | "credit_success"
  | "failed"
  | "credit_failed"
  | "debit_compensate"
  | "compensation_success"
  | "completed";

export interface Transaction {
  id: number;
  userId: number | null;
  transactionId: string;
  sourceAccountNumber: string;
  destinationAccountNumber: string;
  transactionType: "transfer" | "credit" | "debit";
  status: TransactionStatus;
  amount: number;
  note: string | null;
  referenceId: string | null;
  sourceBankCode: string | null;
  destinationBankCode: string | null;
  isSourceExternal: boolean;
  isDestinationExternal: boolean;
  isInternal: boolean;
  details: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionPage {
  data: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface SessionUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

export const isFinal = (s: TransactionStatus) => s === "completed" || s === "failed";
