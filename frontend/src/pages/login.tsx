import { useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/queries";
import { Logo } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type LoginValues = z.infer<typeof loginSchema>;

const registerSchema = z.object({
  firstName: z.string().min(3, "At least 3 characters").max(50),
  lastName: z.string().min(3, "At least 3 characters").max(50),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "At least 6 characters").max(100),
});
type RegisterValues = z.infer<typeof registerSchema>;

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Decorative statement page: ledger lines appear one after another, once. */
const LEDGER = [
  { what: "Opening balance", amount: "", balance: "₹ 40,000.00" },
  { what: "Salary credited", amount: "+ 85,000.00", balance: "₹ 1,25,000.00" },
  { what: "Rent to landlord", amount: "− 22,000.00", balance: "₹ 1,03,000.00" },
  { what: "Sent to Asha", amount: "− 2,500.00", balance: "₹ 1,00,500.00" },
  { what: "Refund received", amount: "+ 800.00", balance: "₹ 1,01,300.00" },
];

function LedgerPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
      <Logo className="text-white" />
      <div className="max-w-lg">
        <h2 className="text-5xl font-semibold leading-[1.05]">Every rupee, accounted for.</h2>
        <p className="mt-4 max-w-sm text-white/70">Open accounts, move money between banks and watch each transfer settle, step by step.</p>
      </div>
      <div aria-hidden className="relative -mr-12 rounded-l-lg bg-white/[0.06] py-5 pl-9 pr-12">
        <span className="absolute inset-y-0 left-0 w-3 bg-marigold" />
        <ul className="tabular divide-y divide-white/10 text-sm">
          {LEDGER.map((row, i) => (
            <li
              key={row.what}
              className="ledger-row grid grid-cols-[1fr_auto_auto] gap-6 py-2.5"
              style={{ animationDelay: `${0.25 + i * 0.22}s` }}
            >
              <span className="text-white/90">{row.what}</span>
              <span className="text-right text-white/60">{row.amount}</span>
              <span className="w-28 text-right">{row.balance}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { user, signIn, signUp } = useAuth();
  const [tab, setTab] = useState("signin");

  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  if (user) return <Navigate to="/" replace />;

  const onLogin = loginForm.handleSubmit(async ({ email, password }) => {
    try {
      await signIn(email, password);
    } catch (e) {
      toast.error("Couldn't sign you in", { description: errorMessage(e) });
    }
  });

  const onRegister = registerForm.handleSubmit(async (values) => {
    try {
      await signUp(values);
      toast.success("Welcome to VBank", { description: "Your profile is ready. Open an account to get started." });
    } catch (e) {
      toast.error("Couldn't create your profile", { description: errorMessage(e) });
    }
  });

  const le = loginForm.formState.errors;
  const re = registerForm.formState.errors;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      <LedgerPanel />
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create profile</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <h1 className="text-2xl font-semibold">Welcome back</h1>
              <form onSubmit={onLogin} className="mt-5 space-y-4" noValidate>
                <Field label="Email" error={le.email?.message}>
                  <Input type="email" autoComplete="email" aria-invalid={!!le.email} {...loginForm.register("email")} />
                </Field>
                <Field label="Password" error={le.password?.message}>
                  <Input type="password" autoComplete="current-password" aria-invalid={!!le.password} {...loginForm.register("password")} />
                </Field>
                <Button type="submit" className="w-full" disabled={loginForm.formState.isSubmitting}>
                  {loginForm.formState.isSubmitting && <Loader2 className="animate-spin" />}
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    loginForm.setValue("email", "admin@example.com");
                    loginForm.setValue("password", "password123");
                  }}
                >
                  Fill in the demo admin login
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <h1 className="text-2xl font-semibold">Create your profile</h1>
              <form onSubmit={onRegister} className="mt-5 space-y-4" noValidate>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" error={re.firstName?.message}>
                    <Input autoComplete="given-name" aria-invalid={!!re.firstName} {...registerForm.register("firstName")} />
                  </Field>
                  <Field label="Last name" error={re.lastName?.message}>
                    <Input autoComplete="family-name" aria-invalid={!!re.lastName} {...registerForm.register("lastName")} />
                  </Field>
                </div>
                <Field label="Email" error={re.email?.message}>
                  <Input type="email" autoComplete="email" aria-invalid={!!re.email} {...registerForm.register("email")} />
                </Field>
                <Field label="Password" error={re.password?.message}>
                  <Input type="password" autoComplete="new-password" aria-invalid={!!re.password} {...registerForm.register("password")} />
                </Field>
                <Button type="submit" className="w-full" disabled={registerForm.formState.isSubmitting}>
                  {registerForm.formState.isSubmitting && <Loader2 className="animate-spin" />}
                  Create profile
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
