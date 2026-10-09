import { useQuery } from "@tanstack/react-query";
import * as api from "./api";
import { isFinal } from "./types";

export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });

export const useTransactions = (filters: api.TransactionFilters) =>
  useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => api.listTransactions(filters),
    placeholderData: (prev) => prev,
  });

/** Polls a transaction every 1.5 s until it reaches a final state. */
export const useTransactionStatus = (transactionId: string | null) =>
  useQuery({
    queryKey: ["transaction", transactionId],
    queryFn: () => api.getTransaction(transactionId as string),
    enabled: !!transactionId,
    refetchInterval: (query) => {
      const tx = query.state.data;
      return tx && isFinal(tx.status) ? false : 1500;
    },
  });

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : "Something went wrong. Try again.");
