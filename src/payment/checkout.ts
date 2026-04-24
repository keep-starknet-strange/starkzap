import type { PaymentModalHandle, PaymentModalInput } from "@/payment/types";

export class PaymentModalManager {
  private activeModalCleanup: (() => void) | null = null;

  checkout(input: PaymentModalInput): PaymentModalHandle {
    const handle: PaymentModalHandle = {
      sessionToken: input.sessionToken,
      pay: () => this.pay({ ...input }),
      ...(input.amount && { amount: input.amount }),
    };

    return handle;
  }

  private async pay(input: PaymentModalInput): Promise<boolean> {
    this.assertBrowser();
    return this.payVanillaToken(input);
  }

  private async payVanillaToken(input: PaymentModalInput): Promise<boolean> {
    // Only runs in a browser environment.
    const { ChainrailsPaymentModalElement } =
      await import("@chainrails/vanilla");

    return new Promise<boolean>((resolve, reject) => {
      const modal = document.createElement(
        ChainrailsPaymentModalElement.tagName
      ) as HTMLElement & {
        setProps: (props: {
          sessionToken: string;
          amount?: string;
          isOpen?: boolean;
          isPending?: boolean;
          onCancel: () => void;
          onSuccess: () => void;
        }) => void;
        open: () => void;
        close: () => void;
      };

      let settled = false;

      const settle = (value: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const cleanup = (): void => {
        modal.close();
        modal.remove();
        this.clearActiveModalCleanup(cleanup);
      };

      const closeWith = (value: boolean): void => {
        settle(value);
        cleanup();
      };

      this.setActiveModalCleanup(() => closeWith(false));

      // always append to dom before setting props
      document.body.appendChild(modal);

      // Validate that setProps exists - without it the modal cannot function
      if (typeof modal.setProps !== "function") {
        cleanup();
        reject(
          new Error("Chainrails modal element is missing setProps method")
        );
        return;
      }

      modal.setProps({
        sessionToken: input.sessionToken,
        ...(input.amount && { amount: input.amount }),
        isOpen: true,
        isPending: false,
        onCancel: () => closeWith(false),
        onSuccess: () => closeWith(true),
      });

      try {
        modal.open();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  private assertBrowser(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error(`payment.modal requires a browser environment.`);
    }
  }

  private setActiveModalCleanup(cleanup: () => void): void {
    this.activeModalCleanup?.();
    this.activeModalCleanup = cleanup;
  }

  private clearActiveModalCleanup(cleanup: () => void): void {
    if (this.activeModalCleanup === cleanup) {
      this.activeModalCleanup = null;
    }
  }
}
