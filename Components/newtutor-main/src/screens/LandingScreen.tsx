import type { Screen, Role } from "../types";
import { Shell, OwlAnim, OwlwisePrimaryButton } from "../components/owlwise/primitives";
import { owlwise } from "../constants/owlwiseTheme";

export function LandingScreen({
  setScreen,
  setLoginIntent,
}: {
  setScreen: (s: Screen) => void;
  setLoginIntent: (role: Role) => void;
}) {
  const enter = (role: Role) => {
    setLoginIntent(role);
    setScreen("login");
  };

  return (
    <Shell className="bg-[#fdf8f5]">
      <div className="flex flex-col items-center justify-center min-h-screen px-8 gap-0">
        <div className="flex flex-col items-center gap-6 mb-16">
          <OwlAnim className="w-32 h-32 object-contain" />
          <div className="text-center">
            <h1 className="text-[34px] font-bold text-[#2c0312] tracking-tight leading-none">Owlwise</h1>
            <p className="text-[15px] text-gray-500 mt-2 font-normal">Learn at your pace, your way.</p>
          </div>
        </div>
        <div className="w-full flex flex-col gap-3">
          <OwlwisePrimaryButton onClick={() => enter("student")}>Start Learning</OwlwisePrimaryButton>
          <button
            type="button"
            onClick={() => enter("instructor")}
            className="w-full py-4 rounded-2xl border border-gray-200 bg-white text-[16px] font-semibold tracking-tight active:scale-[0.98] transition-transform"
            style={{ color: owlwise.burgundy }}
          >
            Educator
          </button>
        </div>
        <p className="text-[12px] text-gray-400 mt-6 text-center leading-relaxed">
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </Shell>
  );
}
