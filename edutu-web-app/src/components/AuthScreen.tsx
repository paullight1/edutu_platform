import React, { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Star,
  User,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useClerk, useSignIn, useSignUp } from "@clerk/clerk-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { rememberPostAuthRedirect } from "../lib/auth";

/** What the sign-in/sign-up flows hand back. Every field is optional: the
 *  email-only paths fire before Clerk has created the user. */
export interface AuthSuccessPayload {
  id?: string | null;
  email?: string;
  name?: string;
}

interface AuthScreenProps {
  onAuthSuccess: (userData: AuthSuccessPayload) => void;
}

type AuthMode =
  | "sign-in"
  | "sign-up"
  | "verify"
  | "verify-sign-in"
  | "verify-second-factor"
  | "reset-password";
type OAuthProvider = "google";
type SecondFactorStrategy =
  | "email_code"
  | "phone_code"
  | "totp"
  | "backup_code"
  | "";

const GoogleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      fill="#EA4335"
    />
  </svg>
);

const AvatarNode = ({
  className,
  label,
}: {
  className: string;
  label: string;
}) => (
  <div
    className={`absolute h-14 w-14 rounded-2xl border border-white/60 bg-white/95 p-1.5 shadow-xl dark:border-gray-700/60 dark:bg-gray-900/95 ${className}`}
  >
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
      {label}
    </div>
  </div>
);

const FieldShell = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <label className="block">
    <span className="mb-2 block text-xs font-medium text-text-secondary">
      {label}
    </span>
    {children}
  </label>
);

const baseInputClass =
  "h-12 w-full rounded-xl border border-subtle bg-surface-layer px-4 text-sm text-text-primary outline-none transition focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 placeholder:text-text-muted";

const OTP_LENGTH = 6;

const OtpInput = ({
  value,
  onChange,
  onComplete,
  disabled,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  label: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label={label}
        value={value}
        onChange={(event) => {
          const next = event.target.value
            .replace(/\D/g, "")
            .slice(0, OTP_LENGTH);
          onChange(next);
          if (next.length === OTP_LENGTH && value.length < OTP_LENGTH) {
            onComplete?.(next);
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        autoFocus
      />
      <div className="flex justify-center gap-2 sm:gap-2.5" aria-hidden="true">
        {Array.from({ length: OTP_LENGTH }).map((_, index) => {
          const isActive = focused && index === activeIndex && !disabled;
          return (
            <div
              key={index}
              className={`flex h-14 w-full max-w-[52px] items-center justify-center rounded-xl border bg-surface-layer text-xl font-semibold text-text-primary transition ${
                isActive
                  ? "border-brand ring-2 ring-brand/40"
                  : value[index]
                    ? "border-strong"
                    : "border-subtle"
              }`}
            >
              {value[index] ?? (
                <span
                  className={`h-5 w-px ${isActive ? "animate-pulse bg-brand" : "bg-transparent"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const describeFactors = (factors: { strategy: string }[] | null | undefined) =>
  factors?.map((factor) => factor.strategy.replace(/_/g, " ")).join(", ") ||
  "none returned";

const getEmailCodeFactor = (
  factors:
    | { strategy: string; emailAddressId?: string; safeIdentifier?: string }[]
    | null
    | undefined,
) =>
  factors?.find(
    (factor) => factor.strategy === "email_code" && factor.emailAddressId,
  );

const getSecondFactor = (
  factors:
    | {
        strategy: string;
        emailAddressId?: string;
        phoneNumberId?: string;
        safeIdentifier?: string;
      }[]
    | null
    | undefined,
) =>
  factors?.find((factor) => factor.strategy === "email_code") ||
  factors?.find((factor) => factor.strategy === "phone_code") ||
  factors?.find((factor) => factor.strategy === "totp") ||
  factors?.find((factor) => factor.strategy === "backup_code");

const isExistingAccountError = (err: unknown) => {
  const message =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : JSON.stringify(err ?? "");
  return /already exists|already taken|identifier.*taken|form_identifier_exists|email_address_exists/i.test(
    message,
  );
};

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const { t } = useTranslation();
  const { signInWithGoogle } = useAuth();
  const { setActive } = useClerk();
  const { signIn: clerkSignIn } = useSignIn();
  const { signUp: clerkSignUp } = useSignUp();
  const location = useLocation();

  const [mode, setMode] = useState<AuthMode>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") === "true") return "sign-up";
    if (params.get("mode") === "sign-in") return "sign-in";
    return "sign-up";
  });
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [code, setCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [signInFailureCount, setSignInFailureCount] = useState(0);
  const [signInEmailCodeFactorId, setSignInEmailCodeFactorId] = useState("");
  const [secondFactorStrategy, setSecondFactorStrategy] =
    useState<SecondFactorStrategy>("");
  const [secondFactorId, setSecondFactorId] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const verifyFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(
      () => setResendCooldown((seconds) => seconds - 1),
      1000,
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (
      mode === "verify" ||
      mode === "verify-sign-in" ||
      mode === "verify-second-factor"
    ) {
      setResendCooldown(30);
    }
  }, [mode]);

  useEffect(() => {
    const from = (
      location.state as {
        from?: { pathname?: string; search?: string; hash?: string };
      } | null
    )?.from;

    // Honor an explicit ?redirect= query param as a fallback. This survives
    // Google OAuth handoffs (which drop in-memory location.state) and
    // lets developer-facing CTAs send sign-ups straight to /dashboard/developer.
    const redirectParam = new URLSearchParams(location.search).get("redirect");

    rememberPostAuthRedirect(
      from ?? (redirectParam ? { pathname: redirectParam } : null),
    );
  }, [location.state, location.search]);

  const parseError = (err: unknown): string => {
    if (!err) return t("common.error");
    if (typeof err === "string") return err;
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (Array.isArray(e.errors) && e.errors.length > 0) {
      const first = e.errors[0] as { message?: string; longMessage?: string };
      return first.message || first.longMessage || t("auth.errors.authenticationFailed");
    }
    if (e.status === 422) return t("auth.errors.invalidCredentials");
    if (e.status === 429) return t("auth.errors.tooManyAttempts");
    return t("auth.errors.failed");
  };

  const resetMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setCode("");
    setResetPassword("");
    setResetCodeSent(false);
    setSignInEmailCodeFactorId("");
    setSecondFactorStrategy("");
    setSecondFactorId("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShowResetPassword(false);
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setError("");
    setOauthLoading(provider);

    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = parseError(err);
      if (!msg.toLowerCase().includes("redirect")) setError(msg);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleEmailSignIn = async () => {
    if (!emailAddress.trim()) throw new Error(t("auth.errors.enterEmail"));
    if (!password.trim()) throw new Error(t("auth.errors.enterPassword"));

    if (!clerkSignIn)
      throw new Error(t("auth.errors.clerkLoading"));
    const result = await clerkSignIn.create({
      strategy: "password",
      identifier: emailAddress.trim(),
      password,
    });

    if (result.status === "needs_first_factor") {
      const emailCodeFactor = getEmailCodeFactor(result.supportedFirstFactors);
      if (emailCodeFactor?.emailAddressId) {
        await clerkSignIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setSignInEmailCodeFactorId(emailCodeFactor.emailAddressId);
        setCode("");
        setMode("verify-sign-in");
        return;
      }
    }

    const completedSignIn = result;

    if (completedSignIn.status === "needs_second_factor") {
      const factor = getSecondFactor(completedSignIn.supportedSecondFactors);
      if (!factor) {
        throw new Error(
          `Your account requires a second verification step. Available methods: ${describeFactors(completedSignIn.supportedSecondFactors)}.`,
        );
      }

      if (factor.strategy === "email_code") {
        await clerkSignIn.prepareSecondFactor({
          strategy: "email_code",
          emailAddressId: factor.emailAddressId,
        });
        setSecondFactorId(factor.emailAddressId || "");
      } else if (factor.strategy === "phone_code") {
        await clerkSignIn.prepareSecondFactor({
          strategy: "phone_code",
          phoneNumberId: factor.phoneNumberId,
        });
        setSecondFactorId(factor.phoneNumberId || "");
      } else {
        setSecondFactorId("");
      }

      setSecondFactorStrategy(factor.strategy as SecondFactorStrategy);
      setCode("");
      setMode("verify-second-factor");
      return;
    }

    if (
      completedSignIn.status !== "complete" ||
      !completedSignIn.createdSessionId
    ) {
      if (completedSignIn.status === "needs_new_password") {
        throw new Error(
          "This account needs a new password before signing in. Use “Forgot password?” to reset it.",
        );
      }

      if (completedSignIn.status === "needs_identifier") {
        throw new Error(
          "Please enter your email address or username to sign in.",
        );
      }

      if (completedSignIn.status === "needs_first_factor") {
        throw new Error(
          `We need one more sign-in step. Available methods: ${describeFactors(completedSignIn.supportedFirstFactors)}.`,
        );
      }

      throw new Error(
        `We couldn't finish signing you in (status: ${completedSignIn.status ?? "unknown"}). Please try again.`,
      );
    }

    await setActive({ session: completedSignIn.createdSessionId });
    setSignInFailureCount(0);
    onAuthSuccess({ email: emailAddress.trim() });
  };

  const handleVerifySecondFactor = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError("");

    if (!code.trim()) {
      setError(t("auth.errors.enterCode"));
      return;
    }

    if (!clerkSignIn) {
      setError(t("auth.errors.clerkLoading"));
      return;
    }

    setLoading(true);
    try {
      const attempt = await clerkSignIn.attemptSecondFactor({
        strategy: secondFactorStrategy || "totp",
        code: code.trim(),
      });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        setSignInFailureCount(0);
        onAuthSuccess({ email: emailAddress.trim() });
        return;
      }

      setError(
        `We couldn't finish signing you in (status: ${attempt.status ?? "unknown"}). Please try again.`,
      );
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignInEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (code.length < 6) {
      setError(t("auth.errors.enter6DigitCode"));
      return;
    }

    if (!clerkSignIn) {
      setError(t("auth.errors.clerkLoading"));
      return;
    }

    setLoading(true);
    try {
      const attempt = await clerkSignIn.attemptFirstFactor({
        strategy: "email_code",
        code,
      });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        setSignInFailureCount(0);
        onAuthSuccess({ email: emailAddress.trim() });
        return;
      }

      if (attempt.status === "needs_second_factor") {
        const factor = getSecondFactor(attempt.supportedSecondFactors);
        if (!factor) {
          setError(
            `Your account requires a second verification step. Available methods: ${describeFactors(attempt.supportedSecondFactors)}.`,
          );
          return;
        }

        if (factor.strategy === "email_code") {
          await clerkSignIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: factor.emailAddressId,
          });
          setSecondFactorId(factor.emailAddressId || "");
        } else if (factor.strategy === "phone_code") {
          await clerkSignIn.prepareSecondFactor({
            strategy: "phone_code",
            phoneNumberId: factor.phoneNumberId,
          });
          setSecondFactorId(factor.phoneNumberId || "");
        } else {
          setSecondFactorId("");
        }

        setSecondFactorStrategy(factor.strategy as SecondFactorStrategy);
        setCode("");
        setMode("verify-second-factor");
        return;
      }

      setError(
        `We couldn't finish signing you in (status: ${attempt.status ?? "unknown"}). Please try again.`,
      );
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) throw new Error(t("auth.errors.enterName"));
    if (!emailAddress.trim()) throw new Error(t("auth.errors.enterEmail"));
    if (password.length < 8)
      throw new Error(t("auth.errors.passwordTooShort"));
    if (password !== confirmPassword) throw new Error(t("auth.errors.passwordsDontMatch"));
    if (!acceptTerms)
      throw new Error(t("auth.errors.acceptTerms"));

    if (!clerkSignUp)
      throw new Error(t("auth.errors.clerkLoading"));

    const result = await clerkSignUp.create({
      emailAddress: emailAddress.trim(),
      password,
      firstName: trimmedName.split(" ")[0],
      lastName: trimmedName.split(" ").slice(1).join(" ") || "",
    });

    if (result.status === "complete") {
      if (result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      }
      onAuthSuccess({
        id: result.createdUserId,
        email: emailAddress,
        name: fullName,
      });
      return;
    }

    await clerkSignUp.prepareEmailAddressVerification({
      strategy: "email_code",
    });
    setMode("verify");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "sign-in") await handleEmailSignIn();
      if (mode === "sign-up") await handleEmailSignUp();
    } catch (err: unknown) {
      if (mode === "sign-in") {
        setSignInFailureCount((count) => count + 1);
      }
      if (mode === "sign-up" && isExistingAccountError(err)) {
        setMode("sign-in");
        setError(t("auth.errors.accountExists"));
        return;
      }
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSendPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!emailAddress.trim()) {
      setError(t("auth.errors.enterEmailFirst"));
      emailRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      if (!clerkSignIn)
        throw new Error(t("auth.errors.clerkLoading"));
      await clerkSignIn.create({
        strategy: "reset_password_email_code",
        identifier: emailAddress.trim(),
      });
      setResetCodeSent(true);
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCompletePasswordReset = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setError("");

    if (code.length < 6) {
      setError(t("auth.errors.enterResetCode"));
      return;
    }

    if (resetPassword.length < 8) {
      setError(t("auth.errors.passwordTooShort"));
      return;
    }

    setLoading(true);
    try {
      if (!clerkSignIn)
        throw new Error(t("auth.errors.clerkLoading"));
      const attempt = await clerkSignIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: resetPassword,
      });

      if (attempt.status === "complete") {
        if (attempt.createdSessionId) {
          await setActive({ session: attempt.createdSessionId });
        }
        setSignInFailureCount(0);
        onAuthSuccess({ email: emailAddress });
      } else {
        setError(t("auth.errors.resetIncomplete"));
      }
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (code.length < 6) {
      setError(t("auth.errors.enter6DigitCode"));
      return;
    }

    setLoading(true);
    try {
      if (!clerkSignUp)
        throw new Error(t("auth.errors.clerkLoading"));
      const attempt = await clerkSignUp.attemptEmailAddressVerification({
        code,
      });
      if (attempt.status === "complete") {
        if (attempt.createdSessionId) {
          await setActive({ session: attempt.createdSessionId });
        }
        onAuthSuccess({
          id: attempt.createdUserId,
          email: emailAddress,
          name: fullName,
        });
      } else {
        setError(t("auth.errors.verifyIncomplete"));
      }
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "verify-sign-in") {
        if (!clerkSignIn)
          throw new Error(t("auth.errors.clerkLoading"));
        const emailCodeFactor = signInEmailCodeFactorId
          ? { emailAddressId: signInEmailCodeFactorId }
          : getEmailCodeFactor(clerkSignIn.supportedFirstFactors);
        if (!emailCodeFactor?.emailAddressId)
          throw new Error(
            "No email verification method is available for this sign-in.",
          );
        await clerkSignIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setResendCooldown(30);
        return;
      }

      if (mode === "verify-second-factor") {
        if (!clerkSignIn)
          throw new Error(t("auth.errors.clerkLoading"));
        if (secondFactorStrategy === "email_code") {
          await clerkSignIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: secondFactorId || undefined,
          });
          setResendCooldown(30);
          return;
        }
        if (secondFactorStrategy === "phone_code") {
          await clerkSignIn.prepareSecondFactor({
            strategy: "phone_code",
            phoneNumberId: secondFactorId || undefined,
          });
          setResendCooldown(30);
          return;
        }
        throw new Error(
          "This second-factor method does not support resending a code.",
        );
      }

      if (!clerkSignUp)
        throw new Error(t("auth.errors.clerkLoading"));
      await clerkSignUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });
      setResendCooldown(30);
    } catch (err: unknown) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const target = mode === "sign-up" ? nameRef.current : emailRef.current;
    target?.focus();
  }, [mode]);

  const title =
    mode === "sign-in"
      ? t("auth.titles.welcomeBack")
      : mode === "verify" || mode === "verify-sign-in"
        ? t("auth.titles.checkEmail")
        : mode === "verify-second-factor"
          ? t("auth.titles.oneMoreStep")
          : mode === "reset-password"
            ? t("auth.titles.resetPassword")
            : t("auth.titles.createAccount");
  const subtitle =
    mode === "verify" || mode === "verify-sign-in"
      ? t("auth.subtitles.verifyEmail", { email: emailAddress })
      : mode === "verify-second-factor"
        ? secondFactorStrategy === "totp"
          ? t("auth.subtitles.secondFactorTotp")
          : secondFactorStrategy === "backup_code"
            ? t("auth.subtitles.secondFactorBackup")
            : secondFactorStrategy === "email_code" && emailAddress
              ? t("auth.subtitles.secondFactorEmail", { email: emailAddress })
              : t("auth.subtitles.secondFactorCode")
        : mode === "reset-password"
          ? resetCodeSent
            ? t("auth.subtitles.resetSent", { email: emailAddress })
            : t("auth.subtitles.resetPrompt")
          : mode === "sign-in"
            ? t("auth.subtitles.signIn")
            : t("auth.subtitles.signUp");

  return (
    <div className="relative min-h-[100dvh] w-full bg-surface-body text-text-primary lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── Left promo panel (desktop only) ───────────────────────── */}
      <aside className="relative hidden overflow-hidden lg:block">
        {/* soft gradient field */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#cbb8ff] via-[#8ea8ff] to-[#7fd2f5]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.55),transparent_46%),radial-gradient(circle_at_88%_78%,rgba(255,196,238,0.55),transparent_46%)]" />
        {/* faint grid */}
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:48px_48px]" />
        {/* decorative arcs */}
        <div className="absolute -right-24 top-8 h-[440px] w-[440px] rounded-full border border-white/25" />
        <div className="absolute -right-8 top-44 h-[320px] w-[320px] rounded-full border border-white/20" />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center gap-2.5">
            <img
              src="/edutu-logo.png"
              alt="Edutu"
              className="h-9 w-9 rounded-xl bg-white/90 p-1.5"
            />
            <span className="text-lg font-semibold text-white">Edutu</span>
          </div>

          <div className="rounded-[28px] border border-white/25 bg-white/10 p-8 backdrop-blur-sm xl:p-10">
            <h2 className="font-display text-4xl font-semibold leading-[1.06] tracking-tight text-white xl:text-[52px]">
              <span className="mr-2 text-2xl align-middle">▶</span>Your gateway
              <br />to global
              <br />opportunities.
            </h2>
            <p className="mt-6 max-w-sm text-sm leading-6 text-white/85">
              Scholarships, fellowships, and programs — matched to you, and
              tracked right up to the deadline.
            </p>
          </div>

          <p className="text-xs text-white/75">
            Join 50,000+ learners discovering what&apos;s possible.
          </p>
        </div>
      </aside>

      {/* ── Right form panel ──────────────────────────────────────── */}
      <div className="flex min-h-[100dvh] items-center justify-center px-6 py-12 sm:px-10 lg:px-12">
      <section className="w-full text-text-primary">
        <section className="mx-auto flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mx-auto w-full max-w-md"
          >
            <aside className="hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(206,238,255,0.8),rgba(94,158,255,0.68)_27%,rgba(35,111,255,0)_50%)]" />
              <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:9px_9px]" />

              <div className="relative z-10 flex h-full flex-col justify-between p-8">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <img
                    src="/edutu-logo.png"
                    alt=""
                    className="h-7 w-7 rounded-lg bg-white/90 p-1 dark:bg-gray-900/90"
                  />
                  <span>Edutu</span>
                </div>

                <div className="relative mx-auto h-[360px] w-full max-w-[440px]">
                  <div className="absolute left-1/2 top-[54%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-sky-100 to-blue-400 shadow-2xl shadow-blue-950/30" />
                  <div className="absolute left-1/2 top-[54%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50 [background-image:linear-gradient(0deg,transparent_48%,rgba(255,255,255,0.5)_49%,rgba(255,255,255,0.5)_51%,transparent_52%),linear-gradient(90deg,transparent_48%,rgba(255,255,255,0.45)_49%,rgba(255,255,255,0.45)_51%,transparent_52%)] [background-size:100%_38px,38px_100%]" />
                  <div className="absolute left-[23%] top-[41%] h-px w-[110px] rotate-[24deg] bg-white/60" />
                  <div className="absolute right-[22%] top-[37%] h-px w-[112px] -rotate-[31deg] bg-white/60" />
                  <div className="absolute left-[33%] top-[22%] h-[92px] w-px -rotate-[10deg] bg-white/60" />
                  <div className="absolute right-[18%] top-[52%] h-px w-[78px] rotate-[8deg] bg-white/60" />
                  <AvatarNode className="left-[12%] top-[36%]" label="KA" />
                  <AvatarNode className="left-[35%] top-[9%]" label="AM" />
                  <AvatarNode className="right-[21%] top-[19%]" label="TO" />
                  <AvatarNode className="right-[5%] top-[45%]" label="LM" />
                </div>

                <div className="rounded-2xl bg-gradient-to-t from-blue-950/30 to-white/5 p-6 backdrop-blur-sm">
                  <p className="max-w-sm text-2xl font-semibold leading-tight">
                    "Edutu helped me find opportunities I would have missed on
                    my own."
                  </p>
                  <div className="mt-7 flex items-end justify-between">
                    <div>
                      <p className="font-semibold">Lulu Meyers</p>
                      <p className="mt-1 text-sm text-white/70">
                        Scholarship applicant
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-1 text-yellow-300"
                      aria-label="Five star rating"
                    >
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          size={17}
                          fill="currentColor"
                          strokeWidth={0}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80"
                    >
                      <ArrowLeft size={17} />
                    </button>
                    <button
                      type="button"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white/80"
                    >
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex items-center justify-center">
              <div className="w-full">
                <div className="mb-8">
                  <div className="mb-6 flex items-center gap-2.5">
                    <img
                      src="/edutu-logo.png"
                      alt="Edutu"
                      className="h-10 w-10 rounded-xl"
                    />
                    {mode === "verify" ||
                    mode === "verify-sign-in" ||
                    mode === "verify-second-factor" ||
                    mode === "reset-password" ? (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10">
                        <ShieldCheck className="text-brand" size={17} />
                      </span>
                    ) : null}
                  </div>
                  <h1 className="text-[26px] font-display font-semibold tracking-tight text-text-primary">
                    {title}
                  </h1>
                  <p className="mt-2 text-sm leading-5 text-text-secondary">
                    {subtitle}
                  </p>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-center text-sm text-danger"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {mode === "verify" ||
                mode === "verify-sign-in" ||
                mode === "verify-second-factor" ? (
                  <form
                    ref={verifyFormRef}
                    onSubmit={
                      mode === "verify-second-factor"
                        ? handleVerifySecondFactor
                        : mode === "verify-sign-in"
                          ? handleVerifySignInEmail
                          : handleVerifyEmail
                    }
                    className="space-y-5"
                  >
                    {mode === "verify-second-factor" &&
                    secondFactorStrategy === "backup_code" ? (
                      <FieldShell label={t("auth.fields.verificationCode")}>
                        <input
                          type="text"
                          inputMode="text"
                          maxLength={32}
                          value={code}
                          onChange={(event) =>
                            setCode(event.target.value.trim().slice(0, 32))
                          }
                          className={`${baseInputClass} text-center text-lg`}
                          placeholder={t("auth.placeholders.backupCode")}
                          autoFocus
                        />
                      </FieldShell>
                    ) : (
                      <OtpInput
                        value={code}
                        onChange={setCode}
                        onComplete={() => {
                          if (!loading) verifyFormRef.current?.requestSubmit();
                        }}
                        disabled={loading}
                        label={t("auth.fields.verificationCode")}
                      />
                    )}
                    <button
                      type="submit"
                      disabled={loading || code.length < 6}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand/40 disabled:shadow-none"
                    >
                      {loading ? (
                        <Loader2 size={17} className="animate-spin" />
                      ) : (
                        <Check size={17} />
                      )}
                      {loading
                        ? t("auth.buttons.verifying")
                        : mode === "verify-second-factor" ||
                            mode === "verify-sign-in"
                          ? t("auth.buttons.verifyAndSignIn")
                          : t("auth.buttons.verifyEmail")}
                    </button>
                    {(mode !== "verify-second-factor" ||
                      secondFactorStrategy === "email_code" ||
                      secondFactorStrategy === "phone_code") && (
                      <button
                        type="button"
                        onClick={handleResendCode}
                        disabled={loading || resendCooldown > 0}
                        className="w-full text-center text-sm font-medium text-brand disabled:text-text-muted"
                      >
                        {resendCooldown > 0
                          ? t("auth.buttons.resendCodeIn", {
                              seconds: resendCooldown,
                            })
                          : t("auth.buttons.resendCode")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => resetMode("sign-in")}
                      className="mx-auto flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-text-secondary transition hover:text-text-primary"
                    >
                      <ArrowLeft size={15} />
                      {t("auth.buttons.backToSignIn")}
                    </button>
                  </form>
                ) : mode === "reset-password" ? (
                  <form
                    onSubmit={
                      resetCodeSent
                        ? handleCompletePasswordReset
                        : handleSendPasswordReset
                    }
                    className="space-y-4"
                  >
                    <FieldShell label="Email">
                      <div className="relative">
                        <Mail
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
                  size={17}
                />
                <input
                  ref={emailRef}
                  type="email"
                  value={emailAddress}
                  onChange={(event) =>
                    setEmailAddress(event.target.value)
                  }
                  className={`${baseInputClass} pl-11`}
                  placeholder="e.g. ahmed@edutu.org"
                  autoComplete="email"
                  disabled={resetCodeSent}
                />
                      </div>
                    </FieldShell>

                    {resetCodeSent && (
                      <>
                        <FieldShell label="Reset code">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={code}
                            onChange={(event) =>
                              setCode(
                                event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 6),
                              )
                            }
                            className={`${baseInputClass} text-center text-lg`}
                            placeholder="000000"
                            autoFocus
                          />
                        </FieldShell>

                        <FieldShell label="New password">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
                              <LockKeyhole size={15} strokeWidth={1.9} />
                            </span>
                            <input
                              type={showResetPassword ? "text" : "password"}
                              value={resetPassword}
                              onChange={(event) =>
                                setResetPassword(event.target.value)
                              }
                              className={`${baseInputClass} pl-12 pr-11`}
                              placeholder="Create a new password"
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowResetPassword((value) => !value)
                              }
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted transition hover:text-text-secondary"
                              aria-label={
                                showResetPassword
                                  ? "Hide new password"
                                  : "Show new password"
                              }
                            >
                              {showResetPassword ? (
                                <EyeOff size={17} />
                              ) : (
                                <Eye size={17} />
                              )}
                            </button>
                          </div>
                        </FieldShell>
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={
                        loading ||
                        (resetCodeSent &&
                          (code.length < 6 || resetPassword.length < 8))
                      }
                      className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand/40 disabled:shadow-none"
                    >
                      {loading ? (
                        <Loader2 size={17} className="animate-spin" />
                      ) : (
                        <ArrowRight size={17} />
                      )}
                      {loading
                        ? "Please wait..."
                        : resetCodeSent
                          ? "Reset password"
                          : "Send reset code"}
                    </button>

                    <button
                      type="button"
                      onClick={() => resetMode("sign-in")}
                      className="w-full text-center text-sm font-medium text-brand hover:text-brand-700"
                    >
                      Back to sign in
                    </button>
                  </form>
                ) : (
                  <>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {mode === "sign-up" && (
                        <FieldShell label="Name">
                          <div className="relative">
                            <User
                              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
                              size={17}
                            />
                            <input
                              ref={nameRef}
                              type="text"
                              value={fullName}
                              onChange={(event) =>
                                setFullName(event.target.value)
                              }
                              className={`${baseInputClass} pl-11`}
                              placeholder="e.g. Amina Bello"
                              autoComplete="name"
                            />
                          </div>
                        </FieldShell>
                      )}

                      <FieldShell label="Email">
                        <div className="relative">
                          <Mail
                            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
                            size={17}
                          />
                          <input
                            ref={emailRef}
                            type="email"
                            value={emailAddress}
                            onChange={(event) =>
                              setEmailAddress(event.target.value)
                            }
                            className={`${baseInputClass} pl-11`}
                            placeholder="e.g. ahmed@edutu.org"
                            autoComplete="email"
                          />
                        </div>
                      </FieldShell>

                      <FieldShell label="Password">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
                            <LockKeyhole size={15} strokeWidth={1.9} />
                          </span>
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) =>
                              setPassword(event.target.value)
                            }
                            className={`${baseInputClass} pl-12 pr-11`}
                            placeholder="Enter your password"
                            autoComplete={
                              mode === "sign-in"
                                ? "current-password"
                                : "new-password"
                            }
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted transition hover:text-text-secondary"
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            {showPassword ? (
                              <EyeOff size={17} />
                            ) : (
                              <Eye size={17} />
                            )}
                          </button>
                        </div>
                      </FieldShell>

                      {mode === "sign-in" && (
                        <div className="-mt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => resetMode("reset-password")}
                            className="text-xs font-semibold text-brand transition hover:text-brand-700"
                          >
                            Forgot password?
                          </button>
                        </div>
                      )}

                      {mode === "sign-in" && signInFailureCount >= 1 && (
                        <div className="-mt-1 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3">
                          <p className="text-xs font-medium leading-5 text-text-secondary">
                            Password not working? Send a recovery code to reset
                            it.
                          </p>
                          <button
                            type="button"
                            onClick={() => resetMode("reset-password")}
                            className="mt-2 text-xs font-bold text-brand hover:text-brand-700"
                          >
                            Recover password
                          </button>
                        </div>
                      )}

                      {mode === "sign-up" && (
                        <>
                          <FieldShell label="Confirm password">
                            <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
                              <LockKeyhole size={15} strokeWidth={1.9} />
                            </span>
                            <input
                              type={showConfirmPassword ? "text" : "password"}
                              value={confirmPassword}
                              onChange={(event) =>
                                setConfirmPassword(event.target.value)
                              }
                              className={`${baseInputClass} pl-12 pr-11`}
                              placeholder="Repeat your password"
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowConfirmPassword((value) => !value)
                              }
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted transition hover:text-text-secondary"
                                aria-label={
                                  showConfirmPassword
                                    ? "Hide confirm password"
                                    : "Show confirm password"
                                }
                              >
                                {showConfirmPassword ? (
                                  <EyeOff size={17} />
                                ) : (
                                  <Eye size={17} />
                                )}
                              </button>
                            </div>
                          </FieldShell>

                          <label className="flex items-start gap-2 text-xs text-text-secondary">
                            <input
                              type="checkbox"
                              checked={acceptTerms}
                              onChange={(event) =>
                                setAcceptTerms(event.target.checked)
                              }
                              className="mt-0.5 h-4 w-4 rounded border-subtle accent-brand focus-visible:ring-2 focus-visible:ring-brand/40"
                            />
                            <span>
                              I agree to Edutu's{" "}
                              <Link
                                to="/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-brand underline-offset-2 hover:underline"
                              >
                                terms
                              </Link>{" "}
                              and{" "}
                              <Link
                                to="/privacy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-brand underline-offset-2 hover:underline"
                              >
                                privacy policy
                              </Link>
                              .
                            </span>
                          </label>

                          {/* Clerk injects its smart CAPTCHA here only when a
                              challenge is required — keep the mount invisible
                              while empty so it doesn't render a blank box. */}
                          <div id="clerk-captcha" className="empty:hidden" />
                        </>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand/40"
                      >
                        {loading ? (
                          <Loader2 size={17} className="animate-spin" />
                        ) : (
                          <ArrowRight size={17} />
                        )}
                        {loading
                          ? mode === "sign-in"
                            ? "Signing in..."
                            : "Creating account..."
                          : mode === "sign-in"
                            ? "Sign in"
                            : "Create an account"}
                      </button>
                    </form>

                    <p className="mt-5 text-center text-sm text-text-secondary">
                      {mode === "sign-in"
                        ? "Don't have an account? "
                        : "Already have an account? "}
                      <button
                        type="button"
                        onClick={() =>
                          resetMode(mode === "sign-in" ? "sign-up" : "sign-in")
                        }
                        className="font-semibold text-brand hover:text-brand-700"
                      >
                        {mode === "sign-in" ? "Sign up" : "Log in"}
                      </button>
                    </p>

                    <div className="my-6 flex items-center gap-4">
                      <div className="h-px flex-1 bg-surface-elevated" />
                      <span className="text-xs text-text-muted">OR</span>
                      <div className="h-px flex-1 bg-surface-elevated" />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOAuth("google")}
                      disabled={oauthLoading !== null}
                      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-subtle bg-white text-sm font-semibold text-text-secondary transition hover:border-strong hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900"
                    >
                      {oauthLoading === "google" ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <GoogleIcon />
                      )}
                      Continue with Google
                    </button>
                  </>
                )}

                <p className="mt-8 text-center text-xs leading-5 text-text-muted">
                  By continuing, you agree to Edutu's{" "}
                  <Link
                    to="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Terms
                  </Link>{" "}
                  &{" "}
                  <Link
                    to="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </div>
          </motion.div>
        </section>
      </section>
      </div>
    </div>
  );
};

export default AuthScreen;
