"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Star, MapPin, Calendar, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

const StarRating = ({ rating, label }: { rating: number; label?: string }) => {
  if (!rating || rating === 0) return null;

  return (
    <div className="flex items-center justify-between">
      {label && <span className="text-[11px] text-gray-500 shrink-0">{label}</span>}
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= Math.round(rating)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-200"
            }`}
          />
        ))}
        <span className="text-[11px] text-gray-600 ml-1">{rating.toFixed(1)}</span>
      </div>
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

  const isProfessionalViewing = currentUserRole === "professional";
  const isCustomerViewing = currentUserRole === "customer";

  // Link to professional profile page
  const profileUrl = isCustomerViewing && other?._id
    ? `/professional/${other._id}`
    : undefined;

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

        {profileUrl && (
          <Button asChild variant="default" size="sm" className="mt-3 bg-indigo-600 hover:bg-indigo-700">
            <Link href={profileUrl}>
              <ExternalLink className="h-3 w-3 mr-1.5" />
              View Profile
            </Link>
          </Button>
        )}
      </div>

      {/* Ratings Section */}
      {stats && (
        <>
          {/* When customer views professional: show 3 category ratings */}
          {isCustomerViewing && stats.avgCustomerRating > 0 && (
            <>
              <div className="border-t border-slate-200 mx-4" />
              <div className="p-4 space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Professional Ratings</h4>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= Math.round(stats.avgCustomerRating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{stats.avgCustomerRating.toFixed(1)}</span>
                </div>
                <StarRating rating={stats.avgCommunication} label="Communication" />
                <StarRating rating={stats.avgValueOfDelivery} label="Value of Delivery" />
                <StarRating rating={stats.avgQualityOfService} label="Quality of Service" />
              </div>
            </>
          )}

          {/* When professional views customer: show customer's avg rating from professionals */}
          {isProfessionalViewing && stats.avgProfessionalRating > 0 && (
            <>
              <div className="border-t border-slate-200 mx-4" />
              <div className="p-4 space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer Rating</h4>
                <p className="text-[11px] text-gray-400">Average from professionals</p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= Math.round(stats.avgProfessionalRating)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{stats.avgProfessionalRating.toFixed(1)}</span>
                </div>
              </div>
            </>
          )}
        </>
      )}

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

            {stats.totalBookings === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">No bookings between you yet</p>
            )}
          </div>
        </>
      )}

    </div>
  );
}
