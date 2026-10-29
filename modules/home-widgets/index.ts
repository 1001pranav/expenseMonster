import { requireOptionalNativeModule } from 'expo';

/** Native side: modules/home-widgets/android. Absent on iOS, in Expo Go and on builds made before it was added. */
interface HomeWidgetsNative {
  /** Store the snapshot (src/domain/widgets.ts, as JSON) and redraw every widget on the home screen. */
  update(snapshot: string): void;
}

const native = requireOptionalNativeModule<HomeWidgetsNative>('HomeWidgets');

export const homeWidgetsAvailable = () => Boolean(native);

export function updateHomeWidgets(snapshot: string): void {
  native?.update(snapshot);
}
