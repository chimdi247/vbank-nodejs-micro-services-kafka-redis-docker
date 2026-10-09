import { AppDataSource } from '../data-source';
import { Brackets, Repository } from 'typeorm';
import axios from 'axios';

import { Transaction, TransactionType } from '../entity/transaction.entity';
import logger from '../config/logger';
import { createError } from '../utils';
import {
  BANK_CODE,
  ERROR_CODES,
  TRANSACTION_EVENT_TYPES,
  TransactionEventData,
  TransactionStatus,
} from '@vbank/constants';

import { publishTransactionEvent } from '../events/producers/transactionEvents.producer';
import { config } from '../config';
import {
  ExternalTransactionInboundDto,
  ExternalTransferReceiptDto,
  ExternalTransferTransactionDto,
  TransferTransactionDto,
} from '../types';

export class TransactionService {
  transactionRepository: Repository<Transaction>;

  constructor() {
    this.transactionRepository = AppDataSource.getRepository(Transaction);
  }

  async create(data: TransferTransactionDto): Promise<Transaction> {
    try {
      const transaction = new Transaction();
      transaction.userId = data.userId;
      transaction.sourceAccountNumber = data.sourceAccountNumber;
      transaction.destinationAccountNumber = data.destinationAccountNumber;
      transaction.amount = data.amount;
      transaction.transactionType = data.transactionType;
      transaction.note = data.note || '';
      transaction.status = TransactionStatus.INITIATED;

      await this.transactionRepository.save(transaction);

      logger.info(
        `transaction initiated with ID: ${transaction.transactionId}`,
      );

      await publishTransactionEvent({
        eventType: TRANSACTION_EVENT_TYPES.INITIATED,
        userId: transaction.userId,
        transactionId: transaction.transactionId,
        status: TransactionStatus.INITIATED,
        sourceAccountNumber: transaction.sourceAccountNumber,
        destinationAccountNumber: transaction.destinationAccountNumber,
        amount: transaction.amount,
        transactionType: transaction.transactionType,
        isInternal: transaction.isInternal,
      });

      return transaction;
    } catch (error) {
      logger.error('failed to create transaction', error);
      throw createError(
        'failed to create transaction',
        500,
        ERROR_CODES.TRANSACTION_FAILED,
      );
    }
  }

  async createExternal(
    data: ExternalTransferTransactionDto,
  ): Promise<Transaction> {
    try {
      const transaction = new Transaction();
      transaction.userId = data.userId;
      transaction.sourceAccountNumber = data.sourceAccountNumber;
      transaction.destinationAccountNumber = data.destinationAccountNumber;
      transaction.amount = data.amount;
      transaction.transactionType = data.transactionType;
      transaction.note = data.note || '';
      transaction.status = TransactionStatus.INITIATED;
      transaction.isSourceExternal = data.sourceBankCode !== BANK_CODE;
      transaction.isDestinationExternal =
        data.destinationBankCode !== BANK_CODE;
      transaction.sourceBankCode = data.sourceBankCode;
      transaction.destinationBankCode = data.destinationBankCode;
      transaction.referenceId = data.referenceId || '';
      transaction.isInternal = false;

      transaction.isInternal = !(
        transaction.isSourceExternal || transaction.isDestinationExternal
      );

      await this.transactionRepository.save(transaction);

      logger.info(
        `external transaction initiated with ID: ${transaction.transactionId} and reference ID: ${transaction.referenceId}`,
      );

      await publishTransactionEvent({
        eventType: TRANSACTION_EVENT_TYPES.INITIATED,
        userId: transaction.userId,
        transactionId: transaction.transactionId,
        status: TransactionStatus.INITIATED,
        sourceAccountNumber: transaction.sourceAccountNumber,
        destinationAccountNumber: transaction.destinationAccountNumber,
        amount: transaction.amount,
        transactionType: transaction.transactionType,
        isInternal: transaction.isInternal,
        sourceBankCode: transaction.sourceBankCode,
        destinationBankCode: transaction.destinationBankCode,
        isSourceExternal: transaction.isSourceExternal,
        isDestinationExternal: transaction.isDestinationExternal,
        referenceId: transaction.referenceId,
      });

      return transaction;
    } catch (error) {
      logger.error('failed to create external transaction', error);
      throw createError(
        'failed to create external transaction',
        500,
        ERROR_CODES.TRANSACTION_FAILED,
      );
    }
  }

  async updateStatus(
    transactionId: string,
    {
      status,
      errorDetails,
      sourceDebitedAt,
      destinationCreditedAt,
      compensatedAt,
      completedAt,
    }: {
      status: TransactionStatus;
      errorDetails?: string;
      sourceDebitedAt?: Date;
      destinationCreditedAt?: Date;
      compensatedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<Transaction> {
    let transaction = await this.getByTransactionId(transactionId);

    transaction.status = status;
    transaction.details = errorDetails || '';
    transaction.sourceDebitedAt =
      sourceDebitedAt || transaction.sourceDebitedAt;
    transaction.destinationCreditedAt =
      destinationCreditedAt || transaction.destinationCreditedAt;
    transaction.compensatedAt = compensatedAt || transaction.compensatedAt;
    transaction.completedAt = completedAt || transaction.completedAt;

    await this.transactionRepository.save(transaction);

    logger.info(`Transaction ${transactionId} status updated to '${status}'`);

    return transaction;
  }

  /**
   * Transactions the user initiated, plus any transaction that touches one of
   * the user's own accounts (e.g. money received from another customer).
   */
  async listForUser(
    userId: number,
    accountNumbers: string[],
    {
      limit = 20,
      offset = 0,
      accountNumber,
      status,
    }: {
      limit?: number;
      offset?: number;
      accountNumber?: string;
      status?: TransactionStatus;
    } = {},
  ): Promise<{ data: Transaction[]; total: number }> {
    const qb = this.transactionRepository
      .createQueryBuilder('t')
      .where(
        new Brackets((b) => {
          b.where('t.userId = :userId', { userId });
          if (accountNumbers.length) {
            b.orWhere('t.sourceAccountNumber IN (:...accs)', {
              accs: accountNumbers,
            });
            b.orWhere('t.destinationAccountNumber IN (:...accs)', {
              accs: accountNumbers,
            });
          }
        }),
      );

    if (accountNumber) {
      qb.andWhere(
        '(t.sourceAccountNumber = :acc OR t.destinationAccountNumber = :acc)',
        { acc: accountNumber },
      );
    }

    if (status) {
      qb.andWhere('t.status = :status', { status });
    }

    const [data, total] = await qb
      .orderBy('t.createdAt', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  /** account numbers owned by the calling user, fetched from the account service */
  async fetchUserAccountNumbers(authorization: string): Promise<string[]> {
    try {
      const response = await axios.get<{ accountNumber: string }[]>(
        `${config.ACCOUNT_SERVICE_URL}/api/v1/accounts`,
        { headers: { Authorization: authorization }, timeout: 5000 },
      );

      return response.data.map((a) => a.accountNumber);
    } catch (error) {
      logger.error('failed to fetch user accounts from account service', error);
      return [];
    }
  }

  async getByTransactionId(transactionId: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId },
    });

    if (!transaction) {
      throw createError(`Transaction ${transactionId} not found`, 404);
    }

    return transaction;
  }

  async getByReferenceId(referenceId: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { referenceId },
    });

    if (!transaction) {
      throw createError(`Transaction with ${referenceId} not found`, 404);
    }

    return transaction;
  }

  async externalCredit(data: TransactionEventData) {
    try {
      const response = await axios.post(
        `${config.CENTRAL_BANK_API_URL}/api/v1/transfers/inbound`,
        {
          sourceAccount: data.sourceAccountNumber,
          destinationAccount: data.destinationAccountNumber,
          sourceBankCode: data.sourceBankCode,
          destinationBankCode: data.destinationBankCode,
          amount: data.amount,
          callbackUrl: `${config.API_GATEWAY_URL}/api/v1/transactions/transfer/external/receipt`,
          referenceId: data.referenceId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': config.CENTRAL_BANK_API_KEY,
          },
        },
      );

      if (response.status !== 200) {
        logger.error('failed to credit external bank account', response.data);
        throw createError(
          'failed to credit external bank account' + response.data,
          500,
          ERROR_CODES.TRANSACTION_FAILED,
        );
      }

      return response;
    } catch (error) {
      logger.error('failed to credit external bank account', error);
      throw createError(
        'failed to credit external bank account',
        500,
        ERROR_CODES.TRANSACTION_FAILED,
      );
    }
  }

  async processExternalReceipt({
    referenceId,
    status,
    error,
    timestamp,
  }: ExternalTransferReceiptDto) {
    const transaction = await transactionService.getByReferenceId(referenceId);

    const eventData = {
      transactionId: transaction.transactionId,
      userId: transaction.userId,
      sourceAccountNumber: transaction.sourceAccountNumber,
      destinationAccountNumber: transaction.destinationAccountNumber,
      amount: transaction.amount,
      transactionType: transaction.transactionType,
      status: TransactionStatus.CREDIT_FAILED,
      isInternal: transaction.isInternal,
      isSourceExternal: transaction.isSourceExternal,
      isDestinationExternal: transaction.isDestinationExternal,
      referenceId: transaction.referenceId,
    };

    if (transaction.isDestinationExternal) {
      if (status === 'SUCCESS') {
        await this.updateStatus(transaction.transactionId, {
          status: TransactionStatus.CREDIT_SUCCESS,
          destinationCreditedAt: timestamp,
        });

        await publishTransactionEvent({
          ...eventData,
          eventType: TRANSACTION_EVENT_TYPES.ACCOUNT_CREDITED,
          destinationCreditedAt: timestamp,
        });
      }

      if (status === 'FAILED') {
        await this.updateStatus(transaction.transactionId, {
          status: TransactionStatus.CREDIT_FAILED,
          errorDetails: error,
        });

        await publishTransactionEvent({
          ...eventData,
          eventType: TRANSACTION_EVENT_TYPES.ACCOUNT_CREDIT_FAILED,
          error: error,
          errorCode: 'EXTERNAL_CREDIT_FAILED',
        });

        logger.error(
          `Failed to credit external account for transaction ${transaction.transactionId}: ${error}`,
        );
      }
    }
  }

  async processExternalInbound(data: ExternalTransactionInboundDto) {
    const transaction = new Transaction();
    transaction.sourceAccountNumber = data.sourceAccount;
    transaction.destinationAccountNumber = data.destinationAccount;
    transaction.amount = data.amount;
    transaction.transactionType = TransactionType.TRANSFER;
    transaction.note = data.note || '';
    transaction.status = TransactionStatus.INITIATED;
    transaction.isSourceExternal = data.sourceBankCode !== BANK_CODE;
    transaction.isDestinationExternal = data.destinationBankCode !== BANK_CODE;
    transaction.sourceBankCode = data.sourceBankCode;
    transaction.destinationBankCode = data.destinationBankCode;
    transaction.referenceId = data.referenceId;
    transaction.isInternal = false;

    transaction.isInternal = !(
      transaction.isSourceExternal || transaction.isDestinationExternal
    );

    try {
      await this.transactionRepository.save(transaction);

      logger.info(
        `external transaction initiated with ID: ${transaction.transactionId} and reference ID: ${transaction.referenceId}`,
      );

      await publishTransactionEvent({
        eventType: TRANSACTION_EVENT_TYPES.ACCOUNT_DEBITED,
        userId: transaction.userId,
        transactionId: transaction.transactionId,
        status: TransactionStatus.INITIATED,
        sourceAccountNumber: transaction.sourceAccountNumber,
        destinationAccountNumber: transaction.destinationAccountNumber,
        amount: transaction.amount,
        transactionType: transaction.transactionType,
        isInternal: transaction.isInternal,
        isSourceExternal: transaction.isSourceExternal,
        isDestinationExternal: transaction.isDestinationExternal,
        referenceId: transaction.referenceId,
        sourceDebitedAt: data.timestamp,
      });

      return transaction;
    } catch (error: any) {
      logger.error('failed to create external transaction', error);
      throw createError(
        'failed to create external transaction',
        500,
        ERROR_CODES.TRANSACTION_FAILED,
      );
    }
  }

  async notifyCentralBank(data: TransactionEventData) {
    try {
      const response = await axios.post(
        `${config.CENTRAL_BANK_API_URL}/api/v1/transfers/receipt/${data.referenceId}`,
        {
          // the event type is the source of truth: `status` on a forwarded event is stale
          status:
            data.eventType === TRANSACTION_EVENT_TYPES.ACCOUNT_CREDITED
              ? 'SUCCESS'
              : 'FAILED',
          error: data.error,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': config.CENTRAL_BANK_API_KEY,
          },
        },
      );

      if (response.status !== 200) {
        logger.error('failed to notify central bank', response.data);
        throw createError(
          'failed to notify central bank' + response.data,
          500,
          ERROR_CODES.TRANSACTION_FAILED,
        );
      }

      return response;
    } catch (error) {
      logger.error('failed to notify central bank', error);
      throw createError(
        'failed to notify central bank',
        500,
        ERROR_CODES.TRANSACTION_FAILED,
      );
    }
  }
}

export const transactionService = new TransactionService();
