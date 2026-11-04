"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, TextInput } from "@/components/ui/Field";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { errorMessage } from "@/lib/errors";
import { LoginTicket } from "./LoginTicket";
import { homeFor, useViewer } from "./useViewer";

export function LoginScreen() {
  const state = useViewer();
  const router = useRouter();
  const [showTeacherSignIn, setShowTeacherSignIn] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.removeAttribute("data-theme");
    return () => {
      let saved = previous;
      try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch {}
      if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
      else root.removeAttribute("data-theme");
    };
  }, []);

  useEffect(() => {
    if (showTeacherSignIn) {
      document.getElementById("teacher-sign-in")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      document.getElementById("admin-username")?.focus({ preventScroll: true });
    }
  }, [showTeacherSignIn]);

  useEffect(() => {
    if (state.status === "signedIn") router.replace(homeFor(state.viewer.role));
  }, [state, router]);

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <header className="flex h-[68px] flex-none items-center gap-3 px-4 sm:px-6 lg:px-24">
        <span className="text-[22px] font-extrabold tracking-[-.03em] text-ink">CodeCS</span>
        <Button type="button" variant="secondary" onClick={() => {
          setShowTeacherSignIn(true);
          document.getElementById("admin-username")?.focus();
        }} aria-expanded={showTeacherSignIn} aria-controls={showTeacherSignIn ? "teacher-sign-in" : undefined}>Admin sign in</Button>
        <span className="ml-auto font-mono text-[13px] font-medium text-ink3 max-sm:hidden">codecs.club</span>
      </header>
      <main className="grid flex-1 items-center gap-12 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-[72px] lg:px-24">
        <StudentSignIn />
        <aside className="flex flex-col gap-[18px] rounded-[26px] bg-mint-s p-8 max-sm:p-5">
          <h2 className="m-0 text-[26px] leading-[1.15] font-extrabold tracking-[-.025em]">
            Where’s my code?
          </h2>
          <p className="m-0 text-ink2">
            It’s printed on your CodeCS login ticket. It stays the same every year.
          </p>
          <LoginTicket name="Jordan Smith" loginCode="jsmith" example />
          <p className="m-0 text-sm text-ink2">Lost your ticket? Ask at the club and we’ll print a new one.</p>
        </aside>
      </main>
      {showTeacherSignIn && <AdminSignIn />}
    </div>
  );
}

function StudentSignIn() {
  const { signIn } = useAuthActions();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length === 0) {
      setError("Type the login code from your ticket.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn("student", { code: trimmed });
      if (!result.signingIn) {
        setError(`We don’t recognize “${trimmed}”. Check the spelling on your ticket.`);
      }
      // On success the viewer query resolves and the screen redirects.
    } catch (err) {
      setError(errorMessage(err, "We couldn’t sign you in. Check your connection and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-[600px] flex-col gap-[22px]">
      <h1 className="m-0 text-[clamp(52px,6.4vw,88px)] leading-[1.04] font-extrabold tracking-[-.035em]">
        Welcome
      </h1>
      <p className="m-0 text-[19px] leading-[1.55] text-pretty text-ink2">
        Type the login code from your ticket. It’s your first initial and last name, like{" "}
        <b className="font-mono text-lg font-semibold text-ink">jsmith</b>.
      </p>
      <div className="mt-1 flex flex-col gap-2">
        <label htmlFor="login-code" className="text-base font-bold">
          Login code
        </label>
        <TextInput
          id="login-code"
          name="code"
          mono
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (error) setError(null);
          }}
          invalid={error !== null}
          aria-describedby={error ? "login-code-error" : undefined}
          className="h-[68px] rounded-[14px] border-2 px-5 text-[30px] font-medium"
        />
        {error && <FieldError id="login-code-error">{error}</FieldError>}
      </div>
      <Button
        type="submit"
        variant="primary"
        size="xl"
        loading={submitting}
        loadingLabel="Signing in…"
        className="self-start"
      >
        Sign in →
      </Button>
    </form>
  );
}

function AdminSignIn() {
  const { signIn } = useAuthActions();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your admin username and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn("password", {
        flow: "signIn",
        email: username.trim(),
        password,
      });
      if (!result.signingIn) setError("That username and password don’t match.");
    } catch (err) {
      setError(errorMessage(err, "That username and password don’t match."));
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <footer id="teacher-sign-in" className="mx-6 mb-6 flex-none rounded-[20px] bg-sf px-6 pt-[18px] pb-5">
      <form
        onSubmit={onSubmit}
        noValidate
        aria-labelledby="admin-sign-in-title"
        className="flex flex-wrap items-end gap-3.5"
      >
        <div className="mr-auto self-center">
          <b id="admin-sign-in-title" className="font-bold">
            Admins
          </b>
          <div className="text-sm text-ink3">Sign in with your admin username and password.</div>
        </div>
        <div className="flex flex-col gap-[5px] max-sm:basis-full">
          <label htmlFor="admin-username" className="text-sm font-bold">
            Username
          </label>
          <TextInput
            id="admin-username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-[42px] w-[210px] max-sm:h-11 max-sm:w-full"
          />
        </div>
        <div className="flex flex-col gap-[5px] max-sm:basis-full">
          <label htmlFor="admin-password" className="text-sm font-bold">
            Password
          </label>
          <TextInput
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-[42px] w-[210px] max-sm:h-11 max-sm:w-full"
          />
        </div>
        <Button
          type="submit"
          variant="dark"
          size="lg"
          loading={submitting}
          loadingLabel="Signing in…"
          className="h-[42px] max-sm:h-11 max-sm:w-full"
        >
          Admin sign in
        </Button>
        {error && (
          <div className="basis-full">
            <FieldError id="admin-sign-in-error">{error}</FieldError>
          </div>
        )}
      </form>
    </footer>
  );
}
