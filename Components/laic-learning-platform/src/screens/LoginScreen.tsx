import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Shell, StatusBar, OwlAnim, OwlwisePrimaryButton } from "../components/owlwise/primitives";
import { owlwise } from "../constants/owlwiseTheme";

export function LoginScreen() {
  const { login, register, loginIntent, setScreen } = useApp();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const roleLabel = loginIntent === "student" ? "Student" : "Educator";

  const handleSubmit = async () => {
    setError("");
    setBusy(true);
    try {
      if (tab === "register") {
        await register(email, password, loginIntent);
      } else {
        await login(email, password, loginIntent);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell className="bg-[#fdf8f5]">
      <StatusBar />
      <div className="flex flex-col min-h-[calc(100svh-44px)] px-6 pt-4">
        <button
          type="button"
          onClick={() => setScreen("landing")}
          className="w-8 h-8 flex items-center justify-center -ml-1 mb-6"
        >
          <ChevronLeft size={22} className="text-gray-600" />
        </button>

        <div className="flex flex-col items-start gap-1 mb-8">
          <OwlAnim className="w-14 h-14 object-contain mb-3" />
          <h2 className="text-[28px] font-bold text-[#2c0312] tracking-tight leading-tight">
            {loginIntent === "student" ? "Welcome back" : "Educator sign in"}
          </h2>
          <p className="text-[14px] text-gray-500">
            {loginIntent === "student"
              ? "Sign in to continue learning"
              : "Sign in to create and manage courses"}
          </p>
        </div>

        <div className="flex gap-4 mb-6">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`text-[14px] font-semibold pb-1 border-b-2 transition-colors ${
                tab === t ? "border-[#602424] text-[#602424]" : "border-transparent text-gray-400"
              }`}
            >
              {t === "login" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424] focus:ring-2 focus:ring-[#602424]/10 transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424] focus:ring-2 focus:ring-[#602424]/10 transition-all"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <OwlwisePrimaryButton
            onClick={handleSubmit}
            disabled={busy || !email || !password}
            className="mt-2"
          >
            {busy ? "Please wait…" : tab === "login" ? `Continue as ${roleLabel}` : `Register as ${roleLabel}`}
          </OwlwisePrimaryButton>

          <p className="text-center text-[14px] text-gray-500">
            {tab === "login" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setTab(tab === "login" ? "register" : "login")}
              className="font-medium"
              style={{ color: owlwise.burgundy }}
            >
              {tab === "login" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </Shell>
  );
}
