"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui";
import { Input } from "@/components/ui";
import { Label } from "@/components/ui";
import { Textarea } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Checkbox } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui";
import { useOrderStore } from "@/store/orderStore";
import { useEmployeeStore } from "@/store/employeeStore";
import { useCustomerStore } from "@/store/customerStore";
import { useTeamStore } from "@/store/teamStore";
import { CreateOrderData, OrderStatus } from "@/types/order";
import toast from "react-hot-toast";
import { useTranslation } from "@/hooks/useTranslation";
import TimeOnlyInput from "@/components/ui/TimeOnlyInput";
import { useSession } from "next-auth/react";
import OrderDescriptionForm from "./OrderDescriptionForm";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

interface Container {
  id?: string;
  serialNumber: string;
  cartonQuantity: number;
  articleQuantity: number;
  pieceQuantity: number;
  cartonPrice: number;
  piecePrice: number;
}

interface AddOrderDialogProps {
  trigger: React.ReactNode;
}

const AddOrderDialog: React.FC<AddOrderDialogProps> = ({ trigger }) => {
  const { t, ready } = useTranslation();
  const { data: session } = useSession();

  if (!ready) {
    return null;
  }
  const { createOrder } = useOrderStore();
  const { employees, fetchEmployees } = useEmployeeStore();
  const { customers, fetchCustomers } = useCustomerStore();
  const { teams, fetchTeams } = useTeamStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<any[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [activityPricingSelections, setActivityPricingSelections] = useState<Record<string, string>>({});
  const [templateData, setTemplateData] = useState<Record<string, string> | null>(null);
  const [containers, setContainers] = useState<Container[]>([]);
  const [pieceEntries, setPieceEntries] = useState<Array<{ id: string; activityId: string; quantity: number; notes: string }>>([]);
  const [hourEntries, setHourEntries] = useState<Array<{ id: string; activityId: string; quantity: number; notes: string }>>([]);
  const [cartonQuantity, setCartonQuantity] = useState<number>(0);
  const [pieceQuantity, setArticleQuantity] = useState<number>(0);
  const [formData, setFormData] = useState<CreateOrderData>({
    description: "",
    scheduledDate: "",
    startTime: "",
    endTime: "",
    duration: null,
    location: "",
    requiredEmployees: 1,
    priority: 1,
    specialInstructions: "",
    status: OrderStatus.DRAFT,
    customerId: "",
    assignedEmployeeIds: [],
  });
  const [startTimeOnly, setStartTimeOnly] = useState("09:00");
  const [endTimeOnly, setEndTimeOnly] = useState("");

  useEffect(() => {
    if (open) {
      fetchEmployees();
      fetchCustomers();
      fetchTeams();
    }
  }, [open, fetchEmployees, fetchCustomers, fetchTeams]);

  const fetchActivities = async () => {
    if (!formData.customerId) return;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pricing/customers/${formData.customerId}/activities`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      if (response.ok) {
        const jsonResponse = await response.json();
        // Handle wrapped response { success: true, data: [...] } or direct array
        const data = jsonResponse.data || jsonResponse;

        if (Array.isArray(data)) {
          const processedActivities = data.map((activity: any) => {
            // Map 'prices' to 'customerPrices' and calculate lowest price
            const prices = activity.prices || [];
            const lowestPrice = prices.length > 0 ? Math.min(...prices.map((p: any) => Number(p.price))) : 0;
            return { ...activity, customerPrices: prices, unitPrice: lowestPrice };
          });
          setActivities(processedActivities);
        } else {
          setActivities([]);
        }
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
      toast.error(t("activities.messages.loadError"));
    }
  };

  // Auto-fill location and fetch activities when customer is selected
  useEffect(() => {
    if (formData.customerId) {
      const selectedCustomer = customers.find(
        (c) => c.id === formData.customerId
      );
      if (selectedCustomer?.address) {
        const addressStr =
          typeof selectedCustomer.address === "string"
            ? selectedCustomer.address
            : Object.values(selectedCustomer.address)
              .filter(Boolean)
              .join(", ");
        setFormData((prev) => ({ ...prev, location: addressStr }));
      }
      fetchActivities();
      setSelectedActivities([]);
    }
  }, [formData.customerId, customers]);

  // Combine date and time when either changes
  useEffect(() => {
    if (formData.scheduledDate && startTimeOnly) {
      setFormData(prev => ({ ...prev, startTime: `${formData.scheduledDate}T${startTimeOnly}` }));
    }
  }, [formData.scheduledDate, startTimeOnly]);

  useEffect(() => {
    if (formData.scheduledDate && endTimeOnly) {
      setFormData(prev => ({ ...prev, endTime: `${formData.scheduledDate}T${endTimeOnly}` }));
    } else if (!endTimeOnly) {
      setFormData(prev => ({ ...prev, endTime: "" }));
    }
  }, [formData.scheduledDate, endTimeOnly]);

  const resetFormData = () => {
    setFormData({
      description: "",
      scheduledDate: "",
      startTime: "",
      endTime: "",
      duration: null,
      location: "",
      requiredEmployees: 1,
      priority: 1,
      specialInstructions: "",
      status: OrderStatus.DRAFT,
      customerId: "",
      assignedEmployeeIds: [],
    });
    setStartTimeOnly("09:00");
    setEndTimeOnly("");
    setSelectedActivities([]);
    setActivityPricingSelections({});
    setTemplateData(null);
    setContainers([]);
    setPieceEntries([]);
    setHourEntries([]);
    setCartonQuantity(0);
    setArticleQuantity(0);
    setCurrentStep(1);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (currentStep === 2 && selectedActivities.length === 0) {
      toast.error(t("admin.orders.form.selectActivityRequired"));
      return;
    }
    if (currentStep === 3) {
      const hasCartonOrArticle = isTypeSelected('PER_CARTON') || isTypeSelected('PER_ARTICLE');
      if (hasCartonOrArticle && containers.length === 0) {
        toast.error(t("admin.orders.form.addContainerRequired"));
        return;
      }
    }
    if (currentStep < 4) setCurrentStep(currentStep + 1);
  };

  const handlePrevious = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (!formData.customerId) newErrors.customerId = t("admin.orders.form.customerRequired");
    if (!formData.scheduledDate) newErrors.scheduledDate = t("admin.orders.form.scheduledDateRequired");
    if (!formData.priority || formData.priority < 1) newErrors.priority = t("admin.orders.form.priorityRequired");
    const hasCartonOrArticle = isTypeSelected('PER_CARTON') || isTypeSelected('PER_ARTICLE');
    if (hasCartonOrArticle && containers.length === 0) newErrors.containers = t("admin.orders.form.containerRequired");

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast.error(t("admin.orders.form.validationError"));
      return;
    }
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        activities: (() => {
          const allActivities: any[] = [];
          for (const activityId of selectedActivities) {
            const activity = activities.find(a => a.id === activityId);
            const selectedPricingType = getSelectedPricingType(activityId) ?? null;

            const baseActivity = {
              activityId,
              articleBasePrice: Number(activity?.articleBasePrice) || 0,
              basePrice: Number(activity?.basePrice) || 0,
              selectedPricingType,
              hourlyRate: Number(activity?.hourlyRate) || 0,
              perPiecePrice: Number(activity?.perPiecePrice) || 0,
              perArticlePrice: Number(activity?.perArticlePrice) || 0,
            };

            if (selectedPricingType === 'PER_CARTON' || selectedPricingType === 'PER_ARTICLE') {
              allActivities.push({
                ...baseActivity,
                quantity: containers.reduce((sum, c) => sum + c.cartonQuantity, 0),
              });
            } else if (selectedPricingType === 'PER_PIECE') {
              const entries = pieceEntries.filter(e => e.activityId === activityId);
              if (entries.length > 0) {
                entries.forEach(entry => {
                  allActivities.push({ ...baseActivity, quantity: entry.quantity, notes: entry.notes });
                });
              } else {
                allActivities.push({ ...baseActivity, quantity: 1, notes: "" });
              }
            } else if (selectedPricingType === 'HOURLY') {
              const entries = hourEntries.filter(e => e.activityId === activityId);
              if (entries.length > 0) {
                entries.forEach(entry => {
                  allActivities.push({ ...baseActivity, quantity: entry.quantity, notes: entry.notes });
                });
              } else {
                allActivities.push({ ...baseActivity, quantity: 1, notes: "" });
              }
            } else {
              allActivities.push({ ...baseActivity, quantity: 1 });
            }
          }
          return allActivities;
        })(),
        containers,
        cartonQuantity: containers.reduce((sum, c) => sum + c.cartonQuantity, 0),
        articleQuantity: containers.reduce((sum, c) => sum + c.articleQuantity, 0),
        pieceQuantity: containers.reduce((sum, c) => sum + c.pieceQuantity, 0),
        templateData: templateData
      };

      console.log('Submitting order with containers:', containers); // Debug log

      // Convert date and datetime-local to ISO format
      if (submitData.scheduledDate) {
        const dateStr = submitData.scheduledDate.includes("T")
          ? submitData.scheduledDate
          : submitData.scheduledDate + "T00:00:00";
        submitData.scheduledDate = new Date(dateStr).toISOString();
      }
      if (submitData.startTime) {
        submitData.startTime = new Date(submitData.startTime).toISOString();
      }
      if (submitData.endTime && submitData.endTime.trim()) {
        submitData.endTime = new Date(submitData.endTime).toISOString();
      } else {
        submitData.endTime = undefined;
      }

      const newOrder = await createOrder(submitData);
      setOpen(false);
      resetFormData();
      toast.success(t("admin.orders.form.createSuccess"));
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error(t("admin.orders.form.createError"));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof CreateOrderData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEmployeeToggle = (employeeId: string, checked: boolean) => {
    setFormData((prev) => {
      const currentAssigned = prev.assignedEmployeeIds || [];

      if (checked) {
        const employeeExists = employees.some(emp => emp.id === employeeId);
        if (!employeeExists) {
          toast.error(t("admin.orders.form.employeeNotAvailable"));
          return prev;
        }
        return {
          ...prev,
          assignedEmployeeIds: [...currentAssigned, employeeId]
        };
      } else {
        return {
          ...prev,
          assignedEmployeeIds: currentAssigned.filter((id) => id !== employeeId)
        };
      }
    });
  };

  const handleTeamChange = (teamId: string) => {
    if (teamId === "none") {
      handleInputChange("teamId", null);
      return;
    }
    
    const selectedTeam = teams.find(t => t.id === teamId);
    if (selectedTeam) {
      handleInputChange("teamId", teamId);
      
      // Auto-select all team members (EXCEPT THE LEADER)
      const memberIds = (selectedTeam.members || [])
        .filter(m => m.isActive && m.employeeId !== selectedTeam.teamLeaderId)
        .map(m => m.employeeId);
        
      if (memberIds.length === 0) {
        toast.error(t("admin.teams.messages.noActiveMembers"));
        return;
      }

      setFormData(prev => {
        const currentIds = prev.assignedEmployeeIds || [];
        // Add new team members while preserving existing custom assignments
        const newIds = Array.from(new Set([...currentIds, ...memberIds]));
        return {
          ...prev,
          assignedEmployeeIds: newIds
        };
      });
      
      toast.success(t("admin.orders.form.teamMembersAssigned", { name: selectedTeam.name }));
    }
  };

  const handleActivityToggle = (activityId: string, checked: boolean) => {
    setSelectedActivities(prev => {
      const nextActivities = checked
        ? [...prev, activityId]
        : prev.filter(id => id !== activityId);

      if (!checked) {
        setActivityPricingSelections(prev => {
          const next = { ...prev };
          delete next[activityId];
          return next;
        });
        setPieceEntries(p => p.filter(e => e.activityId !== activityId));
        setHourEntries(h => h.filter(e => e.activityId !== activityId));
      } else {
        // Auto-select first pricing type if available
        const activity = activities.find(a => a.id === activityId);
        if (activity?.pricingTypes?.length > 0) {
          setActivityPricingSelections(prev => ({ ...prev, [activityId]: activity.pricingTypes[0] }));
        }
      }
      
      // Update all prices for all containers when activities change
      setTimeout(() => {
        setContainers(currentContainers => {
          const updatedActivities = activities.filter(a => nextActivities.includes(a.id));
          const newArticlePrice = updatedActivities.reduce((total, a) => total + (Number(a.articleBasePrice) || 0), 0);
          const newBasePrice = updatedActivities.reduce((total, a) => total + (Number(a.basePrice) || 0), 0);

          return currentContainers.map(container => ({
            ...container,
            cartonPrice: calculateCartonPriceForQuantity(container.cartonQuantity, nextActivities),
            piecePrice: newArticlePrice,
            basePrice: newBasePrice
          }));
        });
      }, 0);
      
      return nextActivities;
    });
  };

  // Returns the selected pricing type for an activity, falling back to first available
  const getSelectedPricingType = (activityId: string) =>
    activityPricingSelections[activityId] ||
    activities.find(a => a.id === activityId)?.pricingTypes?.[0] ||
    null;

  // Collect all selected pricing types across all selected activities
  const getSelectedPricingTypes = () =>
    selectedActivities.map(id => getSelectedPricingType(id)).filter(Boolean) as string[];

  const isTypeSelected = (type: string) => getSelectedPricingTypes().includes(type);

  const hasPieceRate = () => isTypeSelected('PER_PIECE');

  const getCartonPriceTotal = () =>
    isTypeSelected('PER_CARTON')
      ? containers.reduce((sum, c) => sum + (c.cartonPrice || 0), 0)
      : 0;

  const getBasePriceTotal = () =>
    containers.reduce((sum, c) => sum + ((c as any).basePrice || 0), 0);

  const getArticlePriceTotal = () =>
    isTypeSelected('PER_ARTICLE')
      ? containers.reduce((sum, c) => sum + c.articleQuantity * (c.piecePrice || 0), 0)
      : 0;

  const getPiecePriceTotal = () =>
    isTypeSelected('PER_PIECE')
      ? containers.reduce((sum, c) => sum + c.pieceQuantity * (c.piecePrice || 0), 0)
      : 0;

  const getTotalPrice = () =>
    getCartonPriceTotal() + getBasePriceTotal() + getArticlePriceTotal() + getPiecePriceTotal();

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">{t("admin.orders.form.step1Title")}</h3>
        <p className="text-sm text-muted-foreground">{t("admin.orders.form.step1Description")}</p>
      </div>
      <div>
        <Label htmlFor="customerId">{t("admin.orders.form.customer")} *</Label>
        <Select
          value={formData.customerId}
          onValueChange={(value) => {
            handleInputChange("customerId", value);
            if (errors.customerId) setErrors(prev => ({ ...prev, customerId: "" }));
          }}
        >
          <SelectTrigger className={errors.customerId ? "border-red-500" : ""}>
            <SelectValue placeholder={t("admin.orders.form.selectCustomer")} />
          </SelectTrigger>
          <SelectContent>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.companyName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.customerId && <p className="text-sm text-red-500 mt-1">{errors.customerId}</p>}
      </div>
    </div>
  );

  const getPricingTypeLabel = (pt: string) => {
    const labels: Record<string, string> = {
      HOURLY: t('activities.pricingTypes.HOURLY'),
      PER_PIECE: t('activities.pricingTypes.PER_PIECE'),
      PER_CARTON: t('activities.pricingTypes.PER_CARTON'),
      PER_ARTICLE: t('activities.pricingTypes.PER_ARTICLE'),
    };
    return labels[pt] || pt;
  };

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">{t("admin.orders.form.step2Title")}</h3>
        <p className="text-sm text-muted-foreground">{t("admin.orders.form.step2Description")}</p>
      </div>
      <div>
        <Label>{t("admin.orders.form.activities")}</Label>
        <div className="text-sm text-muted-foreground mb-2">
          {t("admin.orders.form.activitiesSelected", { count: selectedActivities.length })}
        </div>
        <div className="max-h-72 overflow-y-auto border rounded-md p-3 space-y-3">
          {activities.map((activity) => (
            <div key={activity.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`activity-${activity.id}`}
                  checked={selectedActivities.includes(activity.id)}
                  onCheckedChange={(checked) => handleActivityToggle(activity.id, checked as boolean)}
                />
                <div className="flex-1">
                  <Label htmlFor={`activity-${activity.id}`} className="text-sm font-medium cursor-pointer">
                    {activity.name}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.orders.form.activityType")}: {activity.type?.replace(/_/g, ' ')} | {t("admin.orders.form.activityUnit")}: {activity.unit}
                  </p>
                  {activity.pricingTypes && activity.pricingTypes.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("activities.form.pricingTypes")}: {activity.pricingTypes.map((pt: string) => getPricingTypeLabel(pt)).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              {/* Pricing type selector — shown only when activity is selected and has multiple pricing types */}
              {selectedActivities.includes(activity.id) && activity.pricingTypes && activity.pricingTypes.length > 0 && (
                <div className="ml-6">
                  <Label className="text-xs">{t("admin.orders.form.selectPricingType")}</Label>
                  <Select
                    value={activityPricingSelections[activity.id] || activity.pricingTypes[0]}
                    onValueChange={(val) => setActivityPricingSelections(prev => ({ ...prev, [activity.id]: val }))}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activity.pricingTypes.map((pt: string) => (
                        <SelectItem key={pt} value={pt} className="text-xs">
                          {getPricingTypeLabel(pt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Show pricing info for selected type */}
                  {(() => {
                    const selectedPt = activityPricingSelections[activity.id] || activity.pricingTypes[0];
                    if (selectedPt === 'HOURLY') return (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("activities.form.hourlyRate")}: €{Number(activity.hourlyRate || 0).toFixed(2)}/h
                        {' · '}{t("admin.orders.form.hourlyBillingNote")}
                      </p>
                    );
                    if (selectedPt === 'PER_PIECE') return (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("activities.form.perPiecePrice")}: €{Number(activity.perPiecePrice || 0).toFixed(2)}
                      </p>
                    );
                    if (selectedPt === 'PER_CARTON' && activity.customerPrices?.length > 0) return (
                      <div className="mt-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1">{t("admin.orders.form.priceRanges")}:</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          {activity.customerPrices.map((price: any, idx: number) => (
                            <div key={idx} className="bg-muted/50 px-2 py-1 rounded">
                              {price.minQuantity}-{price.maxQuantity}: €{Number(price.price).toFixed(2)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                    if (selectedPt === 'PER_ARTICLE') return (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("activities.form.perArticlePrice")}: €{Number(activity.perArticlePrice || 0).toFixed(2)}
                      </p>
                    );
                    return null;
                  })()}
                </div>
              )}
            </div>
          ))}
          {activities.length === 0 && (
            <p className="text-sm text-gray-500">{t("admin.orders.form.noActivitiesAvailable")}</p>
          )}
        </div>
      </div>
    </div>
  );

  const calculateCartonPriceForQuantity = (cartonQuantity: number, activityIds?: string[]) => {
    const ids = activityIds || selectedActivities;
    // Only calculate carton price if PER_CARTON is selected for at least one activity
    const hasPerCarton = ids.some(id => {
      const sel = activityPricingSelections[id] || activities.find(a => a.id === id)?.pricingTypes?.[0];
      return sel === 'PER_CARTON';
    });
    if (!hasPerCarton) return 0;

    return ids.reduce((total, activityId) => {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) return total;
      const sel = activityPricingSelections[activityId] || activity.pricingTypes?.[0];
      if (sel !== 'PER_CARTON') return total;

      if (activity.customerPrices && activity.customerPrices.length > 0) {
        const applicablePrice = activity.customerPrices.find((p: any) =>
          cartonQuantity >= p.minQuantity && cartonQuantity <= p.maxQuantity
        );
        if (applicablePrice) return total + Number(applicablePrice.price);
      }
      return total + (Number(activity.unitPrice) || 0);
    }, 0);
  };

  const renderStep3 = () => {
    const addContainer = () => {
      // Calculate default article price from selected activities' article base prices
      const defaultArticlePrice = selectedActivities.reduce((total, activityId) => {
        const activity = activities.find(a => a.id === activityId);
        return total + (Number(activity?.articleBasePrice) || 0);
      }, 0);

      const defaultBasePrice = selectedActivities.reduce((total, activityId) => {
        const activity = activities.find(a => a.id === activityId);
        return total + (Number(activity?.basePrice) || 0);
      }, 0);

      const newContainer: Container & { basePrice?: number } = {
        serialNumber: `CONT-${Date.now()}`,
        cartonQuantity: 1,
        articleQuantity: 0,
        pieceQuantity: 0,
        cartonPrice: calculateCartonPriceForQuantity(1),
        piecePrice: defaultArticlePrice,
        basePrice: defaultBasePrice
      };
      setContainers([...containers, newContainer] as any);
    };

    const updateContainer = (index: number, field: keyof Container, value: any) => {
      const updated = [...containers];
      updated[index] = { ...updated[index], [field]: value };
      
      // Auto-calculate carton price when carton quantity changes
      if (field === 'cartonQuantity') {
        const cartonPrice = calculateCartonPriceForQuantity(value);
        updated[index].cartonPrice = cartonPrice;
      }
      
      setContainers(updated);
    };

    const removeContainer = (index: number) => {
      setContainers(containers.filter((_, i) => i !== index));
    };

    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold">{t("admin.orders.form.step3Title")}</h3>
          <p className="text-sm text-muted-foreground">{t("admin.orders.form.step3Description")}</p>
        </div>

        {(isTypeSelected('PER_CARTON') || isTypeSelected('PER_ARTICLE')) && (
          <>
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-medium">{t("admin.orders.form.containers")} ({containers.length})</h4>
                <p className="text-xs text-muted-foreground">
                  {selectedActivities
                    .filter(id => { const p = getSelectedPricingType(id); return p === 'PER_CARTON' || p === 'PER_ARTICLE'; })
                    .map(id => activities.find(a => a.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              <Button type="button" onClick={addContainer} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                {t("admin.orders.form.addContainer")}
              </Button>
            </div>

            {containers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <p>{t("admin.orders.form.noContainersAdded")}</p>
                <p className="text-sm">{t("admin.orders.form.clickAddContainer")}</p>
              </div>
            ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {containers.map((container, containerIndex) => (
              <div key={containerIndex} className="border rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <h5 className="font-medium">{t("admin.orders.form.container")} {containerIndex + 1}</h5>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeContainer(containerIndex)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t("admin.orders.form.serialNumber")}</Label>
                    <Input
                      value={container.serialNumber}
                      onChange={(e) => updateContainer(containerIndex, 'serialNumber', e.target.value)}
                      placeholder={t("admin.orders.form.serialNumberPlaceholder")}
                    />
                  </div>
                  <div>
                    <Label>{t("admin.orders.form.cartonQuantity")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={container.cartonQuantity}
                      onChange={(e) => updateContainer(containerIndex, 'cartonQuantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <Label>{t("admin.orders.form.articleQuantity")}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={container.articleQuantity}
                      onChange={(e) => updateContainer(containerIndex, 'articleQuantity', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>{t("admin.orders.form.cartonPrice")} (€) - {t("admin.orders.form.autoCalculated")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={container.cartonPrice}
                      readOnly
                      className="bg-gray-50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("admin.orders.form.basedOnActivitiesQuantity")}
                    </p>
                  </div>
                  {hasPieceRate() && (
                    <div>
                      <Label>{t("admin.orders.form.pieceQuantity")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={container.pieceQuantity}
                        onChange={(e) => updateContainer(containerIndex, 'pieceQuantity', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  )}
                  {containers[containerIndex] && (containers[containerIndex] as any).basePrice > 0 && (
                    <div>
                      <Label>{t("admin.orders.form.basePrice")} (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(containers[containerIndex] as any).basePrice}
                        readOnly
                        className="bg-gray-50"
                      />
                    </div>
                  )}
                  <div>
                    <Label>{t("admin.orders.form.piecePrice")+" (€)"}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={container.piecePrice}
                      readOnly
                      className="bg-gray-50"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("admin.orders.form.basedOnActivitiesBasePrice")}
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 p-3 rounded space-y-1">
                  <div className="text-sm font-medium">
                    {t("admin.orders.form.containerTotal")}: €{(
                      (isTypeSelected('PER_CARTON') ? container.cartonPrice : 0) +
                      ((container as any).basePrice || 0) +
                      (isTypeSelected('PER_ARTICLE') ? container.articleQuantity * container.piecePrice : 0) +
                      (isTypeSelected('PER_PIECE') ? container.pieceQuantity * container.piecePrice : 0)
                    ).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        )}

        {/* Per-activity sub-forms for HOURLY / PER_PIECE activities */}
        {selectedActivities.map((activityId) => {
          const activity = activities.find(a => a.id === activityId);
          const pt = getSelectedPricingType(activityId);
          if (pt !== 'HOURLY' && pt !== 'PER_PIECE') return null;

          const isHourly = pt === 'HOURLY';
          const entries = isHourly
            ? hourEntries.filter(e => e.activityId === activityId)
            : pieceEntries.filter(e => e.activityId === activityId);
          const setEntries = isHourly ? setHourEntries : setPieceEntries;

          const addEntry = () => setEntries(prev => [
            ...prev,
            { id: `${isHourly ? 'hour' : 'piece'}-${Date.now()}`, activityId, quantity: 1, notes: "" },
          ]);
          const updateEntry = (id: string, field: 'quantity' | 'notes', value: any) =>
            setEntries(prev => prev.map(en => en.id === id ? { ...en, [field]: value } : en));
          const removeEntry = (id: string) =>
            setEntries(prev => prev.filter(en => en.id !== id));

          return (
            <div key={activityId} className="space-y-4 border rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium">{activity?.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {activity?.type?.replace(/_/g, ' ')} · {getPricingTypeLabel(pt)} ({entries.length})
                  </p>
                </div>
                <Button type="button" onClick={addEntry} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("common.add", "Add")}
                </Button>
              </div>
              {entries.length > 0 && (
                <div className="space-y-4">
                  {entries.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                      <Button
                        type="button" variant="outline" size="sm" className="absolute top-2 right-2"
                        onClick={() => removeEntry(entry.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div>
                        <Label>{isHourly ? t("admin.orders.form.hours", "Hours") : t("admin.orders.form.pieceQuantity")}</Label>
                        <Input
                          type="number" min="1" step={isHourly ? "0.5" : "1"} value={entry.quantity}
                          onChange={(e) => updateEntry(entry.id, 'quantity', isHourly ? (parseFloat(e.target.value) || 0) : (parseInt(e.target.value) || 0))}
                        />
                      </div>
                      <div>
                        <Label>{t("common.notes", "Notes")}</Label>
                        <Input
                          value={entry.notes} placeholder={t("common.optional", "Optional")}
                          onChange={(e) => updateEntry(entry.id, 'notes', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {containers.length > 0 && (isTypeSelected('PER_CARTON') || isTypeSelected('PER_ARTICLE')) && (
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">{t("admin.orders.form.orderSummary")}</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>{t("admin.orders.form.totalContainers")}:</span>
                <span>{containers.length}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("admin.orders.form.totalCartons")}:</span>
                <span>{containers.reduce((sum, c) => sum + c.cartonQuantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t("admin.orders.form.totalArticles")}:</span>
                <span>{containers.reduce((sum, c) => sum + c.articleQuantity, 0)}</span>
              </div>
              <div className="border-t pt-1 mt-2 flex justify-between font-medium">
                <span>{t("admin.orders.form.containerTotal")}:</span>
                <span>€{getTotalPrice().toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStep4 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">{t("admin.orders.form.step4Title")}</h3>
        <p className="text-sm text-muted-foreground">{t("admin.orders.form.step4Description")}</p>
      </div>

      <OrderDescriptionForm
        customerId={formData.customerId}
        description={formData.description || ""}
        onDescriptionChange={(description) => handleInputChange("description", description)}
        onTemplateDataChange={setTemplateData}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="scheduledDate">{t("admin.orders.form.scheduledDate")} *</Label>
          <Input
            id="scheduledDate"
            type="date"
            value={formData.scheduledDate}
            onChange={(e) => {
              handleInputChange("scheduledDate", e.target.value);
              if (errors.scheduledDate) setErrors(prev => ({ ...prev, scheduledDate: "" }));
            }}
            className={errors.scheduledDate ? "border-red-500" : ""}
          />
          {errors.scheduledDate && <p className="text-sm text-red-500 mt-1">{errors.scheduledDate}</p>}
        </div>
        <div>
          <Label htmlFor="location">{t("admin.orders.form.location")}</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => handleInputChange("location", e.target.value)}
            placeholder={t("admin.orders.form.locationPlaceholder")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startTime">{t("admin.orders.form.startDateTime")}</Label>
          <TimeOnlyInput
            value={startTimeOnly}
            onChange={setStartTimeOnly}
          />
        </div>
        <div>
          <Label htmlFor="endTime">{t("admin.orders.form.endDateTime")} ({t("admin.orders.form.optional")})</Label>
          <TimeOnlyInput
            value={endTimeOnly}
            onChange={setEndTimeOnly}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="priority">{t("admin.orders.form.priority")} *</Label>
          <Input
            id="priority"
            type="number"
            min="1"
            value={formData.priority}
            onChange={(e) => {
              handleInputChange("priority", Number(e.target.value));
              if (errors.priority) setErrors(prev => ({ ...prev, priority: "" }));
            }}
            className={errors.priority ? "border-red-500" : ""}
          />
          {errors.priority && <p className="text-sm text-red-500 mt-1">{errors.priority}</p>}
        </div>
        <div>
          <Label htmlFor="duration">{t("admin.orders.form.duration")}</Label>
          <Input
            id="duration"
            type="number"
            min="0"
            step="0.5"
            value={formData.duration || ""}
            onChange={(e) =>
              handleInputChange(
                "duration",
                e.target.value ? Number(e.target.value) : null
              )
            }
          />
        </div>
      </div>

      <div>
        <Label>{t("admin.orders.form.assignTeam")}</Label>
        <Select
          value={formData.teamId || "none"}
          onValueChange={handleTeamChange}
        >
          <SelectTrigger className="mb-4">
            <SelectValue placeholder={t("admin.orders.form.selectTeam")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("admin.orders.form.noTeam")}</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name} ({team.members?.length || 0} {t("common.members")})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label>{t("admin.orders.form.assignEmployees")}</Label>
        <div className="text-sm text-muted-foreground mb-2">
          {t("admin.orders.form.employeesSelectedCount", { count: (formData.assignedEmployeeIds || []).length })}
        </div>

        <div className="border rounded-md p-3 space-y-4 max-h-[400px] overflow-y-auto">
          {/* Team Members Section (if a team is selected) */}
          {formData.teamId && formData.teamId !== "none" && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-primary/70">
                {t("admin.orders.form.teamMembers")}
              </h4>
              <div className="pl-1 space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                {employees
                  .filter(e => {
                    const selectedTeam = teams.find(t => t.id === formData.teamId);
                    return selectedTeam?.members?.some(m => m.employeeId === e.id && m.isActive);
                  })
                  .map((employee) => (
                    <div key={`team-member-${employee.id}`} className="flex items-center space-x-2">
                      <Checkbox
                        id={`team-member-${employee.id}`}
                        checked={(formData.assignedEmployeeIds || []).includes(employee.id)}
                        onCheckedChange={(checked) => handleEmployeeToggle(employee.id, checked as boolean)}
                      />
                      <Label htmlFor={`team-member-${employee.id}`} className="text-sm font-medium">
                        {employee.firstName} {employee.lastName} ({employee.employeeCode})
                        {teams.find(t => t.id === formData.teamId)?.teamLeaderId === employee.id && (
                          <span className="ml-2 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded italic">
                            Leader
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
              </div>
              <div className="h-px bg-border my-4" />
            </div>
          )}

          {/* Other Employees Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {formData.teamId && formData.teamId !== "none" 
                ? t("admin.orders.form.otherEmployees") 
                : t("common.all")}
            </h4>
            <div className="pl-1 space-y-2">
              {employees
                .filter(e => {
                  if (!formData.teamId || formData.teamId === "none") return true;
                  const selectedTeam = teams.find(t => t.id === formData.teamId);
                  return !selectedTeam?.members?.some(m => m.employeeId === e.id && m.isActive);
                })
                .map((employee) => (
                  <div key={`other-${employee.id}`} className="flex items-center space-x-2">
                    <Checkbox
                      id={`other-${employee.id}`}
                      checked={(formData.assignedEmployeeIds || []).includes(employee.id)}
                      onCheckedChange={(checked) => handleEmployeeToggle(employee.id, checked as boolean)}
                    />
                    <Label htmlFor={`other-${employee.id}`} className="text-sm">
                      {employee.firstName} {employee.lastName} ({employee.employeeCode})
                    </Label>
                  </div>
                ))}
            </div>
          </div>

          {employees.length === 0 && (
            <p className="text-sm text-gray-500">{t("admin.orders.form.noEmployeesAvailable")}</p>
          )}
        </div>
      </div>

      {/* Order Total Display */}
      {(selectedActivities.length > 0 || containers.length > 0) && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-green-800">{t("admin.orders.form.orderTotal")}:</span>
            <span className="text-2xl font-bold text-green-600">€{getTotalPrice().toFixed(2)}</span>
          </div>
          <div className="mt-2 text-sm text-green-700">
            {isTypeSelected('PER_CARTON') && getCartonPriceTotal() > 0 && (
              <div className="flex justify-between">
                <span>{t("admin.orders.form.activitiesCartonPrice")}:</span>
                <span>€{getCartonPriceTotal().toFixed(2)}</span>
              </div>
            )}
            {getBasePriceTotal() > 0 && (
              <div className="flex justify-between">
                <span>{t("admin.orders.form.basePrice")}:</span>
                <span>€{getBasePriceTotal().toFixed(2)}</span>
              </div>
            )}
            {isTypeSelected('PER_ARTICLE') && getArticlePriceTotal() > 0 && (
              <div className="flex justify-between">
                <span>{t("admin.orders.form.articlesTotalPrice")}:</span>
                <span>€{getArticlePriceTotal().toFixed(2)}</span>
              </div>
            )}
            {isTypeSelected('PER_PIECE') && getPiecePriceTotal() > 0 && (
              <div className="flex justify-between">
                <span>Per Piece Total:</span>
                <span>€{getPiecePriceTotal().toFixed(2)}</span>
              </div>
            )}
            {isTypeSelected('HOURLY') && (
              <div className="flex justify-between">
                <span>Hourly:</span>
                <span>{t("admin.orders.form.hourlyBillingNote")}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetFormData();
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("admin.orders.form.addNewOrder")}</DialogTitle>
          <div className="flex justify-center mt-4">
            <div className="flex items-center space-x-2">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${currentStep >= step ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}>
                    {step}
                  </div>
                  {step < 4 && <div className={`w-8 h-0.5 ${currentStep > step ? 'bg-primary' : 'bg-muted'
                    }`} />}
                </div>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && (
            <form id="order-form" onSubmit={handleSubmit} className="space-y-6">
              {renderStep4()}
            </form>
          )}

          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t("admin.orders.form.previous")}
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetFormData();
                  setOpen(false);
                }}
              >
                {t("admin.orders.form.cancel")}
              </Button>

              {currentStep < 4 ? (
                <Button type="button" onClick={handleNext}>
                  {t("admin.orders.form.next")}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={loading} form="order-form">
                  {loading ? t("admin.orders.form.creating") : t("admin.orders.form.createOrder")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddOrderDialog;
