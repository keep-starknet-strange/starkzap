'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getSDK, PRESETS, type WalletInterface } from '@/lib/starkzap';
import { OnboardStrategy } from 'starkzap';

interface WalletData {
  walletId: string;
  publicKey: string;
  address: string;
}

export function StarknetWallet() {
  const { authenticated, user, login, logout, ready, getAccessToken } = usePrivy();

  const [starknetWallet, setStarknetWallet] = useState<WalletInterface | null>(null);
  const [privyWalletData, setPrivyWalletData] = useState<WalletData | null>(null);
  const [isDeployed, setIsDeployed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof PRESETS>('argent');

  // Create or get Starknet wallet from our backend
  const ensureStarknetWallet = useCallback(async (): Promise<WalletData | null> => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No access token available');
    }

    const response = await fetch('/api/wallet/starknet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create wallet');
    }

    const { wallet } = await response.json();
    return wallet;
  }, [getAccessToken]);

  // Connect Starknet wallet using starkzap
  const connectStarknetWallet = useCallback(async (walletData: WalletData) => {
    const sdk = getSDK();
    const token = await getAccessToken();
    if (!token) {
      throw new Error('No access token available');
    }

    const onboard = await sdk.onboard({
      strategy: OnboardStrategy.Privy,
      deploy: 'never',
      accountPreset: PRESETS[selectedPreset],
      privy: {
        resolve: async () => ({
          walletId: walletData.walletId,
          publicKey: walletData.publicKey,
          serverUrl: `${window.location.origin}/api/wallet/sign`,
          headers: () => ({
            'Authorization': `Bearer ${token}`,
          }),
        }),
      },
    });

    return onboard.wallet;
  }, [selectedPreset, getAccessToken]);

  // Check deployment status
  const checkDeployment = useCallback(async (wallet: WalletInterface) => {
    try {
      const deployed = await wallet.isDeployed();
      setIsDeployed(deployed);
    } catch (err) {
      console.error('Failed to check deployment:', err);
      setIsDeployed(null);
    }
  }, []);

  // Auto-connect on authentication
  useEffect(() => {
    if (authenticated && !starknetWallet) {
      setLoading(true);
      setError(null);

      ensureStarknetWallet()
        .then(async (walletData) => {
          if (walletData) {
            setPrivyWalletData(walletData);
            const wallet = await connectStarknetWallet(walletData);
            setStarknetWallet(wallet);
            await checkDeployment(wallet);
          }
        })
        .catch((err) => {
          console.error('Wallet setup error:', err);
          setError(err.message || 'Failed to setup wallet');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [authenticated, starknetWallet, ensureStarknetWallet, connectStarknetWallet, checkDeployment]);

  // Disconnect wallet
  const handleDisconnect = useCallback(async () => {
    setStarknetWallet(null);
    setPrivyWalletData(null);
    setIsDeployed(null);
    setError(null);
    await logout();
  }, [logout]);

  // Deploy account
  const handleDeploy = useCallback(async () => {
    if (!starknetWallet) return;

    setLoading(true);
    setError(null);

    try {
      const tx = await starknetWallet.deploy();
      console.log('Deploy tx:', tx.hash);
      await tx.wait();
      setIsDeployed(true);
    } catch (err) {
      console.error('Deploy error:', err);
      setError(err instanceof Error ? err.message : 'Deployment failed');
    } finally {
      setLoading(false);
    }
  }, [starknetWallet]);

  // Test transfer
  const handleTestTransfer = useCallback(async () => {
    if (!starknetWallet) return;

    setLoading(true);
    setError(null);

    try {
      // STRK contract on Sepolia
      const STRK_CONTRACT = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

      const tx = await starknetWallet.execute([
        {
          contractAddress: STRK_CONTRACT,
          entrypoint: 'transfer',
          calldata: [starknetWallet.address, '0', '0'], // 0 STRK to self
        },
      ]);

      console.log('Transfer tx:', tx.hash);
      await tx.wait();
      alert('Transfer successful!');
    } catch (err) {
      console.error('Transfer error:', err);
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setLoading(false);
    }
  }, [starknetWallet]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-starknet-primary"></div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <h2 className="text-2xl font-bold text-white">Starknet Wallet with Privy</h2>
        <p className="text-gray-400 text-center max-w-md">
          Connect with your favorite social login to get a Starknet embedded wallet.
          No private keys to manage!
        </p>
        <button
          onClick={login}
          className="px-6 py-3 bg-starknet-primary hover:bg-starknet-light rounded-lg font-medium transition-colors"
        >
          Connect with Privy
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Starknet Wallet</h2>
        <button
          onClick={handleDisconnect}
          className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors"
        >
          Disconnect
        </button>
      </div>

      {/* User Info */}
      {user && (
        <div className="text-sm text-gray-400">
          Logged in as: {user.email?.address || user.google?.subject || user.id}
        </div>
      )}

      {/* Account Preset Selection */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-gray-400">Account Preset</label>
        <select
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(e.target.value as keyof typeof PRESETS)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
          disabled={!!starknetWallet}
        >
          <option value="argent">Argent</option>
          <option value="openzeppelin">OpenZeppelin</option>
        </select>
      </div>

      {/* Wallet Info */}
      {privyWalletData && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Address:</span>
            <span className="font-mono text-white truncate max-w-[200px]">
              {starknetWallet?.address || privyWalletData.address}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Status:</span>
            <span className={`font-medium ${
              isDeployed === true ? 'text-green-400' :
              isDeployed === false ? 'text-yellow-400' :
              'text-gray-400'
            }`}>
              {isDeployed === true ? 'Deployed' :
               isDeployed === false ? 'Not Deployed' :
               'Checking...'}
            </span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-starknet-primary"></div>
          <span className="ml-2 text-gray-400">Processing...</span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {isDeployed === false && (
          <button
            onClick={handleDeploy}
            disabled={loading}
            className="px-4 py-2 bg-starknet-primary hover:bg-starknet-light rounded font-medium transition-colors disabled:opacity-50"
          >
            Deploy Account
          </button>
        )}

        {isDeployed === true && (
          <button
            onClick={handleTestTransfer}
            disabled={loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium transition-colors disabled:opacity-50"
          >
            Test Transfer (0 STRK)
          </button>
        )}

        <button
          onClick={() => starknetWallet && checkDeployment(starknetWallet)}
          disabled={loading || !starknetWallet}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50"
        >
          Refresh Status
        </button>
      </div>

      {/* Help Text */}
      <p className="text-xs text-gray-500 text-center">
        {isDeployed === false && 'Fund your wallet address with STRK, then deploy.'}
        {isDeployed === true && 'Your account is ready for transactions!'}
      </p>
    </div>
  );
}
