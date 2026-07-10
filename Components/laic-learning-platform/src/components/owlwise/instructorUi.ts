import { owlwise } from "../../constants/owlwiseTheme";

/** Shared Owlwise instructor UI tokens */
export const ow = {
  bg: owlwise.bg,
  burgundy: owlwise.burgundy,
  heading: owlwise.heading,
  card: "bg-white rounded-2xl border border-[#e8ddd6] shadow-sm",
  input:
    "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-[#602424] focus:ring-2 focus:ring-[#602424]/10 transition-all",
  textarea:
    "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#602424] focus:ring-2 focus:ring-[#602424]/10 resize-none",
  btn:
    "px-5 py-2.5 rounded-xl text-sm font-semibold text-white active:scale-[0.98] transition-transform disabled:opacity-50",
  btnStyle: { backgroundColor: owlwise.burgundy } as const,
  tabActive: "bg-[#602424] text-white",
  tabIdle: "text-gray-500 hover:bg-gray-50",
  label: "text-[11px] font-bold uppercase tracking-widest text-gray-400",
};
