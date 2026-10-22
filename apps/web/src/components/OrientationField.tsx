import type { Frame } from '../lib/api';
import { useI18n } from '../i18n';
import { Field, Segmented } from './ui';

export type Orientation = Frame['orientation'];

/** How the Canvas hangs on the wall: used when adding one and in its settings. */
export function OrientationField({ value, onChange }: { value: Orientation; onChange: (v: Orientation) => void }) {
  const { t } = useI18n();
  return (
    <Field label={t('canvasSettings.orientation')} group>
      <Segmented
        fill
        value={value}
        onChange={onChange}
        options={[
          { value: 'portrait', label: t('canvasSettings.portrait') },
          { value: 'landscape', label: t('canvasSettings.landscape') },
        ]}
      />
    </Field>
  );
}
