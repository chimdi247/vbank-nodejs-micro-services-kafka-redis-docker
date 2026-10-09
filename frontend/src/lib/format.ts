const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export function formatMoney(value: number | null | undefined, currency = "INR"): string {
  const n = Number(value ?? 0);
  if (currency === "INR") return inr.format(n);
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

/** 112026110000001 -> "1120 2611 0000 001" */
export function formatAccountNumber(n: string): string {
  return n.replace(/(.{4})/g, "$1 ").trim();
}

export function maskAccountNumber(n: string): string {
  return `•••• ${n.slice(-4)}`;
}

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dateOnly = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const formatDateTime = (d: string | Date) => dateTime.format(new Date(d));
export const formatDate = (d: string | Date) => dateOnly.format(new Date(d));

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
