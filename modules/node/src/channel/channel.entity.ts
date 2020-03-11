import {
  CriticalStateChannelAddresses,
  SingleAssetTwoPartyIntermediaryAgreement,
} from "@connext/types";
import { Column, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";

import { AppInstance } from "../appInstance/appInstance.entity";
import { OnchainTransaction } from "../onchainTransactions/onchainTransaction.entity";
import { RebalanceProfile } from "../rebalanceProfile/rebalanceProfile.entity";
import { IsEthAddress, IsXpub } from "../util";
import { WithdrawCommitment } from "../commitment/commitment.entity";
import { FastSignedTransfer } from "../fastSignedTransfer/fastSignedTransfer.entity";
import { LinkedTransfer } from "../linkedTransfer/linkedTransfer.entity";

@Entity()
export class Channel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("integer")
  schemaVersion!: number;

  @Column("json")
  addresses!: CriticalStateChannelAddresses;

  @Column("text")
  @IsXpub()
  userPublicIdentifier!: string;

  // might not need this
  @Column("text")
  @IsXpub()
  nodePublicIdentifier!: string;

  @Column("text")
  @IsEthAddress()
  multisigAddress!: string;

  @Column("boolean", { default: false })
  available!: boolean;

  @Column("boolean", { default: false })
  collateralizationInFlight!: boolean;

  @OneToMany(
    (type: any) => AppInstance,
    (appInstance: AppInstance) => appInstance.channel,
    { cascade: true },
  )
  appInstances!: AppInstance[];

  @Column("json")
  singleAssetTwoPartyIntermediaryAgreements!: [string, SingleAssetTwoPartyIntermediaryAgreement][];

  @Column("integer")
  monotonicNumProposedApps!: number;

  @OneToMany(
    (type: any) => WithdrawCommitment,
    (withdrawalCommitment: WithdrawCommitment) => withdrawalCommitment.channel,
  )
  withdrawalCommitments!: WithdrawCommitment[];

  @ManyToMany(
    (type: any) => RebalanceProfile,
    (profile: RebalanceProfile) => profile.channels,
  )
  @JoinTable()
  rebalanceProfiles!: RebalanceProfile[];

  @OneToMany(
    (type: any) => LinkedTransfer,
    (transfer: LinkedTransfer) => transfer.senderChannel,
  )
  senderLinkedTransfers!: LinkedTransfer[];

  @OneToMany(
    (type: any) => LinkedTransfer,
    (transfer: LinkedTransfer) => transfer.receiverChannel,
  )
  receiverLinkedTransfers!: LinkedTransfer[];

  @OneToMany(
    (type: any) => FastSignedTransfer,
    (transfer: FastSignedTransfer) => transfer.senderChannel,
  )
  senderFastSignedTransfers!: FastSignedTransfer[];

  @OneToMany(
    (type: any) => FastSignedTransfer,
    (transfer: FastSignedTransfer) => transfer.receiverChannel,
  )
  receiverFastSignedTransfers!: FastSignedTransfer[];

  @OneToMany(
    (type: any) => OnchainTransaction,
    (tx: OnchainTransaction) => tx.channel,
  )
  transactions!: OnchainTransaction[];
}
