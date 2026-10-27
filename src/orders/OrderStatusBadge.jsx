import {useLocale} from '../i18n/useLocale'
import {orderStatusStyle,orderStatusLabels} from './statusStyles'
export default function OrderStatusBadge({status}){
 const locale=useLocale()
 return <span className="order-status" data-status={status} style={orderStatusStyle(status)}>{orderStatusLabels[locale][status]||status}</span>
}
