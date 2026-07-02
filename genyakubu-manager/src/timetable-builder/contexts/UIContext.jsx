import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { UIContext } from './uiContextValue';
import { useFocusTrap } from '../hooks/useFocusTrap';

// --- Toast ---
function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm font-bold flex items-center gap-2 animate-slide-in
            ${t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'warning' ? 'bg-yellow-500 text-white' : 'bg-green-600 text-white'}`}
        >
          <span>{t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : '✅'}</span>
          <span className="whitespace-pre-line">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="ml-2 opacity-70 hover:opacity-100">×</button>
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
    <div className="fixed inset-0 bg-black/40 z-[90] flex justify-center items-center p-4" onClick={() => onResult(false)}>
      <div ref={boxRef} role="dialog" aria-modal="true" className="bg-white rounded-lg shadow-2xl max-w-md w-full animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="font-bold text-lg text-gray-800 mb-3">{config.title || '確認'}</h3>
          <p className="text-sm text-gray-600 whitespace-pre-line">{config.message}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <button
            onClick={() => onResult(false)}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 font-bold"
          >
            キャンセル
          </button>
          <button
            ref={okRef}
            onClick={() => onResult(true)}
            className={`px-4 py-2 text-sm text-white rounded font-bold ${config.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
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
    <div className="fixed inset-0 bg-black/40 z-[90] flex justify-center items-center p-4" onClick={() => onResult(null)}>
      <div ref={boxRef} role="dialog" aria-modal="true" className="bg-white rounded-lg shadow-2xl max-w-md w-full animate-fade-in" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-5">
            <h3 className="font-bold text-lg text-gray-800 mb-3">{config.title || '入力'}</h3>
            {config.message && <p className="text-sm text-gray-600 mb-3">{config.message}</p>}
            <input
              ref={inputRef}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={config.placeholder || ''}
            />
          </div>
          <div className="flex justify-end gap-2 px-5 pb-4">
            <button
              type="button"
              onClick={() => onResult(null)}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 font-bold"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 font-bold disabled:opacity-40"
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
export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [inputConfig, setInputConfig] = useState(null);
  const confirmResolveRef = useRef(null);
  const inputResolveRef = useRef(null);
  const toastIdRef = useRef(0);

  const MAX_TOASTS = 5;
  const showToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++toastIdRef.current;
    setToasts(prev => {
      const next = [...prev, { id, message, type }];
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showConfirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      // 先行の confirm が未解決のまま resolver を上書きすると、先行の
      // await が永久に pending になり呼び出し元のフローが停止する。
      // 後勝ちで、先行はキャンセル扱い (false) にして解決しておく。
      if (confirmResolveRef.current) confirmResolveRef.current(false);
      confirmResolveRef.current = resolve;
      setConfirmConfig({ message, ...options });
    });
  }, []);

  const handleConfirmResult = useCallback((result) => {
    if (confirmResolveRef.current) {
      confirmResolveRef.current(result);
      confirmResolveRef.current = null;
    }
    setConfirmConfig(null);
  }, []);

  const showInput = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      // showConfirm と同じ理由で先行分をキャンセル扱いで解決する
      if (inputResolveRef.current) inputResolveRef.current(null);
      inputResolveRef.current = resolve;
      setInputConfig({ message, ...options });
    });
  }, []);

  const handleInputResult = useCallback((result) => {
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
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <ConfirmModalComponent config={confirmConfig} onResult={handleConfirmResult} />
      {inputConfig && <InputModalComponent config={inputConfig} onResult={handleInputResult} />}
    </UIContext.Provider>
  );
}
