"use client";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-xl max-w-sm w-full p-6"
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border-default)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-lg transition-colors"
            style={{
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
            style={{
              background: variant === "danger"
                ? '#dc2626'
                : 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
