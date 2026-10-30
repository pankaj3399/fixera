"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Menu, X, User, LogOut, MessageSquare, LifeBuoy, Heart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useAdminUnreadCount } from "@/hooks/useAdminUnreadCount";
import NotificationBell from "@/components/notifications/NotificationBell";
import LocaleCurrencySwitcher from "@/components/locale/LocaleCurrencySwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import TierBadge from "@/components/dashboard/TierBadge";
import { useTierColors } from "@/lib/tierColors";

const otherLinks = [
  { key: "forProfessionals", href: "/professionals" },
  { key: "services", href: "/services" },
  { key: "about", href: "/about" },
] as const;

const Navbar = ({ stacked = false }: { stacked?: boolean }) => {
  const t = useTranslations("nav");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  // Portals need a client-only mount to keep SSR and hydration identical.
  const [portalReady, setPortalReady] = useState(false);
  const { user, isAuthenticated, logout, loading } = useAuth();
  const { unreadCount, enabled: showChatIcon } = useUnreadCount();
  const { unreadCount: adminUnreadCount, enabled: showAdminChatIcon } = useAdminUnreadCount();
  const { tierColor, levelColor } = useTierColors();
  const levelLabel =
    user?.role === "customer"
      ? user.loyaltyLevel || "Bronze"
      : user?.role === "professional"
        ? user.professionalLevel || "New"
        : null;
  // Task 14b: the level/tier tag uses the configured colour.
  const levelTagColor =
    user?.role === "customer"
      ? tierColor(levelLabel)
      : user?.role === "professional"
        ? levelColor(levelLabel)
        : null;

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = window.scrollY > 20;
      setIsScrolled((current) => (current === next ? current : next));
    };
    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isMenuOpen]);

  return (
    <>
      <header
        className={cn(
          "w-full transition-all duration-300",
          stacked
            ? cn(
                "relative bg-white border-b border-gray-100",
                isScrolled && "shadow-sm",
              )
            : "fixed top-0 z-50",
          !stacked &&
            (isScrolled
              ? "bg-white/95 backdrop-blur-lg shadow-lg border-b border-gray-100"
              : "bg-white/80 backdrop-blur-sm"),
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center shrink-0" aria-label={t("homeLabel")}>
              <Image
                src="/fixtract-logo.png"
                alt="Fixtract — Find. Hire. Build."
                width={178}
                height={54}
                className="h-10 w-auto sm:h-11"
                priority
              />
            </Link>

            {/* --- Desktop Navigation --- */}
            <nav className="hidden lg:flex items-center space-x-8">
              {otherLinks.map((link) => (
                <Link
                  key={link.key}
                  href={link.href}
                  className="text-gray-700 hover:text-blue-600 transition-colors font-medium text-base"
                >
                  {t(link.key)}
                </Link>
              ))}
            </nav>

            <div className="hidden lg:flex items-center space-x-2">
              <LocaleCurrencySwitcher />
              <div className="h-5 w-px bg-gray-200" aria-hidden />
              {loading ? (
                <div className="flex items-center space-x-2" aria-hidden>
                  <div className="h-9 w-16 rounded-md bg-gray-100 animate-pulse" />
                  <div className="h-9 w-14 rounded-md bg-gray-100 animate-pulse" />
                </div>
              ) : (
                <>
                  {isAuthenticated ? (
                    <>
                      {user?.role === "customer" && (
                        <Link
                          href="/dashboard/favorites"
                          className="relative inline-flex items-center justify-center h-8 w-8 rounded-full text-gray-600 hover:text-pink-600 hover:bg-gray-100 transition-colors"
                          aria-label={t("favorites")}
                        >
                          <Heart className="h-5 w-5" />
                        </Link>
                      )}
                      {showChatIcon && (
                        <Link
                          href="/chat"
                          className="relative inline-flex items-center justify-center h-8 w-8 rounded-full text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                          aria-label={t("messages")}
                        >
                          <MessageSquare className="h-5 w-5" />
                          {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                        </Link>
                      )}
                      {showAdminChatIcon && (
                        <Link
                          href="/admin/chat"
                          className="relative inline-flex items-center justify-center h-8 w-8 rounded-full text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                          aria-label={t("supportChat")}
                        >
                          <MessageSquare className="h-5 w-5" />
                          {adminUnreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                              {adminUnreadCount > 99 ? "99+" : adminUnreadCount}
                            </span>
                          )}
                        </Link>
                      )}
                      <NotificationBell />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-blue-100 text-blue-600">
                                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56" align="end" forceMount>
                          <DropdownMenuLabel className="font-normal">
                            <div className="flex flex-col space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium leading-none">{user?.name}</p>
                                {levelLabel && (
                                  <TierBadge level={levelLabel} color={levelTagColor} className="h-5 px-2 text-[10px]" />
                                )}
                              </div>
                              <p className="text-xs leading-none text-muted-foreground">
                                {user?.email}
                              </p>
                            </div>
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href="/dashboard">
                              <User className="mr-2 h-4 w-4" />
                              <span>{t("dashboard")}</span>
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/profile">
                              <User className="mr-2 h-4 w-4" />
                              <span>{t("profile")}</span>
                            </Link>
                          </DropdownMenuItem>
                          {(user?.role === "customer" || user?.role === "professional") && (
                            <DropdownMenuItem asChild>
                              <Link href="/dashboard/benefits">
                                <User className="mr-2 h-4 w-4" />
                                <span>{t("benefitsProgram")}</span>
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {(user?.role === "customer" || user?.role === "professional") && (
                            <DropdownMenuItem asChild>
                              <Link href="/support">
                                <LifeBuoy className="mr-2 h-4 w-4" />
                                <span>{t("support")}</span>
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={logout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>{t("logOut")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : (
                    <>
                      <Button asChild variant="ghost">
                        <Link href="/login">{t("signIn")}</Link>
                      </Button>
                      <Button asChild>
                        <Link href="/join">{t("join")}</Link>
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              className="lg:hidden p-2"
              onClick={() => setIsMenuOpen(true)}
              aria-label={t("openMenu")}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* --- Mobile Sidebar --- */}
      {/* Portalled to <body>: the header is a fixed z-50 stacking context, so an
          inline drawer can never get above the cookie banner (z-100). */}
      {portalReady &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className={cn(
                "fixed inset-0 bg-black/50 z-[101] lg:hidden",
                isMenuOpen ? "opacity-100 visible" : "opacity-0 invisible",
              )}
              onClick={() => setIsMenuOpen(false)}
            />
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-sm bg-white z-[102] lg:hidden transition-transform duration-300 ease-in-out flex flex-col",
          isMenuOpen ? "transform-none" : "translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <span className="font-bold text-lg">{t("menu")}</span>
          <button onClick={() => setIsMenuOpen(false)} aria-label={t("closeMenu")}>
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="flex-grow p-4 space-y-2 overflow-y-auto">
          {otherLinks.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className="block p-2 text-lg font-medium text-gray-800 hover:text-blue-600 rounded-lg hover:bg-gray-50 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              {t(link.key)}
            </Link>
          ))}
          {isAuthenticated && user?.role === "customer" && (
            <>
              <hr className="my-2" />
              <Link
                href="/dashboard/favorites"
                className="flex items-center gap-2 p-2 text-lg font-medium text-gray-800 hover:text-pink-600 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                <Heart className="h-5 w-5" />
                {t("favorites")}
              </Link>
            </>
          )}
          {showChatIcon && (
            <>
              <hr className="my-2" />
              <Link
                href="/chat"
                className="flex items-center justify-between p-2 text-lg font-medium text-gray-800 hover:text-blue-600 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {t("messages")}
                </span>
                {unreadCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            </>
          )}
          {showAdminChatIcon && (
            <>
              <hr className="my-2" />
              <Link
                href="/admin/chat"
                className="flex items-center justify-between p-2 text-lg font-medium text-gray-800 hover:text-blue-600 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  {t("supportChat")}
                </span>
                {adminUnreadCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                    {adminUnreadCount > 99 ? "99+" : adminUnreadCount}
                  </span>
                )}
              </Link>
            </>
          )}
          <hr className="my-2" />
        </nav>
        <div className="p-4 border-t space-y-3 bg-gray-50">
          <LocaleCurrencySwitcher variant="mobile" />
          {!loading && (
            <>
              {isAuthenticated ? (
                <>
                <div className="flex items-center space-x-3 p-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-blue-100 text-blue-600">
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                        {levelLabel && (
                          <TierBadge level={levelLabel} color={levelTagColor} className="h-5 px-2 text-[10px]" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                </div>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard">{t("dashboard")}</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/profile">{t("profile")}</Link>
                  </Button>
                  {(user?.role === "customer" || user?.role === "professional") && (
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/dashboard/benefits">{t("benefitsProgram")}</Link>
                    </Button>
                  )}
                  {(user?.role === "customer" || user?.role === "professional") && (
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/support">{t("support")}</Link>
                    </Button>
                  )}
                  <Button onClick={logout} variant="outline" className="w-full">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t("logOut")}
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/login">{t("signIn")}</Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/join">{t("join")}</Link>
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
          </>,
          document.body
        )}
    </>
  );
};

export default Navbar;
