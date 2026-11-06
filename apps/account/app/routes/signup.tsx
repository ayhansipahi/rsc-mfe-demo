import { redirect, redirectDocument } from "react-router";
import { confirmSignUp, resendCode, signInAfterSignUp, signUp } from "../cognito.server";
import { getUser, signInCookies } from "@rsc-mfe/shell/session.server";
import { buttonClass, inputClass } from "@rsc-mfe/shell/styles";

export function meta() {
  return [{ title: "Create account" }];
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

// Between the two steps the server keeps the email and Cognito's sign-up session in a short-lived
// HttpOnly cookie: not in the URL, and the page never sees the session.
interface Pending {
  email: string;
  session?: string;
}
const pendingCookie = (pending: Pending | null) =>
  pending
    ? `signup=${Buffer.from(JSON.stringify(pending)).toString("base64url")}; Path=/signup; HttpOnly; Secure; SameSite=Lax; Max-Age=900`
    : "signup=; Path=/signup; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

function readPending(request: Request): Pending | null {
  const raw = request.headers.get("cookie")?.match(/(?:^|;\s*)signup=([^;]+)/)?.[1];
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString());
  } catch {
    return null;
  }
}

// Cognito's error names, mapped to text here so the URL never carries text the page would echo.
const messages: Record<string, string> = {
  UsernameExistsException: "An account with this email already exists. Sign in instead.",
  InvalidPasswordException: "Use a password of at least 8 characters.",
  InvalidParameterException: "Check the email address and the password.",
  CodeMismatchException: "That code is not right. Check the email and try again.",
  ExpiredCodeException: "That code has expired. Send a new one.",
  LimitExceededException: "Too many attempts. Wait a few minutes and try again.",
  TooManyRequestsException: "Too many attempts. Wait a few minutes and try again.",
};

export async function loader({ request }: { request: Request }) {
  if (await getUser(request)) throw redirect("/account");
  const params = new URL(request.url).searchParams;
  const error = params.get("error");
  return {
    email: readPending(request)?.email ?? null,
    message: error ? (messages[error] ?? "Something went wrong. Try again.") : params.has("sent") ? "We sent a new code." : null,
  };
}

const errorName = (e: unknown) => (e instanceof Error ? e.name : "");
const back = (e: unknown) => {
  console.error("signup", e);
  return redirect(`/signup?error=${encodeURIComponent(errorName(e))}`);
};

export async function action({ request }: { request: Request }) {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "signup") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    try {
      const session = await signUp(email, String(form.get("password") ?? ""));
      return redirect("/signup", { headers: { "Set-Cookie": pendingCookie({ email, session }) } });
    } catch (e) {
      if (errorName(e) !== "UsernameExistsException") return back(e);
      // An earlier attempt that never got its code: send a fresh one and continue. Cognito refuses
      // for a confirmed account, which then gets the "sign in instead" message.
      try {
        await resendCode(email);
      } catch {
        return back(e);
      }
      return redirect("/signup?sent", { headers: { "Set-Cookie": pendingCookie({ email }) } });
    }
  }

  if (intent === "restart") return redirect("/signup", { headers: { "Set-Cookie": pendingCookie(null) } });

  const pending = readPending(request);
  if (!pending) return redirect("/signup");

  if (intent === "resend") {
    try {
      await resendCode(pending.email);
    } catch (e) {
      return back(e);
    }
    return redirect("/signup?sent");
  }

  let session: string | undefined;
  try {
    session = await confirmSignUp(pending.email, String(form.get("code") ?? "").trim(), pending.session);
  } catch (e) {
    return back(e);
  }
  // Confirmed. Without a usable session (a resumed attempt, or one past 15 minutes) the password
  // sign-in takes over; the account itself is fine either way.
  const token = session
    ? await signInAfterSignUp(pending.email, session).catch((e) => {
        console.error("sign-in after sign-up failed", e);
        return null;
      })
    : null;
  const headers = new Headers({ "Set-Cookie": pendingCookie(null) });
  if (!token) return redirect("/login?error=confirmed&next=/account", { headers });
  signInCookies(token, pending.email, headers);
  // A document load: every fragment on the account page reads the new session, and in the shell
  // the account fragment's session message flips the tab bar.
  return redirectDocument("/account", { headers });
}

const note = "text-sm text-neutral-600 dark:text-neutral-400";

export function ServerComponent({ loaderData }: { loaderData: { email: string | null; message: string | null } }) {
  const { email, message } = loaderData;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Create account</h1>
      {email ? (
        <div className="max-w-sm space-y-3">
          <p className={note}>We sent a 6-digit code to {email}.</p>
          <form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="confirm" />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Code</span>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required className={inputClass} />
            </label>
            <button type="submit" className={buttonClass}>
              Confirm
            </button>
          </form>
          <form method="post" className="flex gap-2">
            <button type="submit" name="intent" value="resend" className={buttonClass}>
              Send a new code
            </button>
            <button type="submit" name="intent" value="restart" className={buttonClass}>
              Use a different email
            </button>
          </form>
        </div>
      ) : (
        <form method="post" className="max-w-sm space-y-3">
          <input type="hidden" name="intent" value="signup" />
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Email</span>
            <input name="email" type="email" autoComplete="email" required className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Password</span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
          </label>
          <button type="submit" className={buttonClass}>
            Create account
          </button>
          <p className={note}>
            Already have an account?{" "}
            <a href="/login" className="underline">
              Sign in
            </a>
          </p>
        </form>
      )}
      {message && <p className={note}>{message}</p>}
    </div>
  );
}
