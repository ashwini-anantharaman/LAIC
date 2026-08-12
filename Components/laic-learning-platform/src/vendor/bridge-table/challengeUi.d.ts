import type { CSSProperties, ReactNode } from "react";
export declare const ACCENT = "#0d707c";
export declare const ACCENT_SOFT = "#eff7f6";
export declare const INK = "#17211d";
export declare const INK_MUTED = "#5c6b64";
export declare const INK_FAINT = "#8b9a93";
export declare const LINE = "#e4ebe7";
export declare const SURFACE = "#ffffff";
export declare const PAPER = "#f7faf8";
export declare const WARN = "#8a6d1f";
export declare const WARN_BG = "#fdf6e3";
export declare const BAD = "#c0392b";
export declare const BAD_BG = "#fdeeec";
export declare const UI_FONT = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** The shell every challenge surface in this package sits in. */
export declare const SHELL: CSSProperties;
export declare function Label({ children, style, }: Readonly<{
    children: ReactNode;
    style?: CSSProperties;
}>): import("react").JSX.Element;
export declare function Note({ children }: Readonly<{
    children: ReactNode;
}>): import("react").JSX.Element;
export declare function Warn({ children }: Readonly<{
    children: ReactNode;
}>): import("react").JSX.Element;
export declare function ErrorLine({ children }: Readonly<{
    children: ReactNode;
}>): import("react").JSX.Element;
/** A numbered wizard section. */
export declare function Section({ num, title, aside, children, innerRef, }: Readonly<{
    num: string;
    title: string;
    aside?: string;
    children: ReactNode;
    innerRef?: (el: HTMLElement | null) => void;
}>): import("react").JSX.Element;
/** A segmented choice: one row of equal buttons, the picked one filled. */
export declare function Segmented<T extends string>({ options, value, onChange, ariaLabel, }: Readonly<{
    options: readonly {
        key: T;
        label: string;
    }[];
    value: T;
    onChange: (next: T) => void;
    ariaLabel?: string;
}>): import("react").JSX.Element;
/** The primary action. */
export declare function PrimaryButton({ children, onClick, disabled, style, }: Readonly<{
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    style?: CSSProperties;
}>): import("react").JSX.Element;
/** A small pill button — the chips inside a board card. */
export declare function Chip({ children, onClick, title, ariaLabel, tone, disabled, }: Readonly<{
    children: ReactNode;
    onClick?: () => void;
    title?: string;
    ariaLabel?: string;
    tone?: "plain" | "accent" | "alarm";
    disabled?: boolean;
}>): import("react").JSX.Element;
/** One key/value line in the review list. */
export declare function ReviewLine({ k, v, last, }: Readonly<{
    k: string;
    v: string;
    last?: boolean;
}>): import("react").JSX.Element;
export declare const inputStyle: CSSProperties;
