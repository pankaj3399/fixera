export interface ChatUserSummary {
  _id: string;
  name?: string;
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

export interface ChatConversation {
  _id: string;
  customerId: ChatUserSummary;
  professionalId: ChatUserSummary;
  initiatedBy: string;
  status: "active" | "archived";
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

export interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: ChatUserSummary;
  senderRole: "customer" | "professional";
  text?: string;
  images: string[];
  attachments?: ChatAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationInfoStats {
  totalBookings: number;
  completedBookings: number;
  avgCustomerRating: number;
  avgCommunication: number;
  avgValueOfDelivery: number;
  avgQualityOfService: number;
  avgProfessionalRating: number;
}

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
