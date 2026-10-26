import {tr} from '../i18n/runtime'
import {useLocale} from '../i18n/useLocale'
import './modal-close.css'
// Use the dialog's existing cancel handler; never submit its form.
export default function ModalClose({onClose,disabled=false}){
 useLocale()
 return <button type="button" className="modal-close" aria-label={tr('Закрити')} disabled={disabled} onClick={onClose}>×</button>
}
