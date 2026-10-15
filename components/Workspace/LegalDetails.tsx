import { addressFields, contactFields, fieldValue } from '../../lib/workspace/legal-form';
import type { Row } from '../../lib/workspace/client';

export default function LegalDetails({ editing }: { editing: Row }) {
  return <>
    <h3>Adresse et coordonnées juridiques</h3>
    {([['address', addressFields], ['contacts', contactFields]] as const).map(([group, fields]) =>
      fields.map(([name, label, aliases]) => <label key={`${group}_${name}`}>
        {label}<input name={`${group}_${name}`} type={name === 'email' ? 'email' : 'text'}
          defaultValue={fieldValue(editing[group], aliases)} maxLength={500} />
      </label>))}
    <p>Les informations d’assurance existantes sont conservées. Renseignez ci-dessous le texte d’assurance à imprimer, avec l’assureur, le contrat et la couverture géographique applicables.</p>
  </>;
}
