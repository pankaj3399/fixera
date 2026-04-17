import type { ProfessionalLevel } from "@/lib/professionalLevel";

export interface ChatUserSummary {
  _id: string;
  name?: string;
  username?: string;
  email?: string;
  role?: "customer" | "professional" | "admin" | "visitor" | "employee" | string;
  profileImage?: string;
  createdAt?: string;
  businessInfo?: {
    companyName?: string;
    city?: string;
    country?: string;
  };
}

export interface ConversationLabel {
  userId: string;
  label: string;
  color?: string;
}

export interface ChatConversation {
  _id: string;
  customerId: ChatUserSummary;
  professionalId: ChatUserSummary;
  initiatedBy: string;
  status: "active" | "archived";
  starredBy: string[];
  archivedBy: string[];
  labels: ConversationLabel[];
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastMessageSenderId?: string;
  customerUnreadCount: number;
  professionalUnreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachment {
  url: string;
  fileName: string;
  fileType: "image" | "document" | "video";
  mimeType: string;
  fileSize?: number;
}

export interface ReviewNotificationMeta {
  bookingId: string;
  avgRating: number;
  communicationLevel: number;
  valueOfDelivery: number;
  qualityOfService: number;
  comment?: string;
  customerName: string;
}

export interface WarrantyNotificationMeta {
  claimId: string;
  claimNumber: string;
  bookingId?: string;
  status?: string;
}

export interface QuotationNotificationMeta {
  bookingId: string;
  quotationNumber: string;
  version: number;
  scope: string;
  totalAmount: number;
  currency: string;
  validUntil: string;
  status?: string;
}

export interface ReplyToMessage {
  _id: string;
  text?: string;
  senderId: ChatUserSummary;
  images?: string[];
  createdAt: string;
}

export interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: ChatUserSummary;
  senderRole: "customer" | "professional" | "system";
  messageType?: "text" | "review_notification" | "warranty_notification" | "quotation_notification";
  text?: string;
  images: string[];
  attachments?: ChatAttachment[];
  reviewMeta?: ReviewNotificationMeta;
  warrantyMeta?: WarrantyNotificationMeta;
  quotationMeta?: QuotationNotificationMeta;
  replyTo?: ReplyToMessage;
  createdAt: string;
  updatedAt: string;
}

export interface PendingBooking {
  bookingId: string | null;
  bookingNumber: string;
  status: string;
  preferredStartDate: string | null;
  estimatedDuration: string | null;
}

export interface ConversationInfoStats {
  totalBookings: number;
  completedBookings: number;
  avgCustomerRating: number;
  avgCommunication: number;
  avgValueOfDelivery: number;
  avgQualityOfService: number;
  avgProfessionalRating: number;
  totalCustomerReviews: number;
  totalProfessionalReviews: number;
  professionalLevel: ProfessionalLevel | "";
  adminTags: string[];
  avgResponseTimeMs: number;
  pendingBookings: PendingBooking[];
  absence: { from: string; to: string } | null;
}

export type ChatFilter = "all" | "unread" | "starred" | "archived" | string;

export interface ConversationListResponse {
  success: boolean;
  data?: {
    conversations: ChatConversation[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  msg?: string;
}

export interface MessageListResponse {
  success: boolean;
  data?: {
    conversation: ChatConversation;
    messages: ChatMessage[];
    pagination: {
      limit: number;
      hasMore: boolean;
      nextCursor: string | null;
    };
  };
  msg?: string;
}
