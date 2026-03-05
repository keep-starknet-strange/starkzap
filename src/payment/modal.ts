import type { PaymentModalHandle, PaymentModalInput } from "@/payment/types";
import { ChainrailsPaymentModalElement } from "@chainrails/vanilla";

export class PaymentModalManager {
  private activeModalCleanup: (() => void) | null = null;

  modal(input: PaymentModalInput): PaymentModalHandle {
    const platform = input.platform ?? "web";

    const handle: PaymentModalHandle = {
      platform,
      sessionToken: input.sessionToken,
      pay: () => this.pay({ ...input, platform }),
      amount: input.amount || "0",
    };

    return handle;
  }

  private async pay(input: PaymentModalInput): Promise<boolean> {
    const platform = input.platform ?? "web";

    if (platform === "mobile") {
      return this.payMobile(input);
    } else if (platform === "web") {
      this.assertBrowser(platform);
      return this.payVanillaToken(input);
    } else {
      throw new Error(`Unsupported payment.modal platform "${platform}".`);
    }
  }

  private async payMobile(_: PaymentModalInput): Promise<boolean> {
    throw new Error("Mobile Payments not supported yet.");
  }

  private async payVanillaToken(input: PaymentModalInput): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const modal = document.createElement(
        ChainrailsPaymentModalElement.tagName
      ) as HTMLElement & {
        setProps?: (props: {
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
      modal.setProps?.({
        sessionToken: input.sessionToken,
        amount: input.amount || "0",
        isOpen: true,
        isPending: false,
        onCancel: () => closeWith(false),
        onSuccess: () => closeWith(true),
      });

      modal.open();
    });
  }

  private assertBrowser(platform: string): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new Error(
        `payment.modal with platform "${platform}" requires a browser environment.`
      );
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
