"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, MapPin, User, Users, Clock, AlertCircle, Play } from "lucide-react";
import { 
  Button, 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinnerWithText } from "@/components/ui";
import { Order, OrderStatus } from "@/types/order";
import { useOrderStore } from "@/store/orderStore";
import { useEmployeeOrderStore } from "@/store/employee/employeeOrderStore";
import { OrderTimeline } from "./OrderTimeline";
import { OrderActions } from "./OrderActions";
import { OrderAssignments } from "./OrderAssignments";
import { OrderDetailSkeleton } from "./OrderDetailSkeleton";
import { OrderActivities } from "./OrderActivities";
import { OrderBillingPanel } from "./OrderBillingPanel";
import { useTranslation } from "@/hooks/useTranslation";
import { format } from "date-fns";
import { orderNotesApi } from "@/lib/orderNotesApi";
import { useTeamStore } from "@/store/teamStore";
import { TeamStartModal } from "@/components/modals/TeamStartModal";
import toast from "react-hot-toast";

interface OrderDetailPageProps {
  orderId: string;
  userRole: "ADMIN" | "EMPLOYEE";
}

const getStatusColor = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.DRAFT:
      return "bg-gray-100 text-gray-800";
    case OrderStatus.OPEN:
      return "bg-blue-100 text-blue-800";
    case OrderStatus.ACTIVE:
      return "bg-green-100 text-green-800";
    case OrderStatus.IN_PROGRESS:
      return "bg-yellow-100 text-yellow-800";
    case OrderStatus.IN_REVIEW:
      return "bg-orange-100 text-orange-800";
    case OrderStatus.COMPLETED:
      return "bg-emerald-100 text-emerald-800";
    case OrderStatus.CANCELLED:
      return "bg-red-100 text-red-800";
    case OrderStatus.EXPIRED:
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export const OrderDetailPage: React.FC<OrderDetailPageProps> = ({
  orderId,
  userRole,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignedStaffCount, setAssignedStaffCount] = useState<number>(0);
  const [dataFetched, setDataFetched] = useState(false);
  const [containers, setContainers] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshActivities, setRefreshActivities] = useState(0);
  const [isTeamStartModalOpen, setIsTeamStartModalOpen] = useState(false);

  const { orders, fetchOrders, getOrderEmployeeNames, getOrderContainers, updateOrderStatus, updateOrderTeam } = useOrderStore();
  const { employeeAssignments, fetchEmployeeAssignments } = useEmployeeOrderStore();
  const { teams, fetchTeams } = useTeamStore();

  useEffect(() => {
    if (userRole === "ADMIN") {
      fetchOrders();
      fetchTeams();
    } else {
      // For employees, get their assignments
      import("next-auth/react").then(m => m.getSession()).then(session => {
        if (session?.user?.id) {
          fetchEmployeeAssignments(session.user.id);
        }
      });
    }
  }, [orderId, userRole, fetchOrders, fetchEmployeeAssignments]);



  // Load containers data when order is found
  useEffect(() => {
    if (order?.id) {
      getOrderContainers(order.id).then(containerData => {
        console.log('Loaded containers:', containerData);
        setContainers(containerData);
      }).catch(error => {
        console.error('Failed to load containers:', error);
        setContainers([]);
      });
    }
  }, [order?.id, getOrderContainers]);

  // Update order when stores change
  useEffect(() => {
    if (userRole === "ADMIN") {
      if (orders.length > 0) {
        setDataFetched(true);
        const foundOrder = orders.find(o => o.id === orderId);
        if (foundOrder) {
          console.log('Order data:', foundOrder); // Debug log
          setOrder(foundOrder);
          setError(null);
        } else {
          setError("Order not found");
        }
        setLoading(false);
      }
    } else {
      if (employeeAssignments.length > 0) {
        setDataFetched(true);
        const assignment = employeeAssignments.find(a => a.order.id === orderId);
        if (assignment) {
          const orderData = assignment.order as any;
          console.log('Employee order data:', orderData); // Debug log
          // Use the order data from assignment, even if customer data is missing
          setOrder(orderData);
          setError(null);
          setLoading(false);
        } else {
          setError("Order not found or not assigned to you");
          setLoading(false);
        }
      }
    }
  }, [orders, employeeAssignments, orderId, userRole]);

  const handleBack = () => {
    const basePath = userRole === "ADMIN" ? "/dashboard-admin" : "/dashboard-employee";
    router.push(`${basePath}/orders`);
  };

  const handleStatusChange = async (newStatus: OrderStatus, note: string) => {
    setIsSubmitting(true);
    try {
      await orderNotesApi.createOrderNote(orderId, {
        content: note,
        triggersStatus: newStatus,
        category: "GENERAL_UPDATE",
        isInternal: false,
      });

      updateOrderStatus(orderId, newStatus);
      setRefreshActivities((prev) => prev + 1);
      
      // Refresh order data
      await fetchOrders();
      
      toast.success(`Order status updated to ${newStatus}`);
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update order status");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveOrder = () => {
    handleStatusChange(OrderStatus.COMPLETED, "Order approved and marked as completed.");
  };

  const handleRequestRevision = () => {
    handleStatusChange(OrderStatus.IN_PROGRESS, "Revision requested. Please review and resubmit.");
  };

  if (loading) {
    return <OrderDetailSkeleton />;
  }

  if (error || !order) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
{t("order.backToOrders")}
          </Button>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("order.orderNotFound")}</h3>
            <p className="text-muted-foreground">{error || t("order.orderNotFoundDesc")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
{t("order.backToOrders")}
        </Button>
      </div>

      {/* Order Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">Order #{order.orderNumber}</CardTitle>
              {!order.descriptionData?.descriptionData && (
                <p className="text-muted-foreground mt-1">
                  {order.description || t("order.noDescription")}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              <Badge className={`${getStatusColor(order.status)} text-sm w-fit`}>
                {t(`admin.orders.status.${order.status === 'IN_PROGRESS' ? 'inProgress' : order.status === 'IN_REVIEW' ? 'inReview' : order.status.toLowerCase()}`)}
              </Badge>

              {userRole === "ADMIN" && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] h-5 px-1 font-normal opacity-70">
                    {order.teamId ? (teams.find(t => t.id === order.teamId)?.name || t('admin.orders.form.teamAssigned')) : t('admin.orders.form.noTeam')}
                  </Badge>
                  <Select
                    value={order.teamId || "none"}
                    onValueChange={async (value) => {
                      const tid = value === "none" ? null : value;
                      try {
                        await updateOrderTeam(order.id, tid);
                        setOrder(prev => prev ? { ...prev, teamId: tid } : null);
                      } catch (err) {
                        console.error("Failed to update team:", err);
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-[120px] bg-muted/30">
                      <SelectValue placeholder="Change Team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Team</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {userRole === "ADMIN" && 
           (order.status === OrderStatus.OPEN || 
            order.status === OrderStatus.ACTIVE || 
            order.status === OrderStatus.IN_PROGRESS) && 
           order.employeeAssignments?.some(a => a.status === 'ASSIGNED') && (
            <div className="mb-4 pb-4 border-b flex justify-end">
              <Button 
                onClick={() => setIsTeamStartModalOpen(true)}
                className="bg-primary hover:bg-primary/90 text-white shadow-md transition-all hover:scale-105 font-medium"
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                {order.teamId ? t("order.teamStart") : t("order.startWork")}
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("order.scheduledDate")}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(order.scheduledDate), "MMM dd, yyyy")}
                </p>
                {order.startTime && (
                  <p className="text-xs text-muted-foreground">
                    {t("order.start")}: {format(new Date(order.startTime), "HH:mm")}
                  </p>
                )}
              </div>
            </div>
            
            {(order as any)?.customer?.companyName && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t("order.company")}</p>
                  <p className="text-sm text-muted-foreground">{(order as any).customer.companyName}</p>
                </div>
              </div>
            )}
            
            {order.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t("order.location")}</p>
                  <p className="text-sm text-muted-foreground">{order.location}</p>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("order.assignedStaff")}</p>
                <p className="text-sm text-muted-foreground">
                  {assignedStaffCount === 0 
                    ? t("order.noStaffAssigned") 
                    : assignedStaffCount === 1 
                      ? `1 ${t("order.personAssigned")}` 
                      : `${assignedStaffCount} ${t("order.peopleAssigned")}`
                  }
                </p>
              </div>
            </div>
            
            {order.duration ? (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t("order.duration")}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.duration} {order.duration === 1 ? t("order.hour") : t("order.hours")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t("order.priority")}</p>
                  <Badge variant="outline">P{order.priority}</Badge>
                </div>
              </div>
            )}
          </div>
          
          {order.specialInstructions && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">{t("order.specialInstructions")}</p>
              <p className="text-sm text-muted-foreground">{order.specialInstructions}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <div className={`grid grid-cols-1 gap-6 ${order.descriptionData?.descriptionData ? 'lg:grid-cols-2' : ''}`}>

      {/* Template Description Card */}
      {order.descriptionData?.descriptionData && (
        <Card>
          <CardHeader>
            <CardTitle>{t("order.description")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(order.descriptionData.descriptionData).map(
                ([key, value]) => (
                  <div
                    key={key}
                    className="flex justify-between gap-4 bg-muted rounded-md p-3 text-sm"
                  >
                    <span className="font-medium">{key}</span>
                    <span className="text-muted-foreground">{String(value)}</span>
                  </div>
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              ℹ️ {t("order.templateBasedDescription")}
            </p>
          </CardContent>
        </Card>
      )}
      {/* Containers Pricing */}
      {containers && containers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("order.containersPricing")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {containers.map((container: any, index: number) => (
                <div key={container.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">
                      {t("order.container")} {index + 1} - {container.serialNumber}
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">{t("order.cartonQuantity")}</p>
                          <p className="text-lg font-semibold">{container.cartonQuantity}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">€{Number(container.cartonPrice).toFixed(2)} × {container.cartonQuantity}</p>
                          <p className="text-sm font-semibold text-green-600">
                            Total: €{Number(container.cartonTotal).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 p-3 rounded">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">{t("order.articleQuantity")}</p>
                          <p className="text-lg font-semibold">{container.articleQuantity ?? 0}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">€{Number(container.articlePrice).toFixed(2)} × {container.articleQuantity}</p>
                          <p className="text-sm font-semibold text-green-600">
                            Total: €{Number(container.articleTotal).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {Number(container.hourlyTotal) > 0 && (
                      <div className="bg-muted/50 p-3 rounded col-span-1 md:col-span-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium">{t("order.hourlyBilling")}</p>
                            <p className="text-xs text-muted-foreground">{Number(container.totalActualHours).toFixed(2)}h × €{(Number(container.hourlyTotal) / (Number(container.totalActualHours) || 1)).toFixed(2)}/hr</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-green-600">
                              €{Number(container.hourlyTotal).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {Number(container.basePrice) > 0 && (
                      <div className="bg-muted/50 p-3 rounded col-span-1 md:col-span-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-medium">{t("order.activityBasePrice")}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-green-600">
                              €{Number(container.basePrice).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {container.articles && container.articles.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">{t("order.articles")}:</p>
                      <div className="space-y-1">
                        {container.articles.map((article: any, articleIndex: number) => (
                          <div key={articleIndex} className="flex justify-between items-center text-sm bg-muted/30 px-2 py-1 rounded">
                            <span>{article.articleName}</span>
                            <div className="flex gap-4">
                              <span className="text-muted-foreground">Qty: {article.quantity}</span>
                              <span className="font-medium">€{Number(article.price).toFixed(2)}</span>
                              <span className="font-semibold text-green-600">
                                €{(article.quantity * Number(article.price)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center font-semibold">
                      <span>{t("order.containerTotal")}:</span>
                      <span className="text-green-600">
                        €{Number(container.containerTotal).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activities - always list every activity in the order */}
      {(order as any)?.customerActivities && (order as any).customerActivities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("order.activitiesPricing")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(order as any).customerActivities.map((customerActivity: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">
                      {customerActivity.name || t("order.unknownActivity")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {customerActivity.type ? String(customerActivity.type).replace(/_/g, ' ') : ''}
                      {customerActivity.selectedPricingType
                        ? ` · ${String(customerActivity.selectedPricingType).replace(/_/g, ' ')}`
                        : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("order.quantity")}: {customerActivity.quantity || 1}
                      {customerActivity.notes ? ` — ${customerActivity.notes}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    {customerActivity.unitPrice != null && (
                      <>
                        <p className="font-medium text-lg">€{Number(customerActivity.unitPrice).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          Unit Price
                        </p>
                        {customerActivity.lineTotal != null && (
                          <p className="text-sm font-semibold text-green-600 mt-1">
                            {t("order.total")}: €{Number(customerActivity.lineTotal).toFixed(2)}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grand Total */}
      {containers?.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-medium">{t("order.containersTotal")}:</span>
                <span className="text-xl font-semibold text-blue-600">
                  €{containers.reduce((sum: number, c: any) => sum + Number(c.containerTotal || 0), 0).toFixed(2)}
                </span>
              </div>
              
              <div className="border-t pt-4">
                <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg border border-green-200">
                  <span className="text-2xl font-bold text-green-800">{t("order.grandTotal")}:</span>
                  <span className="text-3xl font-bold text-green-600">
                    €{containers.reduce((sum: number, c: any) => sum + Number(c.containerTotal || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {(!containers || containers.length === 0) && (!(order as any)?.customerActivities || (order as any).customerActivities.length === 0) && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            {t("order.noPricingInformation")}
          </CardContent>
        </Card>
      )}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Timeline & Activities */}
        <div className="lg:col-span-2 space-y-6">
          <OrderTimeline orderId={orderId} order={order} userRole={userRole} />
          <OrderActivities orderId={orderId} key={refreshActivities} />
        </div>

        {/* Right Column - Assignments & Review Actions */}
        <div className="space-y-6">
          {userRole === "ADMIN" && order.status === OrderStatus.IN_REVIEW && (
            <Card>
              <CardHeader>
                <CardTitle>Review Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  onClick={handleApproveOrder} 
                  disabled={isSubmitting}
                  className="w-full"
                >
                  Approve & Complete
                </Button>
                <Button 
                  onClick={handleRequestRevision} 
                  disabled={isSubmitting}
                  variant="outline"
                  className="w-full"
                >
                  Request Revision
                </Button>
              </CardContent>
            </Card>
          )}
          
          <OrderAssignments
            orderId={orderId}
            order={order}
            userRole={userRole}
            onAssignmentCountChange={setAssignedStaffCount}
            onRefresh={fetchOrders}
          />

          {userRole === "ADMIN" && order && (
            <OrderBillingPanel orderId={orderId} isAdmin={true} />
          )}
        </div>
      </div>
      
      {userRole === "ADMIN" && order && (
        <TeamStartModal
          isOpen={isTeamStartModalOpen}
          onClose={() => {
            setIsTeamStartModalOpen(false);
            fetchOrders();
          }}
          orderId={orderId}
          assignments={order.employeeAssignments || []}
        />
      )}
    </div>
  );
};