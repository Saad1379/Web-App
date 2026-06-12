export enum OrderStatus {
  DRAFT = "DRAFT",
  OPEN = "OPEN",
  ACTIVE = "ACTIVE",
  IN_PROGRESS = "IN_PROGRESS",
  PAUSED = "PAUSED",
  IN_REVIEW = "IN_REVIEW",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED"
}

export enum AssignmentStatus {
  ASSIGNED = "ASSIGNED",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}

export enum ActivityType {
  CONTAINER_UNLOADING = 'CONTAINER_UNLOADING',
  CONTAINER_LOADING = 'CONTAINER_LOADING',
  WRAPPING = 'WRAPPING',
  REPACKING = 'REPACKING',
  CROSSING = 'CROSSING',
  LABELING = 'LABELING',
  OTHER = 'OTHER'
}

export enum PricingMethod {
  HOURLY = 'HOURLY',
  PER_CARTON = 'PER_CARTON',
  PER_PIECE = 'PER_PIECE',
  PER_ARTICLE = 'PER_ARTICLE',
  QUANTITY = 'QUANTITY'
}

export interface CustomerPricingRule {
  id: string;
  customerId: string;
  customerActivityId?: string | null;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface BillingLineItem {
  id: string;
  customerId: string;
  orderId: string;
  assignmentId?: string | null;
  containerEmployeeId?: string | null;
  method: PricingMethod;
  quantity: number;
  rate: number;
  lineTotal: number;
  currency: string;
  computedAt: string;
  assignment?: {
    id: string;
    employeeId: string;
    employee?: { firstName?: string | null; lastName?: string | null };
    customerActivity?: { id: string; name: string; selectedPricingType?: string | null } | null;
  } | null;
  containerEmployee?: {
    id: string;
    employeeId: string;
    containerId: string;
  } | null;
}

export interface OrderBillingSummary {
  orderId: string;
  actualHours: number | null;
  hourlyRate: number | null;
  lineItems: BillingLineItem[];
  totalByMethod: Record<PricingMethod, number>;
  grandTotal: number;
  currency: string;
}

export interface DescriptionData {
  [key: string]: string;
}

export interface CustomerPriceTier {
  id: string;
  customerId: string;
  customerActivityId: string;
  minQuantity: number;
  maxQuantity: number;
  price: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  description?: string;
  descriptionData?: {
    descriptionData: DescriptionData;
  };
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  duration?: number | null;
  location?: string;
  requiredEmployees: number;
  priority: number;
  specialInstructions?: string;
  status: OrderStatus;
  teamId?: string | null;
  usesTemplate?: boolean;
  cartonQuantity?: number;
  articleQuantity?: number;
  pieceQuantity?: number;
  customerId: string;
  createdAt: string;
  updatedAt: string;
  employeeAssignments?: Array<{
    id: string;
    employeeId: string;
    status: AssignmentStatus;
    employee: {
      firstName: string;
      lastName: string;
      employeeCode: string;
    };
  }>;
  createdBy?: string;
  updatedBy?: string;
  customer?: {
    id: string;
    companyName: string;
  };
}

export interface CreateOrderData {
  orderNumber?: string;
  description?: string;
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  duration?: number | null;
  location?: string;
  requiredEmployees?: number;
  priority?: number;
  specialInstructions?: string;
  status?: OrderStatus;
  customerId: string;
  assignedEmployeeIds?: string[];
  teamId?: string;
  activities?: Array<{
    activityId: string;
    quantity: number;
  }>;
  cartonQuantity?: number;
  articleQuantity?: number;
  pieceQuantity?: number;
  templateData?: Record<string, string> | null;
  qualifications?: Array<{
    qualificationId: string;
    activityId?: string;
    quantity: number;
    required?: boolean;
  }>;
}

export interface UpdateOrderData {
  orderNumber?: string;
  description?: string;
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  duration?: number | null;
  location?: string;
  requiredEmployees?: number;
  priority?: number;
  specialInstructions?: string;
  status?: OrderStatus;
  customerId?: string;
  assignedEmployeeIds?: string[];
  teamId?: string | null;
  activities?: Array<{
    activityId: string;
    quantity: number;
  }>;
  cartonQuantity?: number;
  articleQuantity?: number;
  pieceQuantity?: number;
  templateData?: Record<string, string> | null;
}