/**
 * Signup OTP resend cooldown (UX only).
 *
 * This is a *resend cooldown*, not an OTP validity window. Server-side OTP
 * validity is untouched: email OTPs expire after 10 minutes on the server and
 * phone OTPs use the Twilio provider TTL. Do not use this constant for 2FA,
 * password reset, or any validity check.
 */
export const SIGNUP_OTP_RESEND_COOLDOWN_SECONDS = 120;

export interface OtpResendState {
  disabled: boolean;
  remainingSeconds: number;
}

/** Fresh cooldown: resend disabled for the full window. */
export function initialOtpResendState(): OtpResendState {
  return { disabled: true, remainingSeconds: SIGNUP_OTP_RESEND_COOLDOWN_SECONDS };
}

/** One elapsed second. Enables resend exactly when the window reaches zero. */
export function tickOtpResend(state: OtpResendState): OtpResendState {
  if (state.remainingSeconds <= 0) {
    return { disabled: false, remainingSeconds: 0 };
  }
  const remainingSeconds = state.remainingSeconds - 1;
  return remainingSeconds <= 0
    ? { disabled: false, remainingSeconds: 0 }
    : { disabled: true, remainingSeconds };
}

/** Restart the cooldown after a (re)send. */
export function restartOtpResend(): OtpResendState {
  return initialOtpResendState();
}

/**
 * Deadline (epoch ms) for a cooldown started at `now`. Countdowns derive the
 * remaining time from this deadline rather than counting interval ticks, so
 * throttled timers in a hidden tab cannot stretch the wait past the window.
 */
export function otpResendDeadline(now: number = Date.now()): number {
  return now + SIGNUP_OTP_RESEND_COOLDOWN_SECONDS * 1000;
}

/** Resend state at `now` for a deadline; `null` means no cooldown running. */
export function otpResendStateAt(deadline: number | null, now: number = Date.now()): OtpResendState {
  if (deadline == null || !Number.isFinite(deadline)) {
    return { disabled: false, remainingSeconds: 0 };
  }
  const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return remainingSeconds > 0
    ? { disabled: true, remainingSeconds }
    : { disabled: false, remainingSeconds: 0 };
}

/** mm:ss label for the resend countdown. */
export function formatOtpCooldown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
