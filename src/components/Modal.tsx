import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; wide?: boolean }

export function Modal({ open, onClose, title, subtitle, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby={headingId}>
    <div className="modal-header">
      <div><span className="eyebrow">MAKE YOURSELF COMFORTABLE</span><h2 id={headingId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
    </div>
    {children}
  </dialog>;
}
