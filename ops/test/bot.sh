#!/usr/bin/env bash
set -e

concurrency="${1:-1}"

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
project="`cat $dir/../../package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"

INDRA_ETH_RPC_URL="${INDRA_ETH_RPC_URL:-http://172.17.0.1:3000/api/ethprovider}"
INDRA_NODE_URL="${INDRA_NODE_URL:-http://172.17.0.1:3000/api}"
INDRA_NATS_URL="${INDRA_NATS_URL:-nats://172.17.0.1:4222}"

receiver_name="${project}_bot_receiver"
sender_name="${project}_bot_sender"

# Kill the dependency containers when this script exits
function cleanup {
  echo;
  for (( n=1; n<=$concurrency; n++ ))
  do 
    echo "Stopping ping pong pair $n.."
    docker container stop ${receiver_name}_$n 2> /dev/null || true
    docker container stop ${sender_name}_$n 2> /dev/null || true
  done
}
trap cleanup EXIT SIGINT

if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive --tty"
else echo "Running in non-interactive mode"
fi

for (( n=1; n<=$concurrency; n++ ))
do
  receiver="${receiver_name}_$n"
  sender="${sender_name}_$n"

  echo "Creating new private keys"
  receiver_key="0x`hexdump -n 32 -e '"%08X"' < /dev/urandom | tr '[:upper:]' '[:lower:]'`"
  sender_key="0x`hexdump -n 32 -e '"%08X"' < /dev/urandom | tr '[:upper:]' '[:lower:]'`"

  receiver_address="`node <<<'var eth = require("ethers"); console.log((new eth.Wallet("'"$receiver_key"'")).address);'`"
  receiver_pub_key="`node <<<'var eth = require("ethers"); console.log((new eth.Wallet("'"$receiver_key"'")).signingKey.publicKey);'`"
  sender_address="`node <<<'var eth = require("ethers"); console.log((new eth.Wallet("'"$sender_key"'")).address);'`"

  echo "Funding receiver: $receiver_address (pubKey: ${receiver_pub_key})"
  bash ops/fund.sh $receiver_address

  echo "Funding sender: $sender_address"
  bash ops/fund.sh $sender_address

  echo "Starting receiver container $n"
  docker run \
    --detach \
    --entrypoint="bash" \
    --env="LOG_LEVEL=$LOG_LEVEL" \
    --env="INDRA_ETH_RPC_URL=$INDRA_ETH_RPC_URL" \
    --env="INDRA_NODE_URL=$INDRA_NODE_URL" \
    --env="INDRA_NATS_URL=$INDRA_NATS_URL" \
    $interactive \
    --name="$receiver" \
    --rm \
    --volume="`pwd`:/root" \
    ${project}_builder -c '
      set -e
      echo "Bot container launched!"
      cd modules/bot
      export PATH=./node_modules/.bin:$PATH
      function finish {
        echo && echo "Bot container exiting.." && exit
      }
      trap finish SIGTERM SIGINT
      echo "Launching receiver bot!";echo
      npm run start -- receiver --private-key '$receiver_key' --concurrency-index '$n'
    '
  docker logs --follow $receiver &

  echo "Starting sender container $n"
  docker run \
    --detach \
    --entrypoint="bash" \
    --env="LOG_LEVEL=$LOG_LEVEL" \
    --env="INDRA_ETH_RPC_URL=$INDRA_ETH_RPC_URL" \
    --env="INDRA_NODE_URL=$INDRA_NODE_URL" \
    --env="INDRA_NATS_URL=$INDRA_NATS_URL" \
    $interactive \
    --name="$sender" \
    --rm \
    --volume="`pwd`:/root" \
    ${project}_builder -c '
      set -e
      echo "Bot container launched!"
      cd modules/bot
      export PATH=./node_modules/.bin:$PATH
      function finish {
        echo && echo "Bot container exiting.." && exit
      }
      trap finish SIGTERM SIGINT
      echo "Launching sender bot!";echo
      npm run start -- sender --private-key '$sender_key' --receiver-public-key '$receiver_pub_key' --concurrency-index '$n'
    '
  docker logs --follow $sender &

done