declare module 'marked-terminal' {
  import { MarkedExtension } from 'marked';

  interface TerminalRendererOptions {
    code?: (code: string, lang?: string) => string;
    blockquote?: (quote: string) => string;
    html?: (html: string) => string;
    heading?: (text: string, level: number) => string;
    firstHeading?: boolean;
    showSectionPrefix?: boolean;
    reflowText?: boolean;
    width?: number;
    unescape?: boolean;
    emoji?: boolean;
    tableOptions?: Record<string, unknown>;
    tab?: number;
  }

  export function markedTerminal(options?: TerminalRendererOptions): MarkedExtension;
}
