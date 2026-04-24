declare module "@chainrails/vanilla" {
  export function createPaymentSession(options: {
    session_url: string;
    onCancel: () => void;
    onSuccess: () => void;
  }): {
    bind: (element: HTMLElement) => () => void;
    open: () => void;
    destroy: () => void;
  };

  export const ChainrailsPaymentModalElement: {
    tagName: string;
  };
}
