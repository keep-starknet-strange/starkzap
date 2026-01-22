#!/bin/bash
set -e

# Start devnet in background
echo "Starting devnet..."
starknet-devnet --seed 0 --account-class cairo1 &
DEVNET_PID=$!

# Wait for devnet to be ready
echo "Waiting for devnet to be ready..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:5050/is_alive > /dev/null 2>&1; then
    echo "Devnet is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Devnet failed to start"
    kill $DEVNET_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# Run tests
echo "Running integration tests..."
TEST_NETWORK=devnet npx vitest run tests/integration/
TEST_EXIT_CODE=$?

# Stop devnet
echo "Stopping devnet..."
kill $DEVNET_PID 2>/dev/null || true

exit $TEST_EXIT_CODE
