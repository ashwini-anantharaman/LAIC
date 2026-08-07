import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  /** Defaults to “Are you sure you want to delete?” */
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling (red confirm). Default true. */
  destructive?: boolean;
  /** Value resolved when the backdrop is dismissed. Default false. */
  dismissValue?: boolean;
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based confirm for destructive actions platform-wide.
 * @example
 * const confirm = useConfirm();
 * if (!(await confirm({ description: `Delete “${name}”?` }))) return;
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    // Fallback when used outside provider (tests / early render).
    return async (options) =>
      window.confirm(options?.description || options?.title || 'Are you sure you want to delete?');
  }
  return fn;
}

interface Pending {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((options = {}) => {
    return new Promise<boolean>((resolve) => {
      const next = { options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const close = useCallback((value: boolean) => {
    const cur = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    cur?.resolve(value);
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const opts = pending?.options;
  const destructive = opts?.destructive !== false;
  const dismissValue = opts?.dismissValue ?? false;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}
          role="presentation"
          onClick={() => close(dismissValue)}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-sm rounded-[28px] overflow-hidden"
            style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    background: destructive ? 'rgba(220,38,38,0.1)' : 'rgba(11,18,32,0.06)',
                    color: destructive ? '#DC2626' : '#0B1220',
                  }}
                >
                  <AlertTriangle size={18} />
                </div>
                <div className="min-w-0">
                  <h3 id="confirm-dialog-title" style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>
                    {opts?.title || 'Are you sure you want to delete?'}
                  </h3>
                  {opts?.description && (
                    <p id="confirm-dialog-desc" style={{ fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 1.45 }}>
                      {opts.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4">
              <button
                type="button"
                onClick={() => close(false)}
                className="flex-1 py-2.5 rounded-full"
                style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}
              >
                {opts?.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                autoFocus
                className="flex-1 py-2.5 rounded-full text-white"
                style={{
                  background: destructive ? '#DC2626' : '#0B0F1A',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {opts?.confirmLabel || 'Delete'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
