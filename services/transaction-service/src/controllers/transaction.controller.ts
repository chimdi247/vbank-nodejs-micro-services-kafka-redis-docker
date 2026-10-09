import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { TransactionType } from '../entity/transaction.entity';
import {
  TransactionService,
  transactionService,
} from '../services/transaction.service';
import logger from '../config/logger';
import { createError } from '../utils';
import { nanoid } from 'nanoid';
import { TransactionStatus } from '@vbank/constants';

const transferSchema = z.object({
  sourceAccountNumber: z.string().min(15, 'source account number is required'),
  destinationAccountNumber: z
    .string()
    .min(15, 'destination account number is required'),
  amount: z.number().positive('Amount must be greater than zero'),
  note: z.string().optional(),
});

const transferExternalSchema = transferSchema.extend({
  sourceBankCode: z.string(),
  destinationBankCode: z.string(),
  referenceId: z.string().optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  accountNumber: z.string().length(15).optional(),
  status: z.nativeEnum(TransactionStatus).optional(),
});

export class TransactionController {
  transactionService: TransactionService;

  constructor(transactionService: TransactionService) {
    this.transactionService = transactionService;
  }

  async transfer(req: Request, res: Response, next: NextFunction) {
    const {
      sourceAccountNumber,
      destinationAccountNumber,
      amount,
      note = '',
    } = transferSchema.parse(req.body);

    const userId = req.userId;

    const transaction = await this.transactionService.create({
      userId,
      sourceAccountNumber,
      destinationAccountNumber,
      amount,
      transactionType: TransactionType.TRANSFER,
      note,
    });

    logger.info(`created new transaction: ${transaction.transactionId}`);

    res.status(201).json({
      transactionId: transaction.transactionId,
      status: transaction.status,
    });
  }

  async transferExternalOutbound(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const {
      sourceAccountNumber,
      destinationAccountNumber,
      amount,
      note = '',
      sourceBankCode,
      destinationBankCode,
      referenceId,
    } = transferExternalSchema.parse(req.body);

    const userId = req.userId;

    const transaction = await this.transactionService.createExternal({
      userId,
      sourceAccountNumber,
      destinationAccountNumber,
      amount,
      transactionType: TransactionType.TRANSFER,
      note,
      sourceBankCode,
      destinationBankCode,
      referenceId: referenceId || nanoid(),
    });

    logger.info(
      `created new external transaction: ${transaction.transactionId}`,
    );

    res.status(201).json({
      transactionId: transaction.transactionId,
      status: transaction.status,
      referenceId: transaction.referenceId,
    });
  }

  async list(req: Request, res: Response, next: NextFunction) {
    const query = listSchema.parse(req.query);

    const accountNumbers = await this.transactionService.fetchUserAccountNumbers(
      req.headers.authorization as string,
    );

    // never expose transactions of an account the caller does not own
    if (query.accountNumber && !accountNumbers.includes(query.accountNumber)) {
      throw createError('account not found', 404);
    }

    const result = await this.transactionService.listForUser(
      req.userId,
      accountNumbers,
      query,
    );

    res.status(200).json({ ...result, limit: query.limit, offset: query.offset });
  }

  async getByTransactionId(req: Request, res: Response, next: NextFunction) {
    const { transactionId } = req.params;

    const transaction =
      await transactionService.getByTransactionId(transactionId);

    if (!transaction) {
      throw createError(`Transaction ${transactionId} not found`, 404);
    }

    if (transaction.userId !== req.userId) {
      const accountNumbers =
        await this.transactionService.fetchUserAccountNumbers(
          req.headers.authorization as string,
        );

      const touchesOwnAccount =
        accountNumbers.includes(transaction.sourceAccountNumber) ||
        accountNumbers.includes(transaction.destinationAccountNumber);

      if (!touchesOwnAccount) {
        throw createError('Unauthorized', 403);
      }
    }

    res.status(200).json(transaction);
  }

  async getByReferenceId(req: Request, res: Response, next: NextFunction) {
    const { referenceId } = req.params;

    const transaction =
      await this.transactionService.getByReferenceId(referenceId);

    if (!transaction) {
      throw createError(
        `Transaction with reference ID ${referenceId} not found`,
        404,
      );
    }

    if (transaction.userId && transaction.userId !== req.userId) {
      throw createError('Unauthorized', 403);
    }

    res.status(200).json(transaction);
  }
}
