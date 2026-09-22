import { useId } from 'react'

export default function PlanItemDetailsFields({ value, onChange }) {
  const id = useId()
  return (
    <div className="plan-item-details-fields">
      <label htmlFor={`${id}-time`}>
        Gotowe na
        <input id={`${id}-time`} aria-label="Gotowe na" type="time" step="60" value={value.ready_time?.slice(0, 5) || ''}
          onChange={(e) => onChange('ready_time', e.target.value)} />
      </label>
      <label htmlFor={`${id}-note`}>
        Notatka
        <textarea id={`${id}-note`} aria-label="Notatka" rows="2" value={value.note || ''} placeholder="Np. bez cebuli, na catering"
          onChange={(e) => onChange('note', e.target.value)} />
      </label>
    </div>
  )
}
