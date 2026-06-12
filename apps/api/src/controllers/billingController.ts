import { Request, Response } from 'express';
import { prisma } from '@repo/db';
import { Decimal } from 'decimal.js';
import { PricingMethod } from '../types/pricing';
import { computeBilling, computeOrderHourlyBilling } from '../services/billingService';
import { getCustomerPricingRules } from '../services/priceService';

// ==============================
// Order Billing
// ==============================

/**
 * GET /billing/orders/:orderId/summary
 */
export const getOrderBillingSummary = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, actualHours: true }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.actualHours) {
      await computeOrderHourlyBilling(orderId, order.customerId).catch(() => {});
    }

    const lineItems = await (prisma as any).billingLineItem.findMany({
      where: { orderId },
      include: {
        assignment: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
            customerActivity: { select: { id: true, name: true, selectedPricingType: true } }
          }
        },
        containerEmployee: {
          select: { id: true, employeeId: true, containerId: true }
        }
      },
      orderBy: { computedAt: 'desc' }
    });

    const totalByMethod: Record<string, number> = {
      [PricingMethod.HOURLY]: 0,
      [PricingMethod.PER_CARTON]: 0,
      [PricingMethod.PER_PIECE]: 0,
      [PricingMethod.PER_ARTICLE]: 0,
      [PricingMethod.QUANTITY]: 0
    };

    let grandTotal = new Decimal(0);
    let currency = 'EUR';

    for (const item of lineItems) {
      const lt = new Decimal(item.lineTotal.toString());
      totalByMethod[item.method] = new Decimal(totalByMethod[item.method] ?? 0).add(lt).toNumber();
      grandTotal = grandTotal.add(lt);
      currency = item.currency;
    }

    const hourlyLineItem = lineItems.find(
      (i: any) => i.method === PricingMethod.HOURLY && !i.assignmentId && !i.containerEmployeeId
    );

    res.json({
      orderId,
      actualHours: order.actualHours ? Number(order.actualHours) : null,
      hourlyRate: hourlyLineItem ? Number(hourlyLineItem.rate) : null,
      lineItems,
      totalByMethod,
      grandTotal: grandTotal.toNumber(),
      currency
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /billing/orders/:orderId/compute
 * Recomputes billing for all completed container-employees on the order.
 */
export const computeOrderBilling = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true }
    });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const results: { type: string; id: string; result: string }[] = [];

    try {
      const hourly = await computeOrderHourlyBilling(orderId, order.customerId);
      results.push({
        type: 'order',
        id: orderId,
        result: hourly
          ? `HOURLY: ${hourly.hours} hrs × €${hourly.rate} = €${hourly.lineTotal}`
          : 'skipped (no active rule with hourlyRate or no actualHours on order)'
      });
    } catch (err: any) {
      results.push({ type: 'order', id: orderId, result: `error: ${err.message}` });
    }

    const containers = await prisma.container.findMany({
      where: { orderId },
      include: { employeeAssignments: { where: { isCompleted: true } } }
    });

    for (const container of containers) {
      for (const ce of container.employeeAssignments) {
        try {
          const computed = await computeBilling({
            customerId: order.customerId,
            orderId,
            containerEmployeeId: ce.id
          });
          results.push({
            type: 'containerEmployee',
            id: ce.id,
            result: computed
              ? computed.map((r) => `${r.method}: €${r.lineTotal}`).join(', ')
              : 'skipped (no applicable rule)'
          });
        } catch (err: any) {
          results.push({ type: 'containerEmployee', id: ce.id, result: `error: ${err.message}` });
        }
      }
    }

    res.json({ orderId, computed: results.length, details: results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ==============================
// Customer Pricing Rules
// ==============================

export const listCustomerPricingRules = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const rules = await getCustomerPricingRules(customerId);
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /billing/customers/:customerId/rules
 * At least one rate (hourlyRate, cartonRate, pieceRate, articleRate) must be provided.
 * All rates are independent — any combination can be set on the same rule.
 */
export const createCustomerPricingRule = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { customerActivityId, hourlyRate, cartonRate, pieceRate, articleRate, effectiveFrom, effectiveTo } = req.body;

    if (!effectiveFrom) {
      return res.status(400).json({ error: 'effectiveFrom is required' });
    }

    if (!hourlyRate && !cartonRate && !pieceRate && !articleRate) {
      return res.status(400).json({
        error: 'At least one rate must be provided: hourlyRate, cartonRate, pieceRate, or articleRate'
      });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (customerActivityId) {
      const activity = await prisma.customerActivity.findFirst({
        where: { id: customerActivityId, customerId, orderId: null }
      });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found for this customer' });
      }
    }

    const rule = await (prisma as any).customerPricingRule.create({
      data: {
        customerId,
        customerActivityId: customerActivityId ?? null,
        hourlyRate: hourlyRate ? new Decimal(hourlyRate) : null,
        cartonRate: cartonRate ? new Decimal(cartonRate) : null,
        pieceRate: pieceRate ? new Decimal(pieceRate) : null,
        articleRate: articleRate ? new Decimal(articleRate) : null,
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        isActive: true
      },
      include: { customerActivity: { select: { id: true, name: true, type: true } } }
    });

    res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A pricing rule with this customer, activity, and effectiveFrom already exists' });
    }
    res.status(500).json({ error: error.message });
  }
};

/**
 * PUT /billing/customers/:customerId/rules/:ruleId
 */
export const updateCustomerPricingRule = async (req: Request, res: Response) => {
  try {
    const { customerId, ruleId } = req.params;
    const { hourlyRate, cartonRate, pieceRate, articleRate, effectiveTo, isActive } = req.body;

    const existing = await (prisma as any).customerPricingRule.findFirst({
      where: { id: ruleId, customerId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Pricing rule not found' });
    }

    const updated = await (prisma as any).customerPricingRule.update({
      where: { id: ruleId },
      data: {
        hourlyRate: hourlyRate !== undefined ? new Decimal(hourlyRate) : undefined,
        cartonRate: cartonRate !== undefined ? new Decimal(cartonRate) : undefined,
        pieceRate: pieceRate !== undefined ? new Decimal(pieceRate) : undefined,
        articleRate: articleRate !== undefined ? new Decimal(articleRate) : undefined,
        effectiveTo: effectiveTo !== undefined ? (effectiveTo ? new Date(effectiveTo) : null) : undefined,
        isActive: isActive !== undefined ? isActive : undefined
      },
      include: { customerActivity: { select: { id: true, name: true, type: true } } }
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * DELETE /billing/customers/:customerId/rules/:ruleId
 * Soft-deletes by setting isActive=false.
 */
export const deleteCustomerPricingRule = async (req: Request, res: Response) => {
  try {
    const { customerId, ruleId } = req.params;

    const existing = await (prisma as any).customerPricingRule.findFirst({
      where: { id: ruleId, customerId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Pricing rule not found' });
    }

    await (prisma as any).customerPricingRule.update({
      where: { id: ruleId },
      data: { isActive: false }
    });

    res.json({ success: true, message: 'Pricing rule deactivated' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
