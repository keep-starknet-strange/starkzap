import React from "react";

export const WalletConnectorProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return <>{children}</>;
};

export const useWalletConnector = () => {
  throw new Error(
    "WalletConnector is removed. Use StarknetConnector directly."
  );
};
