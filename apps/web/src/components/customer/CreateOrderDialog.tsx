"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateOrderData, OrderStatus } from "@/types/order";
import toast from "react-hot-toast";
import { useTranslation } from "@/hooks/useTranslation";
import TimeOnlyInput from "@/components/ui/TimeOnlyInput";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

interface Container {
  id?: string;
  serialNumber: string;
  cartonQuantity: number;
  pieceQuantity: number;
  cartonPrice: number;
  piecePrice: number;
  basePrice: number;
}

interface CreateOrderDialogProps {
  trigger: React.ReactNode;
  onOrderCreated?: () => void;
}

interface CustomerActivity {
  id: string;
  name: string;
  type: string;
  code?: string;
  description?: string;
  unit: string;
  basePrice?: number;
  articleBasePrice?: number;
  unitPrice?: number;
  customerPrices?: Array<{
    minQuantity: number;
    maxQuantity: number;
    price: number;
  }>;
}

const CreateOrderDialog: React.FC<CreateOrderDialogProps> = ({
  trigger,
  onOrderCreated,
}) => {
  const { t, ready } = useTranslation();
  const { data: session } = useSession();

  if (!ready) return null;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [activityPricingSelections, setActivityPricingSelections] = useState<Record<string, string>>({});
  const [templateData, setTemplateData] = useState<Record<string, string> | null>(null);
  const [templateLines, setTemplateLines] = useState<string[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [pieceEntries, setPieceEntries] = useState<Array<{ id: string; activityId: string; quantity: number; notes: string }>>([]);
  const [hourEntries, setHourEntries] = useState<Array<{ id: string; activityId: string; quantity: number; notes: string }>>([]);

  const [formData, setFormData] = useState<CreateOrderData>({
    description: "",
    scheduledDate: "",
    startTime: "",
    endTime: "",
    location: "",
    specialInstructions: "",
    status: OrderStatus.DRAFT,
    customerId: "",
  });
  const [startTimeOnly, setStartTimeOnly] = useState("09:00");
  const [endTimeOnly, setEndTimeOnly] = useState("");

  useEffect(() => {
    if (open) {
      fetchCustomerData();
    }
  }, [open]);

  const fetchCustomerData = async () => {
    try {
      const [profileResponse, activitiesResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/customers/me`, {
          headers: { Authorization: `Bearer ${session?.accessToken}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/customers/me/activities`, {
          headers: { Authorization: `Bearer ${session?.accessToken}` },
        }),
      ]);

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        const customer = profileData.data;

        setFormData((prev) => ({
          ...prev,
          customerId: customer.id,
          location: typeof customer.address === "string"
            ? customer.address
            : Object.values(customer.address || {})
                .filter(Boolean)
                .join(", "),
        }));

        if (customer.descriptionTemplate?.templateLines) {
          setTemplateLines(customer.descriptionTemplate.templateLines);
          const initialTemplateData: Record<string, string> = {};
          customer.descriptionTemplate.templateLines.forEach((line: string) => {
            initialTemplateData[line] = "";
          });
          setTemplateData(initialTemplateData);
        }
      }

      if (activitiesResponse.ok) {
        const activitiesData = await activitiesResponse.json();
        const data = activitiesData.data || activitiesData;
        
        if (Array.isArray(data)) {
          const processedActivities = data.map((activity: any) => {
            const prices = activity.prices || [];
            const lowestPrice = prices.length > 0 ? Math.min(...prices.map((p: any) => Number(p.price))) : 0;
            return { 
              ...activity, 
              customerPrices: prices, 
              unitPrice: lowestPrice,
              basePrice: Number(activity.basePrice) || 0,
              articleBasePrice: Number(activity.articleBasePrice) || 0
            };
          });
          setActivities(processedActivities);
        } else {
          setActivities([]);
        }
      }
    } catch (error) {
      console.error("Error fetching customer data:", error);
      toast.error(t("messages.error"));
    }
  };

  useEffect(() => {
    if (formData.scheduledDate && startTimeOnly) {
      setFormData((prev) => ({
        ...prev,
        startTime: `${formData.scheduledDate}T${startTimeOnly}`,
      }));
    }
  }, [formData.scheduledDate, startTimeOnly]);

  useEffect(() => {
    if (formData.scheduledDate && endTimeOnly) {
      setFormData((prev) => ({
        ...prev,
        endTime: `${formData.scheduledDate}T${endTimeOnly}`,
      }));
    } else if (!endTimeOnly) {
      setFormData((prev) => ({ ...prev, endTime: "" }));
    }
  }, [formData.scheduledDate, endTimeOnly]);

  const resetFormData = () => {
    setFormData({
      description: "",
      scheduledDate: "",
      startTime: "",
      endTime: "",
      location: "",
      specialInstructions: "",
      status: OrderStatus.DRAFT,
      customerId: "",
    });
    setStartTimeOnly("09:00");
    setEndTimeOnly("");
    setSelectedActivities([]);
    setActivityPricingSelections({});
    setTemplateData(null);
    setContainers([]);
    setPieceEntries([]);
    setHourEntries([]);
    setCurrentStep(1);
    setErrors({});
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (currentStep === 1 && selectedActivities.length === 0) {
      toast.error(t("customerPortal.createOrder.activitiesRequired"));
      return;
    }
    if (currentStep === 2) {
      const hasCartonOrArticle = isTypeSelected('PER_CARTON') || isTypeSelected('PER_ARTICLE');
      if (hasCartonOrArticle && containers.length === 0) {
        toast.error(t("customerPortal.createOrder.containerRequired"));
        return;
      }
    }
    if (currentStep < 3) setCurrentStep(currentStep + 1);
  };

  const handlePrevious = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.scheduledDate) {
      toast.error(t("customerPortal.createOrder.scheduledDateRequired"));
      return;
    }

    const hasCartonOrArticle = isTypeSelected('PER_CARTON') || isTypeSelected('PER_ARTICLE');
    if (hasCartonOrArticle && containers.length === 0) {
      toast.error(t("customerPortal.createOrder.containerRequired"));
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        description: formData.description || "",
        scheduledDate: new Date(formData.scheduledDate + "T00:00:00").toISOString(),
        startTime: formData.scheduledDate && startTimeOnly ? 
          new Date(`${formData.scheduledDate}T${startTimeOnly}`).toISOString() : null,
        endTime: formData.scheduledDate && endTimeOnly ? 
          new Date(`${formData.scheduledDate}T${endTimeOnly}`).toISOString() : null,
        location: formData.location || "",
        specialInstructions: formData.specialInstructions || "",
        customerId: formData.customerId,
        activities: (() => {
          const allActivities: any[] = [];
          for (const activityId of selectedActivities) {
            const activity = activities.find(a => a.id === activityId);
            const selectedPricingType = getSelectedPricingType(activityId) ?? null;

            const baseActivity = {
              activityId,
              basePrice: Number(activity?.basePrice) || 0,
              articleBasePrice: Number(activity?.articleBasePrice) || 0,
              selectedPricingType,
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
        pieceQuantity: containers.reduce((sum, c) => sum + c.pieceQuantity, 0),
        templateData: templateData
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/customers/me/orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.accessToken}`,
          },
          body: JSON.stringify(submitData),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Order creation failed:", response.status, errorText);
        throw new Error(`Failed to create order: ${response.status}`);
      }

      const result = await response.json();
      
      
      toast.success(t("customerPortal.createOrder.orderCreatedSuccess"));

      setTimeout(() => setOpen(false), 0);

      onOrderCreated?.();
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error(error instanceof Error ? error.message : t("customerPortal.createOrder.orderCreationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof CreateOrderData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleActivityToggle = (activityId: string, checked: boolean) => {
    setSelectedActivities(prev => {
      const newActivities = checked
        ? [...prev, activityId]
        : prev.filter(id => id !== activityId);

      if (checked) {
        const activity = activities.find(a => a.id === activityId);
        if ((activity as any)?.pricingTypes?.length > 0) {
          setActivityPricingSelections(p => ({ ...p, [activityId]: (activity as any).pricingTypes[0] }));
        }
      } else {
        setActivityPricingSelections(p => { const n = { ...p }; delete n[activityId]; return n; });
        setPieceEntries(prev => prev.filter(e => e.activityId !== activityId));
        setHourEntries(prev => prev.filter(e => e.activityId !== activityId));
      }

      // Update both carton and article prices for all containers when activities change
      setTimeout(() => {
        setContainers(currentContainers => 
          currentContainers.map(container => {
            const cartonPrice = calculateCartonPriceForQuantity(container.cartonQuantity, newActivities);
            const piecePrice = newActivities.reduce((total, activityId) => {
              const activity = activities.find(a => a.id === activityId);
              return total + (Number(activity?.articleBasePrice) || 0);
            }, 0);
            const basePrice = newActivities.reduce((total, activityId) => {
              const activity = activities.find(a => a.id === activityId);
              return total + (Number(activity?.basePrice) || 0);
            }, 0);
            
            return {
              ...container,
              cartonPrice,
              piecePrice,
              basePrice
            };
          })
        );
      }, 0);
      
      return newActivities;
    });
  };

  const calculateCartonPriceForQuantity = (cartonQuantity: number, activityIds: string[] = selectedActivities) => {
    return activityIds.reduce((total, activityId) => {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) return total;

      // Find price based on carton quantity range
      if (activity.customerPrices && activity.customerPrices.length > 0) {
        const applicablePrice = activity.customerPrices.find((p: any) =>
          cartonQuantity >= p.minQuantity && cartonQuantity <= p.maxQuantity
        );
        if (applicablePrice) {
          return total + Number(applicablePrice.price);
        }
      }

      return total + (Number(activity.unitPrice) || 0);
    }, 0);
  };

  const handleTemplateDataChange = (line: string, value: string) => {
    setTemplateData(prev => ({
      ...prev,
      [line]: value
    }));
  };

  const getPricingTypeLabel = (pt: string) => {
    const labels: Record<string, string> = {
      HOURLY: t('activities.pricingTypes.HOURLY'),
      PER_PIECE: t('activities.pricingTypes.PER_PIECE'),
      PER_CARTON: t('activities.pricingTypes.PER_CARTON'),
      PER_ARTICLE: t('activities.pricingTypes.PER_ARTICLE'),
    };
    return labels[pt] || pt;
  };

  const getSelectedPricingType = (activityId: string): string | undefined =>
    activityPricingSelections[activityId] || ((activities.find(a => a.id === activityId) as any)?.pricingTypes?.[0]);

  const getSelectedPricingTypes = () =>
    selectedActivities.map(id => getSelectedPricingType(id)).filter(Boolean) as string[];

  const isTypeSelected = (type: string) => getSelectedPricingTypes().includes(type);

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">{t("customerPortal.createOrder.step1Title")}</h3>
        <p className="text-sm text-muted-foreground">{t("customerPortal.createOrder.step1Description")}</p>
      </div>
      <div>
        <Label>{t("customerPortal.createOrder.selectActivities")}</Label>
        <div className="text-sm text-muted-foreground mb-2">
          {selectedActivities.length}{" "}
          {t("customerPortal.createOrder.activitiesSelected")}
        </div>
        <div className="max-h-72 overflow-y-auto border rounded-md p-3 space-y-3">
          {activities.map((activity) => (
            <div key={activity.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`activity-${activity.id}`}
                  checked={selectedActivities.includes(activity.id)}
                  onCheckedChange={(checked) =>
                    handleActivityToggle(activity.id, checked as boolean)
                  }
                />
                <div className="flex-1">
                  <Label htmlFor={`activity-${activity.id}`} className="text-sm font-medium cursor-pointer">
                    {activity.name}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.orders.form.activityType")}: {activity.type?.replace(/_/g, ' ')} | {t("admin.orders.form.activityUnit")}: {activity.unit}
                  </p>
                  {(activity as any).pricingTypes?.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("activities.form.pricingTypes")}: {(activity as any).pricingTypes.map((pt: string) => getPricingTypeLabel(pt)).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              {selectedActivities.includes(activity.id) && (activity as any).pricingTypes?.length > 0 && (
                <div className="ml-6">
                  <Label className="text-xs">{t("admin.orders.form.selectPricingType")}</Label>
                  <Select
                    value={activityPricingSelections[activity.id] || (activity as any).pricingTypes[0]}
                    onValueChange={(val) => setActivityPricingSelections(prev => ({ ...prev, [activity.id]: val }))}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(activity as any).pricingTypes.map((pt: string) => (
                        <SelectItem key={pt} value={pt} className="text-xs">
                          {getPricingTypeLabel(pt)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
          {activities.length === 0 && (
            <p className="text-sm text-gray-500">{t("customerPortal.createOrder.noActivitiesAvailable")}</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => {
    const addContainer = () => {
      // Calculate default article price from selected activities' base prices
      const defaultArticlePrice = selectedActivities.reduce((total, activityId) => {
        const activity = activities.find(a => a.id === activityId);
        return total + (Number(activity?.articleBasePrice) || 0);
      }, 0);

      const defaultBasePrice = selectedActivities.reduce((total, activityId) => {
        const activity = activities.find(a => a.id === activityId);
        return total + (Number(activity?.basePrice) || 0);
      }, 0);

      const newContainer: Container = {
        serialNumber: `CONT-${Date.now()}`,
        cartonQuantity: 1,
        pieceQuantity: 1,
        cartonPrice: calculateCartonPriceForQuantity(1),
        piecePrice: defaultArticlePrice,
        basePrice: defaultBasePrice
      };
      setContainers([...containers, newContainer]);
    };

    const updateContainer = (index: number, field: keyof Container, value: any) => {
      const updated = [...containers];
      updated[index] = { ...updated[index], [field]: value };
      
      // Auto-calculate prices when quantities change
      if (field === 'cartonQuantity') {
        const cartonPrice = calculateCartonPriceForQuantity(value);
        updated[index].cartonPrice = cartonPrice;
      }
      
      // Update article price based on selected activities
      const calculatedArticlePrice = selectedActivities.reduce((total, activityId) => {
        const activity = activities.find(a => a.id === activityId);
        return total + (Number(activity?.articleBasePrice) || 0);
      }, 0);

      const calculatedBasePrice = selectedActivities.reduce((total, activityId) => {
        const activity = activities.find(a => a.id === activityId);
        return total + (Number(activity?.basePrice) || 0);
      }, 0);

      updated[index].piecePrice = calculatedArticlePrice;
      updated[index].basePrice = calculatedBasePrice;
      
      setContainers(updated);
    };

    const removeContainer = (index: number) => {
      setContainers(containers.filter((_, i) => i !== index));
    };

    return (
      <div className="space-y-4">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold">{t("customerPortal.createOrder.step2Title")}</h3>
          <p className="text-sm text-muted-foreground">{t("customerPortal.createOrder.step2Description")}</p>
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
                    <Label>{t("admin.orders.form.pieceQuantity")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={container.pieceQuantity}
                      onChange={(e) => updateContainer(containerIndex, 'pieceQuantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <div className="bg-muted/50 p-3 rounded">
                  <div className="text-sm font-medium">
                    {t("customerPortal.createOrder.containerSummary")}: {container.cartonQuantity} {t("customerPortal.createOrder.cartons")}, {container.pieceQuantity} {t("customerPortal.createOrder.articles")}
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
                <span>{containers.reduce((sum, c) => sum + c.pieceQuantity, 0)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">{t("customerPortal.createOrder.step3Title")}</h3>
        <p className="text-sm text-muted-foreground">{t("customerPortal.createOrder.step3Description")}</p>
      </div>

      {/* Scheduled Date */}
      <div>
        <Label htmlFor="scheduledDate">
          {t("customerPortal.createOrder.scheduledDate")} *
        </Label>
        <Input
          id="scheduledDate"
          type="date"
          value={formData.scheduledDate}
          onChange={(e) => {
            handleInputChange("scheduledDate", e.target.value);
            setErrors(prev => ({ ...prev, scheduledDate: "" }));
          }}
          className={errors.scheduledDate ? "border-red-500" : ""}
          required
        />
        {errors.scheduledDate && (
          <p className="text-sm text-red-500 mt-1">
            {errors.scheduledDate}
          </p>
        )}
      </div>

      {/* Time Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startTime">
            {t("customerPortal.createOrder.startTime")}
          </Label>
          <TimeOnlyInput
            value={startTimeOnly}
            onChange={setStartTimeOnly}
          />
        </div>
        <div>
          <Label htmlFor="endTime">
            {t("customerPortal.createOrder.endTime")}
          </Label>
          <TimeOnlyInput value={endTimeOnly} onChange={setEndTimeOnly} />
        </div>
      </div>

      {/* Location */}
      <div>
        <Label htmlFor="location">
          {t("customerPortal.createOrder.location")}
        </Label>
        <Input
          id="location"
          value={formData.location}
          onChange={(e) => handleInputChange("location", e.target.value)}
          placeholder={t("customerPortal.createOrder.locationPlaceholder")}
        />
      </div>

      {/* Template Data (if available) */}
      {templateLines.length > 0 && (
        <div>
          <Label>
            {t("customerPortal.createOrder.serviceRequirements")}
          </Label>
          <div className="space-y-2">
            {templateLines.map((line) => (
              <div key={line}>
                <Label htmlFor={`template-${line}`} className="text-sm">
                  {line}
                </Label>
                <Input
                  id={`template-${line}`}
                  value={templateData?.[line] || ""}
                  onChange={(e) =>
                    handleTemplateDataChange(line, e.target.value)
                  }
                  placeholder={`${t("customerPortal.createOrder.enter")} ${line.toLowerCase()}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description/Special Instructions */}
      <div>
        <Label htmlFor="specialInstructions">
          {t("customerPortal.createOrder.specialInstructions")}
        </Label>
        <Textarea
          id="specialInstructions"
          value={formData.specialInstructions}
          onChange={(e) =>
            handleInputChange("specialInstructions", e.target.value)
          }
          placeholder={t(
            "customerPortal.createOrder.specialInstructionsPlaceholder"
          )}
          rows={3}
        />
      </div>
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
          <DialogTitle>{t("customerPortal.createOrder.title")}</DialogTitle>
          <div className="flex justify-center mt-4">
            <div className="flex items-center space-x-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep >= step ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {step}
                  </div>
                  {step < 3 && <div className={`w-8 h-0.5 ${
                    currentStep > step ? 'bg-primary' : 'bg-muted'
                  }`} />}
                </div>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && (
            <form id="order-form" onSubmit={handleSubmit} className="space-y-6">
              {renderStep3()}
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
              {t("common.previous")}
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
                {t("customerPortal.createOrder.cancel")}
              </Button>

              {currentStep < 3 ? (
                <Button type="button" onClick={handleNext}>
                  {t("common.next")}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={loading} form="order-form">
                  {loading
                    ? t("customerPortal.createOrder.creating")
                    : t("customerPortal.createOrder.createOrder")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateOrderDialog;