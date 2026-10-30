import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; wide?: boolean; variant?: 'menu' }

export function Modal({ open, onClose, title, subtitle, children, wide, variant }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) {
      dialog.close();
      // A nested sheet may have been opened from a menu that is now closed.
      // Keep the next keyboard action on a visible control in that case.
      const focused=document.activeElement;
      if(focused===document.body||focused?.closest('dialog:not([open])')) {
        document.querySelector<HTMLButtonElement>('.perch-menu-button')?.focus({preventScroll:true});
      }
    }
  }, [open]);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${variant==='menu'?'perch-menu-sheet':''}`} onCancel={onClose}
    onKeyDown={event=>{
      if(event.key!=='Tab')return;
      const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary,[tabindex]')).filter(element=>element.tabIndex>=0&&element.getClientRects().length>0&&!element.matches(':disabled'));
      const first=controls[0],last=controls.at(-1);
      if((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){
        event.preventDefault();(event.shiftKey?last:first)?.focus();
      }
    }}
    onClick={event => {
      if(event.target!==event.currentTarget)return;
      const bounds=event.currentTarget.getBoundingClientRect();
      if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose();
    }} aria-labelledby={headingId}>
    <div className="modal-header">
      <div><h2 id={headingId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
    </div>
    {children}
  </dialog>;
}
