import { CriticalStateChannelAddresses, Collateralizations } from "@connext/types";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { constants } from "ethers";

import { AppInstance } from "../appInstance/appInstance.entity";
import { OnchainTransaction } from "../onchainTransactions/onchainTransaction.entity";
import { RebalanceProfile } from "../rebalanceProfile/rebalanceProfile.entity";
import { IsEthAddress, IsValidPublicIdentifier } from "../validate";
import { WithdrawCommitment } from "../withdrawCommitment/withdrawCommitment.entity";
import { SetupCommitment } from "../setupCommitment/setupCommitment.entity";

@Entity()
export class Channel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("integer", { default: 0 })
  schemaVersion!: number;

  @Column("jsonb", { nullable: true })
  addresses!: CriticalStateChannelAddresses;

  @Column("text")
  @IsValidPublicIdentifier()
  userIdentifier!: string;

  // might not need this
  @Column("text")
  @IsValidPublicIdentifier()
  nodeIdentifier!: string;

  @Column("text", { unique: true })
  @IsEthAddress()
  multisigAddress!: string;

  @Column("boolean", { default: false })
  available!: boolean;

  @Column("json", { default: { [constants.AddressZero]: false } })
  activeCollateralizations!: Collateralizations;

  @OneToMany((type: any) => AppInstance, (appInstance: AppInstance) => appInstance.channel, {
    cascade: true,
  })
  appInstances!: AppInstance[];

  @Column("integer", { nullable: true })
  monotonicNumProposedApps!: number;

  @OneToMany(
    (type: any) => WithdrawCommitment,
    (withdrawalCommitment: WithdrawCommitment) => withdrawalCommitment.channel,
  )
  withdrawalCommitments!: WithdrawCommitment[];

  @OneToOne((type: any) => SetupCommitment, (commitment: SetupCommitment) => commitment.channel, {
    cascade: true,
  })
  setupCommitment!: SetupCommitment;

  @ManyToMany((type: any) => RebalanceProfile, (profile: RebalanceProfile) => profile.channels)
  @JoinTable()
  rebalanceProfiles!: RebalanceProfile[];

  @OneToMany((type: any) => OnchainTransaction, (tx: OnchainTransaction) => tx.channel)
  transactions!: OnchainTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
