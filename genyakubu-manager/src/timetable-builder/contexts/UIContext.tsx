import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { UIContext } from './uiContextValue';
import type { ToastType } from './uiContextValue';
import type { ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmConfig {
  message: string;
  title?: string;
  danger?: boolean;
  confirmLabel?: string;
}

interface InputConfig {
  message: string;
  title?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}
import { useFocusTrap } from '../hooks/useFocusTrap';

// --- Toast ---
function ToastContainer({ toasts, removeToast }) {
  return (
    // z-[1020]: 設定モーダル (1000)・確認ダイアログ (1010) より上。色は builder の
    // トークン (警告の白字 on yellow-500 はコントラスト約 1.9:1 で読めなかった)
    <div className="fixed top-4 right-4 z-[1020] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm font-bold flex items-center gap-2 animate-slide-in
            ${t.type === 'error' ? 'bg-builder-red text-white' : t.type === 'warning' ? 'bg-builder-orange text-white' : 'bg-builder-green text-white'}`}
        >
          <span>{t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : '✅'}</span>
          <span className="whitespace-pre-line">{t.message}</span>
          <button onClick={() => removeToast(t.id)} aria-label="通知を閉じる" className="ml-2 opacity-70 hover:opacity-100">×</button>
        </div>
      ))}
    </div>
  );
}

// --- ConfirmModal ---
function ConfirmModalComponent({ config, onResult }) {
  const boxRef = useRef(null);
  const okRef = useRef(null);
  // trapStack に参加する (最上位の trap だけが Escape / Tab を処理)。
  // これが無いと ConfigModal の上で confirm を開いたとき、Escape が
  // 下の ConfigModal に届いて設定モーダルごと閉じてしまう。
  useFocusTrap(boxRef, { onClose: () => onResult(false), enabled: !!config, initialFocusRef: okRef });
  if (!config) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-[1010] flex justify-center items-center p-4" onClick={() => onResult(false)}>
      <div ref={boxRef} role="dialog" aria-modal="true" className="bg-builder-surface rounded-lg shadow-2xl max-w-md w-full animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="font-bold text-lg text-builder-ink mb-3">{config.title || '確認'}</h3>
          <p className="text-sm text-builder-ink-muted whitespace-pre-line">{config.message}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <button
            onClick={() => onResult(false)}
            className="px-4 py-2 text-sm text-builder-ink-muted bg-builder-bg rounded hover:bg-builder-border font-bold"
          >
            キャンセル
          </button>
          <button
            ref={okRef}
            onClick={() => onResult(true)}
            className={`px-4 py-2 text-sm text-white rounded font-bold ${config.danger ? 'bg-builder-red hover:bg-builder-red-hover' : 'bg-builder-blue hover:bg-builder-blue-hover'}`}
            autoFocus
          >
            {config.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- InputModal ---
function InputModalComponent({ config, onResult }) {
  const [value, setValue] = useState(config?.defaultValue || '');
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  // trapStack 参加 (ConfirmModalComponent と同じ理由)
  useFocusTrap(boxRef, { onClose: () => onResult(null), enabled: !!config, initialFocusRef: inputRef });

  useEffect(() => {
    if (config) {
      setValue(config.defaultValue || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [config]);

  if (!config) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) onResult(value.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[1010] flex justify-center items-center p-4" onClick={() => onResult(null)}>
      <div ref={boxRef} role="dialog" aria-modal="true" className="bg-builder-surface rounded-lg shadow-2xl max-w-md w-full animate-fade-in" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-5">
            <h3 className="font-bold text-lg text-builder-ink mb-3">{config.title || '入力'}</h3>
            {config.message && <p className="text-sm text-builder-ink-muted mb-3">{config.message}</p>}
            <input
              ref={inputRef}
              className="w-full border border-builder-border rounded px-3 py-2 text-sm text-builder-ink bg-builder-surface focus:outline-none focus:border-builder-blue focus:ring-1 focus:ring-builder-blue"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={config.placeholder || ''}
            />
          </div>
          <div className="flex justify-end gap-2 px-5 pb-4">
            <button
              type="button"
              onClick={() => onResult(null)}
              className="px-4 py-2 text-sm text-builder-ink-muted bg-builder-bg rounded hover:bg-builder-border font-bold"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="px-4 py-2 text-sm text-white bg-builder-blue rounded hover:bg-builder-blue-hover font-bold disabled:opacity-40"
            >
              {config.confirmLabel || 'OK'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- UIProvider ---
export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const [inputConfig, setInputConfig] = useState<InputConfig | null>(null);
  const confirmResolveRef = useRef<((result: boolean) => void) | null>(null);
  const inputResolveRef = useRef<((result: string | null) => void) | null>(null);
  const toastIdRef = useRef(0);

  const MAX_TOASTS = 5;
  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3000) => {
    const id = ++toastIdRef.current;
    setToasts(prev => {
      const next = [...prev, { id, message, type }];
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showConfirm = useCallback((message: string, options: Omit<ConfirmConfig, 'message'> = {}) => {
    return new Promise<boolean>((resolve) => {
      // 先行の confirm が未解決のまま resolver を上書きすると、先行の
      // await が永久に pending になり呼び出し元のフローが停止する。
      // 後勝ちで、先行はキャンセル扱い (false) にして解決しておく。
      if (confirmResolveRef.current) confirmResolveRef.current(false);
      confirmResolveRef.current = resolve;
      setConfirmConfig({ message, ...options });
    });
  }, []);

  const handleConfirmResult = useCallback((result: boolean) => {
    if (confirmResolveRef.current) {
      confirmResolveRef.current(result);
      confirmResolveRef.current = null;
    }
    setConfirmConfig(null);
  }, []);

  const showInput = useCallback((message: string, options: Omit<InputConfig, 'message'> = {}) => {
    return new Promise<string | null>((resolve) => {
      // showConfirm と同じ理由で先行分をキャンセル扱いで解決する
      if (inputResolveRef.current) inputResolveRef.current(null);
      inputResolveRef.current = resolve;
      setInputConfig({ message, ...options });
    });
  }, []);

  const handleInputResult = useCallback((result: string | null) => {
    if (inputResolveRef.current) {
      inputResolveRef.current(result);
      inputResolveRef.current = null;
    }
    setInputConfig(null);
  }, []);

  // 各コールバックは useCallback で stable。value 自体も memo しないと
  // toast の出現/消滅ごとに全 consumer が再レンダーされる。
  const value = useMemo(
    () => ({ showToast, showConfirm, showInput }),
    [showToast, showConfirm, showInput],
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      {/* 通知・確認ダイアログは BuilderApp のルートの外 (兄弟) に描くので、
          ボタン・罫線の土台 (tailwind.css の .koshu-builder) とフォーカス表示
          (.builder-root) をここでも効かせる。中身は fixed なので配置は変わらない */}
      <div className="koshu-builder builder-root">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <ConfirmModalComponent config={confirmConfig} onResult={handleConfirmResult} />
        {inputConfig && <InputModalComponent config={inputConfig} onResult={handleInputResult} />}
      </div>
    </UIContext.Provider>
  );
}
