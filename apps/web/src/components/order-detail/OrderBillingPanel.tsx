'use client';

import { useState, useEffect } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { OrderBillingSummary, PricingMethod } from '@/types/order';

interface OrderBillingPanelProps {
  orderId: string;
  isAdmin?: boolean;
}

const METHOD_LABELS: Record<PricingMethod, string> = {
  [PricingMethod.HOURLY]: 'Hourly',
  [PricingMethod.PER_CARTON]: 'Per Carton',
  [PricingMethod.PER_PIECE]: 'Per Piece',
  [PricingMethod.PER_ARTICLE]: 'Per Article',
  [PricingMethod.QUANTITY]: 'Quantity-Based'
};

const METHOD_BADGE_VARIANTS: Record<PricingMethod, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  [PricingMethod.HOURLY]: 'default',
  [PricingMethod.PER_CARTON]: 'secondary',
  [PricingMethod.PER_PIECE]: 'outline',
  [PricingMethod.PER_ARTICLE]: 'outline',
  [PricingMethod.QUANTITY]: 'secondary'
};

export const OrderBillingPanel = ({ orderId, isAdmin = false }: OrderBillingPanelProps) => {
  const [summary, setSummary] = useState<OrderBillingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    fetchSummary();
  }, [orderId]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<OrderBillingSummary>(`/api/billing/orders/${orderId}/summary`);
      setSummary(response);
    } catch {
      // Non-critical — silently ignore if no billing yet
    } finally {
      setLoading(false);
    }
  };

  const handleCompute = async () => {
    setComputing(true);
    try {
      await apiClient.post(`/api/billing/orders/${orderId}/compute`, {});
      toast.success('Billing computed successfully');
      await fetchSummary();
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.message || 'Failed to compute billing');
    } finally {
      setComputing(false);
    }
  };

  const getEmployeeName = (item: OrderBillingSummary['lineItems'][0]) => {
    if (item.assignment?.employee) {
      const { firstName, lastName } = item.assignment.employee;
      return [firstName, lastName].filter(Boolean).join(' ') || 'Employee';
    }
    if (item.containerEmployee) {
      return `Container ${item.containerEmployee.containerId.slice(-6)}`;
    }
    return '—';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Billing Summary
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchSummary} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={handleCompute} disabled={computing}>
                {computing ? 'Computing...' : 'Compute Billing'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Hourly billing breakdown — shown whenever actualHours is present */}
        {summary?.actualHours != null && summary.hourlyRate != null && (
          <div className="mb-4 rounded-md border bg-muted/40 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-muted-foreground">
                Hours worked: <span className="font-semibold text-foreground">{Number(summary.actualHours).toFixed(2)} hrs</span>
              </span>
              <span className="text-muted-foreground">
                Rate: <span className="font-semibold text-foreground">€{Number(summary.hourlyRate).toFixed(2)}/hr</span>
              </span>
            </div>
            <div className="text-sm font-semibold">
              = €{(Number(summary.actualHours) * Number(summary.hourlyRate)).toFixed(2)}
            </div>
          </div>
        )}

        {summary && summary.lineItems.length > 0 ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Employee / Container</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground">
                        {item.assignment?.customerActivity?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={METHOD_BADGE_VARIANTS[item.method]}>
                          {METHOD_LABELS[item.method]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.method === PricingMethod.HOURLY && !item.assignmentId && !item.containerEmployeeId
                          ? `${Number(item.quantity).toFixed(2)} hrs`
                          : getEmployeeName(item)}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.method === PricingMethod.HOURLY
                          ? `${Number(item.quantity).toFixed(2)} hrs`
                          : Number(item.quantity).toFixed(0)}
                      </TableCell>
                      <TableCell className="text-right">
                        €{Number(item.rate).toFixed(2)}
                        {item.method === PricingMethod.HOURLY ? '/hr' : ''}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        €{Number(item.lineTotal).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Grand total row */}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell colSpan={5} className="text-right">
                      Grand Total
                    </TableCell>
                    <TableCell className="text-right text-lg">
                      €{Number(summary.grandTotal).toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Method breakdown */}
            {Object.entries(summary.totalByMethod).some(([, v]) => v > 0) && (
              <div className="flex flex-wrap gap-3 pt-2 border-t text-sm text-muted-foreground">
                {Object.entries(summary.totalByMethod)
                  .filter(([, v]) => v > 0)
                  .map(([method, total]) => (
                    <span key={method}>
                      <Badge variant="outline" className="mr-1">{METHOD_LABELS[method as PricingMethod]}</Badge>
                      €{Number(total).toFixed(2)}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No billing computed yet</p>
            {isAdmin && (
              <p className="text-sm mt-1">
                Click &quot;Compute Billing&quot; to calculate charges for completed work
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderBillingPanel;
