import { BachsReconciliationAdapter } from "./billing-reconciliation.providers";
import type { BachsClient } from "./providers/bachs/bachs.client";
import type { BachsConfig } from "./providers/bachs/bachs.config";

describe("BachsReconciliationAdapter", () => {
  it("uses offset pagination when Bachs has_more without a next cursor", async () => {
    const listPayments = jest
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: "pay_1",
            reference: "ref_1",
            status: "succeeded",
            isRefundable: true,
            amount: "12.00",
            amountPaid: "12.00",
            amountRemaining: "0",
            settlementAmount: "11.00",
            currency: "USD",
            createdAt: "2026-10-16T12:00:00.000Z",
            updatedAt: "2026-10-16T12:00:00.000Z",
            metadata: {},
          },
        ],
        pagination: {
          nextCursor: null,
          previousCursor: null,
          hasMore: true,
          limit: 100,
          offset: 0,
        },
      })
      .mockResolvedValueOnce({
        items: [],
        pagination: {
          nextCursor: null,
          previousCursor: null,
          hasMore: false,
          limit: 100,
          offset: 200,
        },
      });
    const adapter = new BachsReconciliationAdapter(
      { listPayments } as unknown as BachsClient,
      { environment: "live" } as BachsConfig,
    );

    const first = await adapter.listPayments({ cursor: undefined });
    const second = await adapter.listPayments({ cursor: first.nextCursor! });

    expect(first).toMatchObject({ hasMore: true, nextCursor: "offset:100" });
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
    expect(listPayments).toHaveBeenNthCalledWith(1, {
      cursor: undefined,
      limit: 100,
    });
    expect(listPayments).toHaveBeenNthCalledWith(2, {
      offset: 100,
      limit: 100,
    });
    expect(first.items[0].amountMinor).toBe(1200n);
  });

  it("does not substitute the requested gross amount when paid amount is absent", async () => {
    const adapter = new BachsReconciliationAdapter(
      {
        listPayments: jest.fn().mockResolvedValue({
          items: [
            {
              id: "pay_pending",
              reference: null,
              status: "succeeded",
              isRefundable: false,
              amount: "12.00",
              amountPaid: null,
              amountRemaining: "12.00",
              settlementAmount: "0",
              currency: "USD",
              createdAt: "2026-10-16T12:00:00.000Z",
              updatedAt: "2026-10-16T12:00:00.000Z",
            },
          ],
          pagination: null,
        }),
      } as unknown as BachsClient,
      { environment: "live" } as BachsConfig,
    );

    const result = await adapter.listPayments({});
    expect(result.items[0].amountMinor).toBe(0n);
  });
});
