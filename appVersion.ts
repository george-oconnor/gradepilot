/**
 * Which version of GradePilot is running, shown at the bottom of the sidebar
 * so you can tell whether a phone has picked up the latest OTA update.
 *
 * The update number is the run number of the "Mobile OTA update" workflow
 * that published the JavaScript bundle (EXPO_PUBLIC_UPDATE_NUMBER, with the
 * commit as EXPO_PUBLIC_GIT_SHA). Promoting an update to the App Store
 * channels keeps the same number. A build that hasn't downloaded an update
 * yet runs its built-in bundle.
 */
import * as Updates from 'expo-updates';

/** One line, e.g. "GradePilot 1.0.1 · update 12 · 4670153". */
export function formatAppVersion(): string {
  // runtimeVersion uses the "appVersion" policy, so it is the app version.
  const parts = [`GradePilot ${Updates.runtimeVersion ?? 'dev'}`];
  const updateNumber = process.env.EXPO_PUBLIC_UPDATE_NUMBER;
  const sha = process.env.EXPO_PUBLIC_GIT_SHA;
  if (Updates.isEmbeddedLaunch || !updateNumber) {
    parts.push('built-in');
  } else {
    parts.push(`update ${updateNumber}`);
    if (sha) parts.push(sha.slice(0, 7));
  }
  return parts.join(' · ');
}
