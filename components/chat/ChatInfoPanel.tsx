"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Star, MapPin, Calendar, User, Clock, Award, Briefcase, Tag, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchConversationInfo } from "@/lib/chatApi";
import { useFormatLocale } from "@/lib/i18n/useFormatLocale";
import type { ChatConversation, ConversationInfoStats } from "@/types/chat";
import {
  getLevelColor,
  getAdminTagStyle,
  formatAdminTagLabel,
  formatResponseTime,
} from "@/lib/professionalLevel";

interface ChatInfoPanelProps {
  conversationId: string;
  conversation: ChatConversation | null;
  currentUserRole: string | undefined;
}

const getOtherParticipant = (conversation: ChatConversation, role?: string) => {
  if (conversation.type === "support") {
    return role === "admin" ? conversation.supportTargetUserId : conversation.supportAdminId;
  }
  if (role === "professional") return conversation.customerId;
  return conversation.professionalId;
};

const PROFESSIONAL_LEVEL_KEYS = {
  new: "info.professionalLevels.new",
  "level 1": "info.professionalLevels.level1",
  "level 2": "info.professionalLevels.level2",
  "level 3": "info.professionalLevels.level3",
  expert: "info.professionalLevels.expert",
} as const;

const ADMIN_TAG_KEYS = {
  verified: "info.adminTags.verified",
  "our choice": "info.adminTags.ourChoice",
} as const;

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
  const t = useTranslations("chat");
  const { intl } = useFormatLocale();
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

  if (displayConversation.type === "support") {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-gray-700">{t("info.title")}</h3>
        </div>
        <div className="p-4 flex flex-col items-center text-center">
          <div className="h-16 w-16 mb-3 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900">{t("common.fixtractSupport")}</p>
          <Badge variant="secondary" className="mt-1 text-[10px] bg-indigo-100 text-indigo-700">
            {t("common.official")}
          </Badge>
          <p className="mt-3 text-xs text-gray-500 leading-relaxed">
            {t("info.supportDescription")}
          </p>
        </div>
      </div>
    );
  }

  const other = getOtherParticipant(displayConversation, currentUserRole);
  const name = other?.username || other?.name || t("common.user");
  const location = [other?.businessInfo?.city, other?.businessInfo?.country].filter(Boolean).join(", ");
  const memberSince = other?.createdAt
    ? new Date(other.createdAt).toLocaleDateString(intl, { month: "long", year: "numeric" })
    : null;

  const isProfessionalViewing = currentUserRole === "professional";
  const isCustomerViewing = currentUserRole === "customer";
  const levelKey = stats?.professionalLevel
    ? PROFESSIONAL_LEVEL_KEYS[stats.professionalLevel.toLowerCase() as keyof typeof PROFESSIONAL_LEVEL_KEYS]
    : undefined;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-gray-700">{t("info.title")}</h3>
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

        {location && (
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
            <MapPin className="h-3 w-3" />
            <span>{location}</span>
          </div>
        )}

        {memberSince && (
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
            <Calendar className="h-3 w-3" />
            <span>{t("info.memberSince", { date: memberSince })}</span>
          </div>
        )}

        {isCustomerViewing && other?._id && (
          <div className="mt-3 grid w-full gap-2">
            <Button asChild variant="outline" size="sm" className="w-full text-xs">
              <Link href={`/professional/${other._id}`}>
                <User className="h-3 w-3 mr-1.5" />
                {t("info.viewProfile")}
              </Link>
            </Button>
            {stats?.pendingBookings?.[0]?.bookingId && (
              <Button asChild size="sm" className="w-full text-xs bg-indigo-600 hover:bg-indigo-700">
                <Link href={`/bookings/${stats.pendingBookings[0].bookingId}`}>
                  <Briefcase className="h-3 w-3 mr-1.5" />
                  {t("info.openBooking")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Professional Level & Response Rate (when customer views professional) */}
      {isCustomerViewing && stats && (Boolean(stats.professionalLevel) || (stats.adminTags?.length ?? 0) > 0 || stats.avgResponseTimeMs > 0) && (
        <>
          <div className="border-t border-slate-200 mx-4" />
          <div className="p-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("info.professionalInfo")}</h4>

            {stats.professionalLevel && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Award className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{t("info.level")}</span>
                </div>
                <Badge className={`text-[10px] ${getLevelColor(stats.professionalLevel)}`}>
                  {levelKey ? t(levelKey) : stats.professionalLevel}
                </Badge>
              </div>
            )}

            {stats.adminTags && stats.adminTags.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-600 shrink-0">
                  <Tag className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{t("info.tags")}</span>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {stats.adminTags.map((tag) => {
                    const tagKey = ADMIN_TAG_KEYS[tag.toLowerCase() as keyof typeof ADMIN_TAG_KEYS];
                    return (
                      <Badge
                        key={tag}
                        variant="outline"
                        className={`text-[10px] ${getAdminTagStyle(tag)}`}
                      >
                        {tagKey ? t(tagKey) : formatAdminTagLabel(tag)}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {stats.avgResponseTimeMs > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Clock className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{t("info.avgResponse")}</span>
                </div>
                <span className="text-xs font-medium text-gray-700">
                  {formatResponseTime(stats.avgResponseTimeMs, intl)}
                </span>
              </div>
            )}
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
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("info.professionalRatings")}</h4>
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
                  <span className="text-xs text-gray-400">({stats.totalCustomerReviews})</span>
                </div>
                <StarRating rating={stats.avgCommunication} label={t("ratings.communication")} />
                <StarRating rating={stats.avgValueOfDelivery} label={t("ratings.valueOfDelivery")} />
                <StarRating rating={stats.avgQualityOfService} label={t("ratings.qualityOfService")} />
              </div>
            </>
          )}

          {/* When professional views customer: show customer's avg rating from professionals */}
          {isProfessionalViewing && stats.avgProfessionalRating > 0 && (
            <>
              <div className="border-t border-slate-200 mx-4" />
              <div className="p-4 space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("info.customerRating")}</h4>
                <p className="text-[11px] text-gray-400">{t("info.averageFromProfessionals")}</p>
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
                  <span className="text-xs text-gray-400">({stats.totalProfessionalReviews})</span>
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
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t("info.bookingHistory")}</h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-indigo-600">{stats.totalBookings}</p>
                <p className="text-[11px] text-gray-500">{t("info.totalBookings")}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-green-600">{stats.completedBookings}</p>
                <p className="text-[11px] text-gray-500">{t("info.completed")}</p>
              </div>
            </div>

            {stats.totalBookings === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">{t("info.noBookings")}</p>
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
              {t("info.pendingOrders")}
            </h4>

            <div className="space-y-2">
              {stats.pendingBookings.map((booking) => (
                <div
                  key={booking.bookingId || booking.bookingNumber}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"
                >
                  <div className="flex items-center justify-between mb-1">
                    {booking.bookingId ? (
                      <Link
                        href={`/bookings/${booking.bookingId}`}
                        className="text-xs font-medium text-indigo-700 hover:underline"
                      >
                        {booking.bookingNumber}
                      </Link>
                    ) : (
                      <span className="text-xs font-medium text-gray-800">{booking.bookingNumber}</span>
                    )}
                    <Badge
                      className={cn(
                        "text-[9px]",
                        booking.status === "in_progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {booking.status === "in_progress" ? t("info.inProgress") : t("info.booked")}
                    </Badge>
                  </div>
                  {booking.preferredStartDate && (
                    <p className="text-[10px] text-gray-500">
                      {t("info.start", { date: new Date(booking.preferredStartDate).toLocaleDateString(intl) })}
                    </p>
                  )}
                  {booking.estimatedDuration && (
                    <p className="text-[10px] text-gray-500">
                      {t("info.duration", { duration: booking.estimatedDuration })}
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
