"use client";

import { useState } from "react";
import { PaymentChains, PaymentTokenSymbols, StarkZap } from "starkzap";
import ArrowDownIcon from "../icons/ArrowDown";
import CheckIcon from "../icons/Check";
import NGFlagIcon from "../icons/NGFlag";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("credit-card");
  // Initialize SDK and payment modal
  const sdk = new StarkZap({
    network: "mainnet",
  });
  const payment = sdk.payment();

  async function pay() {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/create-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            destinationChain: PaymentChains.STARKNET,
            token: PaymentTokenSymbols.USDC,
            recipient:
              "0x0075597a61229d143Ffba493C9f8A8057ecCeeA7BFDDBFD8Aaf79AC8935205c0",
            amount: "0.99",
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.sessionToken) {
        throw new Error("Session token not found in response");
      }

      const paid = await payment
        .modal({
          sessionToken: data.sessionToken,
          amount: "0.99",
        })
        .pay();

      console.log(paid ? "Payment Successful" : "Payment Failed");
    } catch (error) {
      console.error("Payment failed:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="bg-white py-8 antialiased md:py-16">
        <form action="#" className="mx-auto px-4 2xl:px-0">
          <ol className="items-center flex w-full max-w-2xl text-center text-sm font-medium text-gray-500 sm:text-base">
            <li className="after:border-1 flex items-center text-primary-700 after:mx-6 after:bg-gray-900 after:hidden after:h-1 after:w-full after:border-b after:border-gray-200 sm:after:inline-block sm:after:content-[''] md:w-full xl:after:mx-10">
              <span className="flex items-center after:mx-2 text-black after:content-['/'] sm:after:hidden">
                <CheckIcon />
                Cart
              </span>
            </li>

            <li className="after:border-1 flex items-center text-primary-700 after:mx-6 after:bg-gray-200 after:hidden after:h-1 after:w-full after:border-b after:border-gray-200 sm:after:inline-block sm:after:content-[''] md:w-full xl:after:mx-10">
              <span className="flex items-center after:mx-2 text-black after:text-gray-200 after:content-['/'] sm:after:hidden">
                <CheckIcon />
                Checkout
              </span>
            </li>

            <li className="flex shrink-0 items-center">
              <CheckIcon />
              Order summary
            </li>
          </ol>

          <div className="mt-6 sm:mt-20 lg:flex lg:items-start lg:gap-12 xl:gap-16 w-max">
            <div className="space-y-8 2 w-max">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Delivery Details
                </h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="your_name"
                      className="mb-2 block text-sm font-medium text-gray-900"
                    >
                      Your name
                    </label>
                    <input
                      type="text"
                      id="your_name"
                      className="block w-full rounded-lg border border-gray-500 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500"
                      placeholder="Jide Sanwo-Olu"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="your_email"
                      className="mb-2 block text-sm font-medium text-gray-900"
                    >
                      Your email*
                    </label>
                    <input
                      type="email"
                      id="your_email"
                      className="block w-full rounded-lg border border-gray-500 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500"
                      placeholder="bsanwo-olu@lagosstate.gov.ng"
                      required
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <label
                        htmlFor="select-city-input-3"
                        className="block text-sm font-medium text-gray-900"
                      >
                        City*
                      </label>
                    </div>
                    <select
                      id="select-city-input-3"
                      defaultValue="Ikeja"
                      className="block w-full rounded-lg border border-gray-500 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500"
                    >
                      <option value="Ikeja">Ikeja</option>
                      <option value="Lagos Island">Lagos Island</option>
                      <option value="Surulere">Surulere</option>
                      <option value="Badagry">Badagry</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="phone-input"
                      className="mb-2 block text-sm font-medium text-gray-900"
                    >
                      Phone Number*
                    </label>
                    <div className="flex items-center">
                      <button
                        id="dropdown-phone-button-3"
                        data-dropdown-toggle="dropdown-phone-3"
                        className="z-10 inline-flex shrink-0 items-center rounded-s-lg border border-gray-500 bg-gray-100 px-4 py-2.5 text-center text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-none focus:ring-4 focus:ring-gray-100 "
                        type="button"
                      >
                        <NGFlagIcon />
                        +234
                        <ArrowDownIcon />
                      </button>
                      <div className="relative w-full">
                        <input
                          type="text"
                          id="phone-input"
                          className="z-20 block w-full rounded-e-lg border border-s-0 border-gray-500 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-primary-500 focus:ring-primary-500 "
                          pattern="[0-9]{10}"
                          placeholder="123-456-7890"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 w-max">
                <h3 className="text-xl font-semibold text-gray-900">Payment</h3>

                <div className="grid grid-cols-1 gap-4 md:flex w-max">
                  <div className="rounded-lg border cursor-pointer w-fit border-gray-500 bg-gray-0 p-3 pl-3 pr-6">
                    <div className="flex items-start">
                      <div className="flex h-5 items-center">
                        <input
                          id="credit-card"
                          aria-describedby="credit-card-text"
                          type="radio"
                          name="payment-method"
                          value="credit-card"
                          className="h-4 w-4 border-gray-500 bg-white text-primary-600 focus:ring-2 focus:ring-primary-600"
                          checked={paymentMethod === "credit-card"}
                          onChange={() => setPaymentMethod("credit-card")}
                        />
                      </div>

                      <div className="ms-4 text-sm">
                        <label
                          htmlFor="credit-card"
                          className="font-medium leading-none text-black"
                        >
                          Chainrails
                        </label>
                        <p
                          id="credit-card-text"
                          className="mt-1 text-xs font-normal text-gray-700"
                        >
                          Pay with your crypto
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border cursor-pointer w-fit border-gray-200 bg-gray-50 p-3 pl-3 pr-6">
                    <div className="flex items-start">
                      <div className="flex h-5 items-center">
                        <input
                          id="pay-on-delivery"
                          aria-describedby="pay-on-delivery-text"
                          type="radio"
                          name="payment-method"
                          value="pay-on-delivery"
                          className="h-4 w-4 border-gray-500 bg-white text-primary-600 focus:ring-2 focus:ring-primary-600"
                          checked={paymentMethod === "pay-on-delivery"}
                          onChange={() => setPaymentMethod("pay-on-delivery")}
                        />
                      </div>

                      <div className="ms-4 text-sm">
                        <label
                          htmlFor="pay-on-delivery"
                          className="font-medium leading-none text-gray-900"
                        >
                          Payment on delivery
                        </label>
                        <p
                          id="pay-on-delivery-text"
                          className="mt-1 text-xs font-normal text-gray-500"
                        >
                          +$15 payment processing fee
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border cursor-pointer w-fit border-gray-200 bg-gray-50 p-3 pl-3 pr-6">
                    <div className="flex items-start">
                      <div className="flex h-5 items-center">
                        <input
                          id="paypal"
                          aria-describedby="paypal-text"
                          type="radio"
                          name="payment-method"
                          value="paypal"
                          checked={paymentMethod === "paypal"}
                          onChange={() => setPaymentMethod("paypal")}
                          className="h-4 w-4 border-gray-500 bg-white text-primary-600 focus:ring-2 focus:ring-primary-600"
                        />
                      </div>

                      <div className="ms-4 text-sm">
                        <label
                          htmlFor="paypal"
                          className="font-medium leading-none text-gray-900"
                        >
                          Paypal account
                        </label>
                        <p
                          id="paypal-text"
                          className="mt-1 text-xs font-normal text-gray-500"
                        >
                          Connect to your account
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 w-full lg:w-2xl space-y-6 sm:mt-8 lg:mt-0 lg:max-w-xs xl:max-w-md shrink-0">
              <div className="flow-root">
                <div className="-my-3 divide-y divide-gray-200">
                  <dl className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-base font-normal text-gray-500">
                      Subtotal
                    </dt>
                    <dd className="text-base font-medium text-gray-900">
                      $9.49
                    </dd>
                  </dl>

                  <dl className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-base font-normal text-gray-500">VAT</dt>
                    <dd className="text-base font-medium text-gray-900">
                      $0.40
                    </dd>
                  </dl>

                  <dl className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-base font-bold text-gray-900">Total</dt>
                    <dd className="text-base font-bold text-gray-900">$9.89</dd>
                  </dl>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={pay}
                  disabled={loading}
                  type="button"
                  className="bg-black cursor-pointer flex w-full items-center justify-center rounded-lg bg-primary-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-800 focus:outline-none focus:ring-4  focus:ring-primary-300 disabled:opacity-75"
                >
                  {loading ? "Processing..." : "Proceed to Payment"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>
    </>
  );
}
