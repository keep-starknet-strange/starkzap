declare module "react-dom/client" {
  export function createRoot(container: HTMLElement): {
    render(node: unknown): void;
    unmount(): void;
  };
}

declare module "@chainrails/react" {
  export const PaymentModal: unknown;
}

declare module "@chainrails/vanilla" {
  export const ChainrailsPaymentModalElement: {
    tagName: string;
  };
}
