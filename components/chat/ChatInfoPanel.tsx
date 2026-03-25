"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Star, MapPin, Calendar, User, Clock, Award, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

const formatResponseTime = (ms: number): string => {
  if (ms <= 0) return "N/A";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};

const LEVEL_COLORS: Record<string, string> = {
  "New": "bg-gray-100 text-gray-600",
  "Level 1": "bg-blue-100 text-blue-700",
  "Level 2": "bg-green-100 text-green-700",
  "Level 3": "bg-purple-100 text-purple-700",
  "Expert": "bg-amber-100 text-amber-700",
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
      <div className="p-4 space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-gray-200/70 animate-pulse" />
          <div className="h-5 w-32 rounded bg-gray-200/70 animate-pulse" />
          <div className="h-3 w-24 rounded bg-gray-200/70 animate-pulse" />
        </div>
        <div className="space-y-3 pt-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-4 w-4 rounded bg-gray-200/70 animate-pulse" />
              <div className="h-4 flex-1 rounded bg-gray-200/70 animate-pulse" />
            </div>
          ))}
        </div>
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-gray-700">Info</h3>
      </div>

      {/* Profile Section */}
      <div className="p-4 flex flex-col items-center text-center">
        <Avatar className="h-16 w-16 mb-3">
          {other?.profileImage ? (
            <img src={other.profileImage} alt="" className="h-full w-full object-cover rounded-full" />
          ) : (
            <AvatarFallback className="bg-indigo-100 text-indigo-600 text-xl">
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
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

        {isCustomerViewing && other?._id && (
          <Button asChild variant="outline" size="sm" className="mt-3 w-full text-xs">
            <Link href={`/professional/${other._id}`}>
              <User className="h-3 w-3 mr-1.5" />
              View Full Profile
            </Link>
          </Button>
        )}
      </div>

      {/* Professional Level & Response Rate (when customer views professional) */}
      {isCustomerViewing && stats && (
        <>
          <div className="border-t border-slate-200 mx-4" />
          <div className="p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Professional Info</h4>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <Award className="h-3.5 w-3.5 text-indigo-500" />
                <span>Level</span>
              </div>
              <Badge className={`text-[10px] ${LEVEL_COLORS[stats.professionalLevel] || "bg-gray-100 text-gray-600"}`}>
                {stats.professionalLevel}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <Clock className="h-3.5 w-3.5 text-indigo-500" />
                <span>Avg. Response</span>
              </div>
              <span className="text-xs font-medium text-gray-700">
                {formatResponseTime(stats.avgResponseTimeMs)}
              </span>
            </div>
          </div>
        </>
      )}

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

      {/* Pending Orders */}
      {stats && stats.pendingBookings && stats.pendingBookings.length > 0 && (
        <>
          <div className="border-t border-slate-200 mx-4" />
          <div className="p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              Pending Orders
            </h4>

            <div className="space-y-2">
              {stats.pendingBookings.map((booking) => (
                <div
                  key={booking.bookingNumber}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-800">{booking.bookingNumber}</span>
                    <Badge
                      className={cn(
                        "text-[9px]",
                        booking.status === "in_progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {booking.status === "in_progress" ? "In Progress" : "Booked"}
                    </Badge>
                  </div>
                  {booking.preferredStartDate && (
                    <p className="text-[10px] text-gray-500">
                      Start: {new Date(booking.preferredStartDate).toLocaleDateString()}
                    </p>
                  )}
                  {booking.estimatedDuration && (
                    <p className="text-[10px] text-gray-500">
                      Duration: {booking.estimatedDuration}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
