# Introduction

## How to get started

If you're interested in:
1. Integrating state channels into your dApp or wallet, see [Getting Started](../user/quickStart.md)
2. Running your own node, see [Running your own Node](../nodeOperator/runNode.md)
3. Helping build Connext, see our [Contributor docs](../contributor/CONTRIBUTING.md)

## What is Connext?

Connext is an infrastructure layer on top of Ethereum and any other EVM blockchains that enables instant, high volume, p2p transfers on and across chains. The goal of the Connext Network is to abstract away the complexities and cost of interacting with a given blockchain for p2p usecases. Projects in the space are already using Connext to enable instant wallet to wallet transfers, enable p2p micropayments, power marketplaces, and build games on the Ethereum mainnet!

Connext is built using *state channels*. State channels enable users to batch up normal Ethereum transactions without needing to trust intermediaries. State channels do not require any external custodians or add any additional functionality to Ethereum, they simply allow existing Ethereum interactions to occur *more quickly* and at *lower cost* by putting more interactions into each block.

If you're unfamiliar with terms like smart contract and private key, please refer to a more general developer guide such as [this one, compiled by the Ethereum community](https://github.com/ethereum/wiki/wiki/Ethereum-Development-Tutorial), before continuing.

## State Channel Basics

State channels allow many off-chain commitments to be aggregated into just a few onchain transactions:

1. A user opens a channel by depositing their money into a multisignature smart contract with a counterparty. Note that the smart contract runs entirely on the blockchain and so the user remains *entirely* in custody of their own funds.

2. The user transacts by sending signed settlement instructions for how the counterparty can retrieve funds from the smart contract. Because the instructions give the counterparty irrevocable access to part of the funds, the user can make multiple "updates" to their balances while only paying the fees of the initial deposit.

3. When either party is done transacting, they can take the latest update to the smart contract and unlock the finalized funds.

4. Because there can be arbitrary conditionality to the settlement instructions, the above relationship can be extended to allow users to transact with more parties. For instance, if Alice wants to pay Charlie but only has a channel with Bob, Alice can pay Bob conditionally based on whether he pays Charlie. If the latter part of the transaction is not completed, then Alice's transaction to Bob will not occur either - this makes transactions *atomic* and *noncustodial*.

5. This arbitrary conditionality also applies to the activities that Alice and Bob can do - anything from simple transfers of Ethereum tokens, to prediction markets, auctions, and even chess games.

If you're looking for more information, here are a few digestible resources on how they work:

* [EthHub's Layer Two Scaling Page](https://docs.ethhub.io/ethereum-roadmap/layer-2-scaling/state-channels/)
* [State Channels for Dummies Series](https://medium.com/blockchannel/counterfactual-for-dummies-part-1-8ff164f78540)
* [State Channels for Babies Series](https://medium.com/connext/state-channels-for-babies-c39a8001d9af)

## Status

V2 of Connext is *live* on the Ethereum mainnet and on testnet on other EVM based blockchains.

V2 features a single node hub-and-spoke system over which transactions are routed. Anyone can run a Connext node as a service provider to connect users to each other. [Connext clients](../user/clientAPI.md) open channels to this node and can then make commitments to any other client connected to the same node. In Connext, users' funds annd transactions are entirely noncustodial - the node never holds your value *at all*.

Note that this iteration of Connext is not censorship resistant. It is currently possible for a node to block a user's commitments to other users, thereby stopping the user from making instant/offchain transfers. Even if this were to happen, users are *always* able to withdraw their funds to any account or wallet on the base blockchain. For a detailed overview of the trust assumptions and limitations that exist at present, please read [System Limitations](../user/limitations.md).

The next major iteration of Connext will feature routing state updates between nodes, allowing clients to connect to many nodes concurrently, and the ability for anyone to connect their own node to the Connext Network.

