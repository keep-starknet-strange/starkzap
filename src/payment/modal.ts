import type {
  PaymentModalHandle,
  PaymentModalInput,
  PaymentModalSessionInput,
  PaymentModalTokenInput,
} from "@/payment/types";
import {
  ChainrailsPaymentModalElement,
  createPaymentSession,
} from "@chainrails/vanilla";
import { PaymentModal as ChainrailsReactPaymentModal } from "@chainrails/react";

type ReactModule = {
  createElement: (
    component: unknown,
    props: Record<string, unknown>
  ) => unknown;
};

type ReactDomClientModule = {
  createRoot: (container: HTMLElement) => {
    render: (node: unknown) => void;
    unmount: () => void;
  };
};

export class PaymentModalManager {
  private activeModalCleanup: (() => void) | null = null;

  modal(input: PaymentModalInput): PaymentModalHandle {
    const handle: PaymentModalHandle = {
      type: input.type,
      platform: input.platform,
      pay: () => this.pay(input),
    };

    if (input.type === "token") {
      handle.sessionToken = input.sessionToken;
    } else {
      handle.sessionUrl = input.sessionUrl;
    }

    if (input.amount !== undefined) {
      handle.amount = input.amount;
    }

    return handle;
  }

  private async pay(input: PaymentModalInput): Promise<boolean> {
    if (input.platform === "react-native") {
      throw new Error(
        `payment.modal is not implemented for platform "${input.platform}" yet. Use "vanilla" or "react".`
      );
    }

    if (input.platform === "react") {
      if (input.type !== "token") {
        throw new Error(
          'payment.modal with platform "react" requires `type: "token"` and `sessionToken`.'
        );
      }

      this.assertBrowser(input.platform);
      return this.payReactToken(input);
    }

    this.assertBrowser(input.platform);

    if (input.platform === "vanilla") {
      return input.type === "session"
        ? this.payVanillaSession(input)
        : this.payVanillaToken(input);
    }

    throw new Error(`Unsupported payment.modal platform "${input.platform}".`);
  }

  private async payReactToken(input: PaymentModalTokenInput): Promise<boolean> {
    let reactModule: ReactModule;
    let reactDomClientModule: ReactDomClientModule;

    try {
      reactModule = (await import("react")) as ReactModule;
      reactDomClientModule =
        (await import("react-dom/client")) as ReactDomClientModule;
    } catch {
      throw new Error(
        'payment.modal for "react" requires "react" and "react-dom" to be installed.'
      );
    }

    return new Promise<boolean>((resolve) => {
      const container = document.createElement("div");
      container.setAttribute("data-starkzap-payment-modal", "true");
      document.body.appendChild(container);

      const root = reactDomClientModule.createRoot(container);
      let settled = false;

      const settle = (value: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const cleanup = (): void => {
        root.unmount();
        container.remove();
        this.clearActiveModalCleanup(cleanup);
      };

      const closeWith = (value: boolean): void => {
        cleanup();
        settle(value);
      };

      this.setActiveModalCleanup(() => closeWith(false));

      root.render(
        reactModule.createElement(ChainrailsReactPaymentModal, {
          sessionToken: input.sessionToken,
          amount: input.amount,
          isOpen: true,
          isPending: false,
          open: () => undefined,
          close: () => closeWith(false),
          onCancel: () => closeWith(false),
          onSuccess: () => closeWith(true),
        })
      );
    });
  }

  private async payVanillaToken(
    input: PaymentModalTokenInput
  ): Promise<boolean> {
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
        cleanup();
        settle(value);
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

  private async payVanillaSession(
    input: PaymentModalSessionInput
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const modal = document.createElement(
        ChainrailsPaymentModalElement.tagName
      ) as HTMLElement & {
        setProps?: (props: { isOpen: boolean; isPending: boolean }) => void;
      };

      let settled = false;

      const settle = (value: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const session = createPaymentSession({
        session_url: input.sessionUrl,
        onCancel: () => {
          cleanup();
          settle(false);
        },
        onSuccess: () => {
          cleanup();
          settle(true);
        },
      });

      const unbind = session.bind(modal);

      const cleanup = (): void => {
        unbind();
        session.destroy();
        modal.setProps?.({ isOpen: false, isPending: false });
        modal.remove();
        this.clearActiveModalCleanup(cleanup);
      };

      this.setActiveModalCleanup(() => {
        cleanup();
        settle(false);
      });

      document.body.appendChild(modal);
      session.open();
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
