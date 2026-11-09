import { tr } from './i18n';
import chalk from 'chalk';
import gradient from 'gradient-string';

const LOGO = ` ██████╗  ███████╗██████╗  ██████╗ ███████╗██╗██╗   ██╗███╗   ███╗
 ██╔══██╗ ██╔════╝██╔══██╗██╔═══██╗██╔════╝██║██║   ██║████╗ ████║
 ██║  ██║ █████╗  ██████╔╝██║   ██║███████╗██║██║   ██║██╔████╔██║
 ██║  ██║ ██╔══╝  ██╔═══╝ ██║   ██║╚════██║██║██║   ██║██║╚██╔╝██║
 ██████╔╝ ███████╗██║     ╚██████╔╝███████║██║╚██████╔╝██║ ╚═╝ ██║
 ╚═════╝  ╚══════╝╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝     ╚═╝`;

/** Put the existing DEPOSIUM wordmark at startup, with a compact narrow-terminal fallback. */
export function createWelcomeBanner(columns = process.stdout.columns ?? 80): string {
  const width = Number.isFinite(columns) && columns > 0 ? columns : 80;
  const fits = LOGO.split('\n').every((line) => line.length <= width);
  const title = fits ? LOGO : 'DEPOSIUM®';
  const subtitle =
    width >= 40 ? tr('Document chat · Search · Diagnostics') : tr('Document workspace');
  return (
    '\n' +
    gradient(['#0ea5e9', '#3b82f6', '#6366f1']).multiline(title) +
    '\n' +
    chalk.gray(subtitle) +
    '\n'
  );
}
