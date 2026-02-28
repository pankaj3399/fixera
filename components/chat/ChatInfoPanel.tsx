"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Star, MapPin, Calendar, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fetchConversationInfo } from "@/lib/chatApi";
import type { ChatConversation, ConversationInfoStats } from "@/types/chat";

interface ChatInfoPanelProps {
  conversationId: string;
  conversation: ChatConversation | null;
  currentUserRole: string | undefined;
}

const getOtherParticipant = (conversation: ChatConversation, role?: string) => {
  if (role === "professional") return conversation.customerId;
  return conversation.professionalId;
};

const maskEmail = (email: string): string => {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visiblePrefix = local.length > 0 ? local.charAt(0) : "";
  return `${visiblePrefix}***@${domain}`;
};

const StarRating = ({ rating }: { rating: number }) => {
  if (!rating || rating === 0) return <span className="text-xs text-gray-400">No ratings yet</span>;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${
            star <= Math.round(rating)
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-200"
          }`}
        />
      ))}
      <span className="text-xs text-gray-600 ml-1">{rating.toFixed(1)}</span>
    </div>
  );
};

export default function ChatInfoPanel({ conversationId, conversation, currentUserRole }: ChatInfoPanelProps) {
  const [stats, setStats] = useState<ConversationInfoStats | null>(null);
  const [infoConversation, setInfoConversation] = useState<ChatConversation | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchConversationInfo(conversationId);
      setStats(data.stats);
      setInfoConversation(data.conversation);
    } catch {
      // silently fail - info panel is supplementary
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  const displayConversation = infoConversation || conversation;
  if (!displayConversation) return null;

  const other = getOtherParticipant(displayConversation, currentUserRole);
  const name = other?.businessInfo?.companyName || other?.name || "User";
  const location = [other?.businessInfo?.city, other?.businessInfo?.country].filter(Boolean).join(", ");
  const memberSince = other?.createdAt
    ? new Date(other.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-gray-700">Info</h3>
      </div>

      {/* Profile Section */}
      <div className="p-4 flex flex-col items-center text-center">
        <Avatar className="h-16 w-16 mb-3">
          <AvatarFallback className="bg-indigo-100 text-indigo-600 text-xl">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <p className="text-sm font-semibold text-gray-900">{name}</p>
        {other?.email && (
          <p className="text-xs text-gray-500 mt-0.5" title={other.email}>
            {maskEmail(other.email)}
          </p>
        )}

        {location && (
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
            <MapPin className="h-3 w-3" />
            <span>{location}</span>
          </div>
        )}

        {memberSince && (
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
            <Calendar className="h-3 w-3" />
            <span>Member since {memberSince}</span>
          </div>
        )}

      </div>

      {/* Booking Stats */}
      {stats && (
        <>
          <div className="border-t border-slate-200 mx-4" />
          <div className="p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Booking History</h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-indigo-600">{stats.totalBookings}</p>
                <p className="text-[11px] text-gray-500">Total Bookings</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-green-600">{stats.completedBookings}</p>
                <p className="text-[11px] text-gray-500">Completed</p>
              </div>
            </div>

            {stats.avgCustomerRating > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Customer Rating</p>
                <StarRating rating={stats.avgCustomerRating} />
              </div>
            )}

            {stats.avgProfessionalRating > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Professional Rating</p>
                <StarRating rating={stats.avgProfessionalRating} />
              </div>
            )}

            {stats.totalBookings === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">No bookings between you yet</p>
            )}
          </div>
        </>
      )}

      {/* Booking Info */}
      {displayConversation.bookingId?.bookingNumber && (
        <>
          <div className="border-t border-slate-200 mx-4" />
          <div className="p-4 space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Booking</h4>
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">#{displayConversation.bookingId.bookingNumber}</span>
            </div>
            {displayConversation.bookingId.status && (
              <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 capitalize">
                {displayConversation.bookingId.status}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
