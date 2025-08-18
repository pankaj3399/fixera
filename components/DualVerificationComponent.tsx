'use client'


import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Phone, ArrowLeft, CheckCircle, Clock, Shield, Smartphone, AtSign } from "lucide-react"
import { toast } from "sonner"

interface DualVerificationProps {
  email: string;
  phone: string;
  onVerificationSuccess: () => void;
  onBack: () => void;
}

interface VerificationState {
  emailVerified: boolean;
  phoneVerified: boolean;
  emailOTP: string;
  phoneOTP: string;
  emailLoading: boolean;
  phoneLoading: boolean;
  emailResendLoading: boolean;
  phoneResendLoading: boolean;
  emailResendDisabled: boolean;
  phoneResendDisabled: boolean;
  emailResendTime: number;
  phoneResendTime: number;
}

const DualVerificationComponent: React.FC<DualVerificationProps> = ({
  email,
  phone,
  onVerificationSuccess,
  onBack
}) => {
 
  const [verificationState, setVerificationState] = useState<VerificationState>({
    emailVerified: false,
    phoneVerified: false,
    emailOTP: "",
    phoneOTP: "",
    emailLoading: false,
    phoneLoading: false,
    emailResendLoading: false,
    phoneResendLoading: false,
    emailResendDisabled: true,
    phoneResendDisabled: true,
    emailResendTime: 60,
    phoneResendTime: 60
  });

  // Countdown timers for resend buttons
  useEffect(() => {
    const emailTimer = setInterval(() => {
      setVerificationState(prev => {
        if (prev.emailResendTime > 0) {
          return { ...prev, emailResendTime: prev.emailResendTime - 1 };
        } else {
          return { ...prev, emailResendDisabled: false };
        }
      });
    }, 1000);

    const phoneTimer = setInterval(() => {
      setVerificationState(prev => {
        if (prev.phoneResendTime > 0) {
          return { ...prev, phoneResendTime: prev.phoneResendTime - 1 };
        } else {
          return { ...prev, phoneResendDisabled: false };
        }
      });
    }, 1000);

    return () => {
      clearInterval(emailTimer);
      clearInterval(phoneTimer);
    };
  }, []);

  // Check if both verifications are complete
  useEffect(() => {
    if (verificationState.emailVerified && verificationState.phoneVerified) {
      toast.success("Both email and phone verified successfully!");
      setTimeout(() => {
        onVerificationSuccess();
      }, 1500);
    }
  }, [verificationState.emailVerified, verificationState.phoneVerified, onVerificationSuccess]);

  const sendEmailOTP = async () => {
    setVerificationState(prev => ({ ...prev, emailResendLoading: true }));
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/verify-email/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success("Email verification code sent!");
        setVerificationState(prev => ({ 
          ...prev, 
          emailResendDisabled: true, 
          emailResendTime: 60 
        }));
      } else {
        toast.error(data.message || "Failed to send email OTP");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send email OTP");
    } finally {
      setVerificationState(prev => ({ ...prev, emailResendLoading: false }));
    }
  };

  const sendPhoneOTP = async () => {
    setVerificationState(prev => ({ ...prev, phoneResendLoading: true }));
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/verify-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({ phone })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success("Phone verification code sent!");
        setVerificationState(prev => ({ 
          ...prev, 
          phoneResendDisabled: true, 
          phoneResendTime: 60 
        }));
      } else {
        toast.error(data.message || "Failed to send phone OTP");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send phone OTP");
    } finally {
      setVerificationState(prev => ({ ...prev, phoneResendLoading: false }));
    }
  };

  const verifyEmailOTP = async () => {
    if (!verificationState.emailOTP) {
      toast.error("Please enter the email verification code");
      return;
    }
    

    setVerificationState(prev => ({ ...prev, emailLoading: true }));
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/verify-email/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({
          email,
          otp: verificationState.emailOTP
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success("Email verified successfully!");
        setVerificationState(prev => ({ ...prev, emailVerified: true }));
      } else {
        toast.error(data.message || "Invalid email verification code");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to verify email");
    } finally {
      setVerificationState(prev => ({ ...prev, emailLoading: false }));
    }
  };

  const verifyPhoneOTP = async () => {
    if (!verificationState.phoneOTP) {
      toast.error("Please enter the phone verification code");
      return;
    }

    setVerificationState(prev => ({ ...prev, phoneLoading: true }));
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/verify-phone-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({
          phone,
          otp: verificationState.phoneOTP
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success("Phone verified successfully!");
        setVerificationState(prev => ({ ...prev, phoneVerified: true }));
      } else {
        toast.error(data.message || "Invalid phone verification code");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to verify phone");
    } finally {
      setVerificationState(prev => ({ ...prev, phoneLoading: false }));
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    let progress = 0;
    if (verificationState.emailVerified) progress += 50;
    if (verificationState.phoneVerified) progress += 50;
    return progress;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="absolute top-6 left-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-blue-100 rounded-full">
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Secure Your Account</h1>
          <p className="text-gray-600 text-lg">
            Complete the two-step verification process to activate your account
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Verification Progress</span>
            <span className="text-sm text-gray-600">{getProgressPercentage()}% Complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${getProgressPercentage()}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>Email Verification</span>
            <span>Phone Verification</span>
          </div>
        </div>

        {/* Verification Cards */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Email Verification Card */}
          <Card className={`relative overflow-hidden transition-all duration-300 ${
            verificationState.emailVerified 
              ? 'ring-2 ring-green-500 shadow-lg bg-green-50' 
              : 'hover:shadow-lg border-2 border-transparent hover:border-blue-200'
          }`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-blue-100 to-transparent rounded-bl-3xl"></div>
            
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${verificationState.emailVerified ? 'bg-green-100' : 'bg-blue-100'}`}>
                  {verificationState.emailVerified ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <AtSign className="h-6 w-6 text-blue-600" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-lg">Email Verification</CardTitle>
                  <CardDescription className="text-sm">Verify your email address</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Verification code sent to:</p>
                <p className="font-medium text-gray-900 break-all">{email}</p>
              </div>

              {!verificationState.emailVerified ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email-otp" className="text-sm font-medium">
                      Enter 6-digit verification code
                    </Label>
                    <Input
                      id="email-otp"
                      type="text"
                      placeholder="000000"
                      value={verificationState.emailOTP}
                      onChange={(e) => setVerificationState(prev => ({ 
                        ...prev, 
                        emailOTP: e.target.value.replace(/\D/g, '').slice(0, 6) 
                      }))}
                      className="text-center text-xl font-mono tracking-[0.3em] h-12"
                      maxLength={6}
                    />
                  </div>

                  <div className="space-y-3">
                    <Button
                      onClick={verifyEmailOTP}
                      disabled={verificationState.emailLoading || !verificationState.emailOTP}
                      className="w-full h-11 bg-blue-600 hover:bg-blue-700"
                      size="lg"
                    >
                      {verificationState.emailLoading ? "Verifying..." : "Verify Email"}
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={sendEmailOTP}
                      disabled={verificationState.emailResendDisabled || verificationState.emailResendLoading}
                      className="w-full"
                      size="sm"
                    >
                      {verificationState.emailResendLoading ? (
                        "Sending..."
                      ) : verificationState.emailResendDisabled ? (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Resend code in {formatTime(verificationState.emailResendTime)}
                        </div>
                      ) : (
                        "Resend verification code"
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-3" />
                  <p className="text-green-600 font-semibold text-lg">Email Verified!</p>
                  <p className="text-green-600 text-sm">Your email has been successfully verified</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Phone Verification Card */}
          <Card className={`relative overflow-hidden transition-all duration-300 ${
            verificationState.phoneVerified 
              ? 'ring-2 ring-green-500 shadow-lg bg-green-50' 
              : 'hover:shadow-lg border-2 border-transparent hover:border-indigo-200'
          }`}>
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-indigo-100 to-transparent rounded-bl-3xl"></div>
            
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${verificationState.phoneVerified ? 'bg-green-100' : 'bg-indigo-100'}`}>
                  {verificationState.phoneVerified ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <Smartphone className="h-6 w-6 text-indigo-600" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-lg">Phone Verification</CardTitle>
                  <CardDescription className="text-sm">Verify your phone number</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Verification code sent to:</p>
                <p className="font-medium text-gray-900">{phone}</p>
              </div>

              {!verificationState.phoneVerified ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="phone-otp" className="text-sm font-medium">
                      Enter 6-digit verification code
                    </Label>
                    <Input
                      id="phone-otp"
                      type="text"
                      placeholder="000000"
                      value={verificationState.phoneOTP}
                      onChange={(e) => setVerificationState(prev => ({ 
                        ...prev, 
                        phoneOTP: e.target.value.replace(/\D/g, '').slice(0, 6) 
                      }))}
                      className="text-center text-xl font-mono tracking-[0.3em] h-12"
                      maxLength={6}
                    />
                  </div>

                  <div className="space-y-3">
                    <Button
                      onClick={verifyPhoneOTP}
                      disabled={verificationState.phoneVerified || verificationState.phoneLoading || !verificationState.phoneOTP}
                      className="w-full h-11 bg-indigo-600 hover:bg-indigo-700"
                      size="lg"
                    >
                      {verificationState.phoneLoading ? "Verifying..." : "Verify Phone"}
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={sendPhoneOTP}
                      disabled={verificationState.phoneResendDisabled || verificationState.phoneResendLoading}
                      className="w-full"
                      size="sm"
                    >
                      {verificationState.phoneResendLoading ? (
                        "Sending..."
                      ) : verificationState.phoneResendDisabled ? (
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Resend code in {formatTime(verificationState.phoneResendTime)}
                        </div>
                      ) : (
                        "Resend verification code"
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-3" />
                  <p className="text-green-600 font-semibold text-lg">Phone Verified!</p>
                  <p className="text-green-600 text-sm">Your phone number has been successfully verified</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Final Success State */}
        {verificationState.emailVerified && verificationState.phoneVerified && (
          <div className="mt-8 text-center">
            <div className="p-6 bg-green-50 border-2 border-green-200 rounded-xl">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h3 className="text-xl font-bold text-green-800 mb-2">Verification Complete!</h3>
              <p className="text-green-700">Both your email and phone have been successfully verified. Redirecting you now...</p>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Having trouble? Check your spam folder or contact support for assistance.
          </p>
        </div>
      </div>
    </div>
  )
}

export default DualVerificationComponent